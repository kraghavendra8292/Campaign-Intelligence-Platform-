import type { AuthContext } from '@rk/types';
import { ANALYTICS_LIMITS, TERMINAL_ISSUE_STATUSES } from '@rk/types';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';
import { analyticsService, mean, median } from './analytics.service';
import {
  GEO_COLUMN,
  daysBetween,
  percentageChange,
  rate,
  type AnalyticsFilter,
  type AnalyticsScope,
} from './shared/analyticsFilters';

/**
 * Geographic issue intelligence.
 *
 * WHAT THIS IS: a rollup of submissions by the administrative area a citizen
 * named when reporting a problem - ward, locality or area, whichever the
 * organisation actually populates.
 *
 * WHAT IT IS DELIBERATELY NOT, and this is the file where the distinction
 * matters most:
 *
 *  - IT DOES NOT USE COORDINATES. `Issue` stores latitude and longitude when a
 *    citizen chose to share them, and nothing in this module reads those
 *    columns. A point map of submissions is a map of where individual people
 *    were standing when they reported something, sometimes their doorstep. The
 *    administrative question - "where are the drainage problems?" - is answered
 *    by the ward, and the ward is what this returns.
 *
 *  - IT DOES NOT RANK PEOPLE OR PLACES POLITICALLY. A ward at the top of this
 *    table has reported the most problems. That is a statement about
 *    infrastructure and about reporting behaviour. It is not a measure of
 *    support, opposition, turnout or anything else about the people who live
 *    there, and the output contains no field that could carry such a reading.
 *
 *  - THERE IS NO BOUNDARY DATA. The platform stores no polygons, no
 *    constituency shapes and no geocoding, so this renders as a ranked table
 *    and a density bar rather than a choropleth. Inventing boundaries to draw a
 *    prettier map would mean inventing the data underneath it.
 */

const OPEN_FILTER: Prisma.IssueWhereInput = {
  status: { notIn: [...TERMINAL_ISSUE_STATUSES] },
};

export const geoAnalyticsService = {
  /**
   * Ranked areas for the selected geographic level.
   *
   * Six aggregates, each a grouped count over an indexed window, stitched by
   * area name in memory. The alternative - one query per area - would be N+1
   * over a dimension whose size is the number of wards in a constituency.
   *
   * Submissions with no value at the selected level are counted under a single
   * "Not specified" row rather than dropped, so the column still sums to the
   * total shown on the overview card. A dashboard whose table does not add up
   * to its own headline is a dashboard nobody trusts twice.
   */
  async areas(auth: AuthContext, filter?: AnalyticsFilter | null, limit?: number | null) {
    const scope = analyticsService.scopeFor(auth, filter);
    const column = GEO_COLUMN[scope.geoLevel];

    const [current, previous, open, resolved, highPriorityOpen, resolutionRows] = await Promise.all(
      [
        groupByArea(scope.windowed, column),
        groupByArea(scope.previousWindowed, column),
        groupByArea({ ...scope.windowed, ...OPEN_FILTER }, column),
        groupByArea({ ...scope.windowed, resolvedAt: { not: null } }, column),
        groupByArea(
          { ...scope.windowed, ...OPEN_FILTER, priority: { in: ['HIGH', 'URGENT'] } },
          column,
        ),
        // Two timestamp columns plus the area name, bounded by the window, so the
        // per-area average can be computed without a query per area.
        prisma.issue.findMany({
          where: { ...scope.where, resolvedAt: { gte: scope.range.from, lt: scope.range.to } },
          select: { submittedAt: true, resolvedAt: true, [column]: true } as Record<
            string,
            boolean
          >,
        }),
      ],
    );

    const durationsByArea = new Map<string, number[]>();
    for (const row of resolutionRows as unknown as Array<
      Record<string, unknown> & { submittedAt: Date; resolvedAt: Date | null }
    >) {
      if (!row.resolvedAt) continue;
      if (row.resolvedAt.getTime() < row.submittedAt.getTime()) continue;
      const key = normaliseArea(row[column] as string | null);
      const list = durationsByArea.get(key) ?? [];
      list.push(daysBetween(row.submittedAt, row.resolvedAt));
      durationsByArea.set(key, list);
    }

    const total = [...current.values()].reduce((sum, count) => sum + count, 0);

    const rows = [...current.entries()].map(([key, count]) => {
      const openCount = open.get(key) ?? 0;
      const resolvedCount = resolved.get(key) ?? 0;
      const durations = durationsByArea.get(key) ?? [];

      return {
        key,
        label: key === UNSPECIFIED ? 'Not specified' : key,
        level: scope.geoLevel,
        count,
        sharePct: rate(count, total),
        previousCount: previous.get(key) ?? 0,
        changePct: percentageChange(count, previous.get(key) ?? 0),
        openCount,
        resolvedCount,
        highPriorityOpenCount: highPriorityOpen.get(key) ?? 0,
        // A rate computed from one or two submissions is noise presented as a
        // percentage. Below the threshold it is withheld rather than shown, and
        // the UI prints "—".
        resolutionRatePct:
          count >= ANALYTICS_LIMITS.minSamplesForRate ? rate(resolvedCount, count) : null,
        averageResolutionDays: mean(durations),
        resolvedSampleCount: durations.length,
      };
    });

    return rows
      .sort((a, b) => b.count - a.count)
      .slice(0, Math.min(Math.max(limit ?? ANALYTICS_LIMITS.topAreas, 1), 100));
  },

  /**
   * One area in depth.
   *
   * The `area` argument is a VALUE from the tenant's own data, matched exactly
   * against the selected level's column inside the tenant scope. It cannot
   * reach another organisation's rows: `scope.where` already pins
   * `organizationId`, and this only narrows it further.
   */
  async areaDetail(auth: AuthContext, area: string, filter?: AnalyticsFilter | null) {
    const scope = analyticsService.scopeFor(auth, filter);
    const column = GEO_COLUMN[scope.geoLevel];

    const value = area.trim();
    if (value.length === 0) {
      throw AppError.validation('Choose an area to view.', { details: { field: 'area' } });
    }

    // `UNSPECIFIED` is a display bucket, not a stored value, so it maps back to
    // a null/blank match rather than to a literal comparison.
    const areaWhere: Prisma.IssueWhereInput =
      value === UNSPECIFIED ? { [column]: null } : { [column]: value };

    const scoped: Prisma.IssueWhereInput = { ...scope.where, ...areaWhere };
    const windowed: Prisma.IssueWhereInput = { ...scope.windowed, ...areaWhere };

    const [total, open, resolved, previousTotal, categories, durations, recent] = await Promise.all(
      [
        prisma.issue.count({ where: windowed }),
        prisma.issue.count({ where: { ...scoped, ...OPEN_FILTER } }),
        prisma.issue.count({ where: { ...windowed, resolvedAt: { not: null } } }),
        prisma.issue.count({ where: { ...scope.previousWindowed, ...areaWhere } }),

        prisma.issue.groupBy({
          by: ['categoryId'],
          where: windowed,
          _count: { _all: true },
          orderBy: { _count: { categoryId: 'desc' } },
          take: 8,
        }),

        prisma.issue.findMany({
          where: { ...scoped, resolvedAt: { gte: scope.range.from, lt: scope.range.to } },
          select: { submittedAt: true, resolvedAt: true },
        }),

        /**
         * Recent submissions in this area.
         *
         * Reference, title, category, status and dates only. NO contact details,
         * NO description and NO coordinates - this is a navigational list, and
         * everything sensitive stays on the Phase 5 issue page where reading it
         * is permissioned and, for contact details, audited.
         */
        prisma.issue.findMany({
          where: windowed,
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            status: true,
            priority: true,
            submittedAt: true,
            category: { select: { id: true, key: true, label: true } },
          },
          orderBy: { submittedAt: 'desc' },
          take: 10,
        }),
      ],
    );

    const categoryIds = categories
      .map((row) => row.categoryId)
      .filter((id): id is string => id !== null);

    const categoryRows = await prisma.issueCategory.findMany({
      where: { organizationId: scope.organizationId, id: { in: categoryIds } },
      select: { id: true, key: true, label: true },
    });
    const byId = new Map(categoryRows.map((row) => [row.id, row]));

    const resolutionDays = durations
      .filter((row) => row.resolvedAt && row.resolvedAt.getTime() >= row.submittedAt.getTime())
      .map((row) => daysBetween(row.submittedAt, row.resolvedAt as Date));

    return {
      area: value,
      label: value === UNSPECIFIED ? 'Not specified' : value,
      level: scope.geoLevel,
      range: scope.range,

      totalInRange: total,
      previousTotal,
      changePct: percentageChange(total, previousTotal),
      openCount: open,
      resolvedCount: resolved,
      resolutionRatePct: total >= ANALYTICS_LIMITS.minSamplesForRate ? rate(resolved, total) : null,
      averageResolutionDays: mean(resolutionDays),
      medianResolutionDays: median(resolutionDays),

      topCategories: categories.map((row) => {
        const category = row.categoryId ? byId.get(row.categoryId) : undefined;
        return {
          key: category?.key ?? 'UNCATEGORISED',
          label: category?.label ?? 'Not categorised',
          count: row._count._all,
          sharePct: rate(row._count._all, total),
        };
      }),

      recentIssues: recent,
    };
  },

  /**
   * The three "needs attention" rankings.
   *
   * Separate from the main table because they answer a different question. The
   * main table ranks by VOLUME, which is mostly a function of population and
   * of how much a place reports. These rank by what is going WRONG - unresolved
   * work, urgent work, and slow work - which is where an administrator's
   * attention actually belongs.
   *
   * `slowestAreas` requires a minimum sample, because a single six-month
   * outlier in a ward with two submissions would otherwise top the table and
   * send somebody to the wrong place.
   */
  async attention(auth: AuthContext, filter?: AnalyticsFilter | null, limit = 10) {
    const rows = await this.areas(auth, filter, 100);
    const cap = Math.min(Math.max(limit, 1), 25);

    return {
      byVolume: [...rows].sort((a, b) => b.count - a.count).slice(0, cap),
      byUnresolved: [...rows].sort((a, b) => b.openCount - a.openCount).slice(0, cap),
      byHighPriority: [...rows]
        .filter((row) => row.highPriorityOpenCount > 0)
        .sort((a, b) => b.highPriorityOpenCount - a.highPriorityOpenCount)
        .slice(0, cap),
      bySlowResolution: [...rows]
        .filter(
          (row) =>
            row.averageResolutionDays !== null &&
            row.resolvedSampleCount >= ANALYTICS_LIMITS.minSamplesForRate,
        )
        .sort((a, b) => (b.averageResolutionDays ?? 0) - (a.averageResolutionDays ?? 0))
        .slice(0, cap),
    };
  },

  /** The distinct area values in this tenant, for the filter dropdown. */
  async areaOptions(auth: AuthContext, filter?: AnalyticsFilter | null) {
    const scope: AnalyticsScope = analyticsService.scopeFor(auth, filter);
    const column = GEO_COLUMN[scope.geoLevel];

    const rows = (await prisma.issue.groupBy({
      by: [column as 'ward'],
      where: { organizationId: scope.organizationId },
      _count: { _all: true },
      orderBy: { _count: { [column]: 'desc' } as never },
      take: 200,
    })) as unknown as Array<Record<string, unknown> & { _count: { _all: number } }>;

    return rows
      .map((row) => (row[column] as string | null)?.trim() ?? '')
      .filter((value) => value.length > 0)
      .sort((a, b) => a.localeCompare(b));
  },
};

/** Display key for submissions with no value at the selected level. */
const UNSPECIFIED = '__UNSPECIFIED__';

function normaliseArea(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? UNSPECIFIED : trimmed;
}

/**
 * Grouped counts keyed by area name, with blanks folded into one bucket.
 *
 * Prisma groups `null` and `''` separately; both mean "the citizen did not say",
 * so they are merged here rather than appearing as two near-identical rows.
 */
async function groupByArea(
  where: Prisma.IssueWhereInput,
  column: 'ward' | 'locality' | 'area',
): Promise<Map<string, number>> {
  const rows = (await prisma.issue.groupBy({
    by: [column as 'ward'],
    where,
    _count: { _all: true },
  })) as unknown as Array<Record<string, unknown> & { _count: { _all: number } }>;

  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normaliseArea(row[column] as string | null);
    counts.set(key, (counts.get(key) ?? 0) + row._count._all);
  }
  return counts;
}

export { UNSPECIFIED as UNSPECIFIED_AREA };
