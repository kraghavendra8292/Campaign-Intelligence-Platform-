import type { AuthContext, TrendGranularity } from '@rk/types';
import { resolveTrendGranularity, TERMINAL_ISSUE_STATUSES } from '@rk/types';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import {
  assertFilterSane,
  buildScope,
  daysBetween,
  percentageChange,
  rate,
  requireAnalytics,
  type AnalyticsFilter,
  type AnalyticsScope,
} from './shared/analyticsFilters';

/**
 * Core decision metrics: overview, trend, and the dimensional breakdowns.
 *
 * THREE RULES, and they are the reason this file looks the way it does.
 *
 * 1. THE DATABASE COUNTS. Every figure is a `count`, a `groupBy` or a single
 *    bounded `findMany` of scalar columns. No method here loads issue rows to
 *    tally them in Node - at a few hundred submissions that would work and at
 *    fifty thousand it would fall over, and the failure would arrive as a slow
 *    dashboard rather than as an error anybody investigates.
 *
 * 2. ONE SCOPE, MANY METRICS. Everything derives from `buildScope`, so the
 *    overview card and the category table cannot disagree about what the filter
 *    meant.
 *
 * 3. THE OUTPUT DESCRIBES WORKLOAD, NOT PEOPLE. Counts of submissions, of work
 *    outstanding, and of how long it took. There is no per-citizen output in
 *    this file and no field that could hold one. "Ward 12 filed 42 drainage
 *    reports" is a statement about drains - it is not, and must never be
 *    presented as, a statement about how Ward 12 intends to vote.
 */

/**
 * Statuses that mean the campaign has finished with a submission.
 *
 * Built as a fresh mutable array rather than `as const`: Prisma's generated
 * `where` types take mutable arrays, and a readonly one from a const assertion
 * is rejected at every call site.
 */
const OPEN_FILTER: Prisma.IssueWhereInput = {
  status: { notIn: [...TERMINAL_ISSUE_STATUSES] },
};

export const analyticsService = {
  /**
   * The executive overview.
   *
   * Issued as one `Promise.all` so the header is a single round trip and cannot
   * paint half-populated. Period figures and BACKLOG figures are deliberately
   * scoped differently: "submitted this month" respects the date filter, while
   * "still open" does not, because a backlog does not stop existing because
   * somebody changed the date picker. Each is labelled accordingly in the UI.
   */
  async overview(auth: AuthContext, filter?: AnalyticsFilter | null) {
    const scope = this.scopeFor(auth, filter);

    const [
      totalInRange,
      previousTotal,
      totalAllTime,
      openCount,
      resolvedInRange,
      previousResolvedInRange,
      closedInRange,
      highPriorityOpen,
      unassignedOpen,
      awaitingModeration,
      resolutionSamples,
      previousResolutionSamples,
      oldestOpen,
    ] = await Promise.all([
      prisma.issue.count({ where: scope.windowed }),
      prisma.issue.count({ where: scope.previousWindowed }),
      prisma.issue.count({ where: scope.where }),

      prisma.issue.count({ where: { ...scope.where, ...OPEN_FILTER } }),

      // Resolved IN THE PERIOD keys on `resolvedAt`, not on `submittedAt`: the
      // operational question is "what did we clear this month", which includes
      // submissions that arrived earlier. Counting by submission date would
      // silently exclude exactly the old backlog items a team is proudest of
      // closing.
      prisma.issue.count({
        where: { ...scope.where, resolvedAt: { gte: scope.range.from, lt: scope.range.to } },
      }),
      prisma.issue.count({
        where: { ...scope.where, resolvedAt: { gte: scope.previous.from, lt: scope.previous.to } },
      }),
      prisma.issue.count({
        where: { ...scope.where, closedAt: { gte: scope.range.from, lt: scope.range.to } },
      }),

      prisma.issue.count({
        where: { ...scope.where, ...OPEN_FILTER, priority: { in: ['HIGH', 'URGENT'] } },
      }),
      prisma.issue.count({
        where: { ...scope.where, ...OPEN_FILTER, assignedToUserId: null },
      }),
      prisma.issue.count({ where: { ...scope.where, moderationStatus: 'PENDING_REVIEW' } }),

      resolutionDurations(scope.where, scope.range.from, scope.range.to),
      resolutionDurations(scope.where, scope.previous.from, scope.previous.to),

      prisma.issue.findFirst({
        where: { ...scope.where, ...OPEN_FILTER },
        select: { id: true, referenceNumber: true, title: true, submittedAt: true },
        orderBy: { submittedAt: 'asc' },
      }),
    ]);

    const averageDays = mean(resolutionSamples);
    const previousAverageDays = mean(previousResolutionSamples);

    return {
      range: scope.range,
      previousRange: scope.previous,
      generatedAt: new Date(),

      totalInRange,
      previousTotal,
      changePct: percentageChange(totalInRange, previousTotal),
      totalAllTime,

      openCount,
      resolvedInRange,
      previousResolvedInRange,
      resolvedChangePct: percentageChange(resolvedInRange, previousResolvedInRange),
      closedInRange,

      highPriorityOpen,
      unassignedOpen,
      awaitingModeration,

      // Resolution rate over the WINDOW's submissions, so it answers "of what
      // arrived in this period, how much is done" rather than mixing periods.
      resolutionRatePct: await this.resolutionRateForWindow(scope),

      averageResolutionDays: averageDays,
      previousAverageResolutionDays: previousAverageDays,
      averageResolutionChangePct:
        averageDays !== null && previousAverageDays !== null
          ? percentageChange(averageDays, previousAverageDays)
          : null,
      medianResolutionDays: median(resolutionSamples),
      resolvedSampleCount: resolutionSamples.length,

      oldestOpenIssue: oldestOpen
        ? {
            ...oldestOpen,
            ageDays: Math.floor(daysBetween(oldestOpen.submittedAt, new Date())),
          }
        : null,
    };
  },

  /** Share of this window's submissions that have since been resolved. */
  async resolutionRateForWindow(scope: AnalyticsScope): Promise<number | null> {
    const [submitted, resolved] = await Promise.all([
      prisma.issue.count({ where: scope.windowed }),
      prisma.issue.count({ where: { ...scope.windowed, resolvedAt: { not: null } } }),
    ]);
    return rate(resolved, submitted);
  },

  /**
   * Submissions over time, bucketed by day, week or month.
   *
   * Bucketing is done in Node over a single selected column - see the note on
   * `bucketedCounts` for why that is a deliberate trade against duplicating the
   * filter logic into raw SQL, and where the limit of that choice lies.
   *
   * The series is DENSE: days with no submissions are emitted as zero rather
   * than omitted, so a gap in reporting looks like a gap rather than like a
   * straight line between two distant points.
   */
  async trend(
    auth: AuthContext,
    filter?: AnalyticsFilter | null,
    granularity?: TrendGranularity | null,
  ) {
    const scope = this.scopeFor(auth, filter);
    const unit = resolveTrendGranularity(granularity, scope.range.days);

    const [current, previous] = await Promise.all([
      bucketedCounts(scope.windowed, unit),
      bucketedCounts(scope.previousWindowed, unit),
    ]);

    return {
      granularity: unit,
      range: scope.range,
      points: densify(current, scope.range.from, scope.range.to, unit),
      // The comparison series is returned undensified and unaligned by date -
      // the UI overlays it as a reference total, and pretending its dates line
      // up with the current period would be inventing an alignment.
      previousTotal: previous.reduce((sum, point) => sum + point.count, 0),
    };
  },

  /**
   * Issues by category, with period comparison and open/resolved split.
   *
   * Four aggregates rather than one, because Prisma's `groupBy` cannot produce
   * conditional counts. Each is a grouped count over an indexed window, and
   * they are stitched by category id in memory - a few dozen rows, not a few
   * thousand.
   */
  async byCategory(auth: AuthContext, filter?: AnalyticsFilter | null) {
    const scope = this.scopeFor(auth, filter);

    const [current, previous, open, resolved, categories, total] = await Promise.all([
      groupCount(scope.windowed, 'categoryId'),
      groupCount(scope.previousWindowed, 'categoryId'),
      groupCount({ ...scope.windowed, ...OPEN_FILTER }, 'categoryId'),
      groupCount({ ...scope.windowed, resolvedAt: { not: null } }, 'categoryId'),
      prisma.issueCategory.findMany({
        where: { organizationId: scope.organizationId },
        select: { id: true, key: true, label: true },
      }),
      prisma.issue.count({ where: scope.windowed }),
    ]);

    const byId = new Map(categories.map((category) => [category.id, category]));

    return [...current.keys()]
      .map((id) => {
        const category = id ? byId.get(id) : undefined;
        const count = current.get(id) ?? 0;
        const previousCount = previous.get(id) ?? 0;

        return {
          // Uncategorised submissions are reported honestly rather than dropped,
          // so the breakdown still sums to the total shown on the card above it.
          key: category?.key ?? 'UNCATEGORISED',
          id: id ?? null,
          label: category?.label ?? 'Not categorised',
          count,
          sharePct: rate(count, total),
          previousCount,
          changePct: percentageChange(count, previousCount),
          openCount: open.get(id) ?? 0,
          resolvedCount: resolved.get(id) ?? 0,
        };
      })
      .sort((a, b) => b.count - a.count);
  },

  /** Issues by workflow status. Ordered by the Phase 5 lifecycle, not by size. */
  async byStatus(auth: AuthContext, filter?: AnalyticsFilter | null) {
    const scope = this.scopeFor(auth, filter);

    const [current, previous, total] = await Promise.all([
      groupCount(scope.windowed, 'status'),
      groupCount(scope.previousWindowed, 'status'),
      prisma.issue.count({ where: scope.windowed }),
    ]);

    // Ordered by the lifecycle rather than ranked by count: the sequence
    // SUBMITTED → … → CLOSED is the information, and sorting it by size would
    // destroy the shape of the funnel the chart exists to show.
    const ordered = [
      'SUBMITTED',
      'UNDER_REVIEW',
      'ACKNOWLEDGED',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
      'REJECTED',
    ] as const;

    return ordered.map((status) => {
      const count = current.get(status) ?? 0;
      const previousCount = previous.get(status) ?? 0;
      return {
        key: status,
        label: humanise(status),
        count,
        sharePct: rate(count, total),
        previousCount,
        changePct: percentageChange(count, previousCount),
      };
    });
  },

  /** Issues by administrative priority, with the open/resolved split. */
  async byPriority(auth: AuthContext, filter?: AnalyticsFilter | null) {
    const scope = this.scopeFor(auth, filter);

    const [current, previous, open, resolved, total] = await Promise.all([
      groupCount(scope.windowed, 'priority'),
      groupCount(scope.previousWindowed, 'priority'),
      groupCount({ ...scope.windowed, ...OPEN_FILTER }, 'priority'),
      groupCount({ ...scope.windowed, resolvedAt: { not: null } }, 'priority'),
      prisma.issue.count({ where: scope.windowed }),
    ]);

    const ordered = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;

    return ordered.map((priority) => {
      const count = current.get(priority) ?? 0;
      return {
        key: priority,
        label: humanise(priority),
        count,
        sharePct: rate(count, total),
        previousCount: previous.get(priority) ?? 0,
        changePct: percentageChange(count, previous.get(priority) ?? 0),
        openCount: open.get(priority) ?? 0,
        resolvedCount: resolved.get(priority) ?? 0,
      };
    });
  },

  /**
   * The high-priority backlog table.
   *
   * The ONE place in this module that returns individual submissions, because
   * it is a worklist rather than an analytic - an administrator needs to open
   * these. It returns only what the table renders: reference, title, category,
   * area, priority, status and age.
   *
   * NO CITIZEN CONTACT DETAILS, no description, no coordinates. Those are
   * available on the Phase 5 issue page behind their own permissions, which is
   * where reading them leaves an audit trail.
   */
  async highPriorityBacklog(auth: AuthContext, filter?: AnalyticsFilter | null, limit = 50) {
    const scope = this.scopeFor(auth, filter);
    const now = new Date();

    const rows = await prisma.issue.findMany({
      where: {
        ...scope.where,
        ...OPEN_FILTER,
        priority: { in: ['HIGH', 'URGENT'] },
      },
      select: {
        id: true,
        referenceNumber: true,
        title: true,
        priority: true,
        status: true,
        ward: true,
        locality: true,
        area: true,
        submittedAt: true,
        category: { select: { id: true, key: true, label: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
      // Oldest first: the backlog is a queue, and the top of it is what has
      // been waiting longest, not what arrived most recently.
      orderBy: [{ priority: 'desc' }, { submittedAt: 'asc' }],
      take: Math.min(Math.max(limit, 1), 200),
    });

    return rows.map((row) => ({
      ...row,
      ageDays: Math.floor(daysBetween(row.submittedAt, now)),
    }));
  },

  /** Shared entry point: permission, validation and scope in one step. */
  scopeFor(auth: AuthContext, filter?: AnalyticsFilter | null): AnalyticsScope {
    const { organizationId } = requireAnalytics(auth);
    assertFilterSane(filter);
    return buildScope(organizationId, filter);
  },
};

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/**
 * A grouped count, returned as a Map keyed by the grouped column.
 *
 * Typed loosely on purpose: Prisma's `groupBy` overloads are keyed on the
 * literal field name, and threading that generic through five call sites buys
 * type safety over a value this function immediately turns into a `Map`. The
 * cast is contained here rather than repeated.
 */
async function groupCount(
  where: Prisma.IssueWhereInput,
  field: 'categoryId' | 'status' | 'priority' | 'source' | 'type',
): Promise<Map<string | null, number>> {
  const rows = (await prisma.issue.groupBy({
    by: [field as 'status'],
    where,
    _count: { _all: true },
  })) as unknown as Array<Record<string, unknown> & { _count: { _all: number } }>;

  const counts = new Map<string | null, number>();
  for (const row of rows) {
    counts.set((row[field] as string | null) ?? null, row._count._all);
  }
  return counts;
}

/**
 * Time-to-resolution in days for submissions resolved inside a window.
 *
 * Selects two timestamp columns and nothing else, so the transfer is 16 bytes
 * per resolved issue rather than a whole row. Mean and median are computed from
 * this because PostgreSQL cannot express "average of (resolvedAt - submittedAt)"
 * through Prisma's aggregate API, and a raw query here would be the only one in
 * the module.
 *
 * The set is bounded by the date window, which is itself capped at
 * `MAX_ANALYTICS_RANGE_DAYS`.
 */
async function resolutionDurations(
  where: Prisma.IssueWhereInput,
  from: Date,
  to: Date,
): Promise<number[]> {
  const rows = await prisma.issue.findMany({
    where: { ...where, resolvedAt: { gte: from, lt: to } },
    select: { submittedAt: true, resolvedAt: true },
  });

  const durations: number[] = [];
  for (const row of rows) {
    if (!row.resolvedAt) continue;
    // A resolution recorded before submission is a data error, not a negative
    // duration. Dropped rather than clamped to zero, which would quietly drag
    // the average down.
    const days = daysBetween(row.submittedAt, row.resolvedAt);
    if (row.resolvedAt.getTime() >= row.submittedAt.getTime()) durations.push(days);
  }
  return durations;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

/**
 * The median, which is the more honest headline for resolution time.
 *
 * A handful of submissions that sat for eight months will drag a mean well
 * above anything a team recognises. Both are reported, so the gap between them
 * is itself visible - and a large gap is the signal that a few very old items
 * are distorting the average.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Math.round(value * 10) / 10;
}

type TrendUnit = 'DAY' | 'WEEK' | 'MONTH';

/**
 * Counts per time bucket.
 *
 * BUCKETED IN NODE, not by SQL `date_trunc`, and the trade-off is worth stating
 * plainly because it is the one place this module bends rule 1.
 *
 * Grouping by an expression is not expressible through Prisma's `groupBy`, so
 * the alternative is `$queryRaw`. That would mean translating `AnalyticsFilter`
 * into a SQL `WHERE` clause by hand - a second implementation of the filter
 * logic, in string form, that must stay in step with `buildScope` and that
 * introduces the module's only injection surface. Duplicating the filter is a
 * correctness risk on every future filter added; bucketing timestamps is not.
 *
 * What makes it acceptable: the query selects ONE timestamp column and nothing
 * else, and the row set is bounded by the date window, which `resolveRange`
 * caps at `MAX_ANALYTICS_RANGE_DAYS`. A tenant with 50,000 submissions in the
 * window transfers 50,000 timestamps, not 50,000 rows.
 *
 * The point at which this should become a raw query is a tenant whose capped
 * window regularly exceeds a few hundred thousand submissions. It is recorded
 * as a known limitation rather than pre-optimised here.
 */
async function bucketedCounts(
  where: Prisma.IssueWhereInput,
  unit: TrendUnit,
): Promise<Array<{ date: Date; count: number }>> {
  const rows = await prisma.issue.findMany({
    where,
    select: { submittedAt: true },
    orderBy: { submittedAt: 'asc' },
  });

  const buckets = new Map<number, number>();
  for (const row of rows) {
    const key = truncate(row.submittedAt, unit).getTime();
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, count]) => ({ date: new Date(time), count }));
}

/** Start of the day, ISO week or month containing `value`, in UTC. */
function truncate(value: Date, unit: TrendUnit): Date {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();

  if (unit === 'MONTH') return new Date(Date.UTC(year, month, 1));

  const startOfDay = new Date(Date.UTC(year, month, day));
  if (unit === 'DAY') return startOfDay;

  // ISO weeks start on Monday; `getUTCDay()` puts Sunday at 0.
  const weekday = (startOfDay.getUTCDay() + 6) % 7;
  return new Date(startOfDay.getTime() - weekday * 86_400_000);
}

/**
 * Fills gaps so every bucket in the range is present, including empty ones.
 *
 * A sparse series drawn as a line implies a smooth transition across a gap that
 * actually contained nothing. For a dashboard used to decide where to send
 * people, "no reports for nine days" and "a gentle slope" are different facts.
 */
function densify(
  points: Array<{ date: Date; count: number }>,
  from: Date,
  to: Date,
  unit: TrendUnit,
): Array<{ date: Date; count: number }> {
  const byTime = new Map(points.map((point) => [point.date.getTime(), point.count]));
  const filled: Array<{ date: Date; count: number }> = [];

  let cursor = truncate(from, unit);
  // Guard against a pathological range producing an unbounded loop; the range
  // is already capped, so this ceiling is never reached in practice.
  for (let guard = 0; cursor.getTime() < to.getTime() && guard < 1000; guard += 1) {
    filled.push({ date: new Date(cursor), count: byTime.get(cursor.getTime()) ?? 0 });
    cursor = advance(cursor, unit);
  }

  return filled;
}

function advance(date: Date, unit: TrendUnit): Date {
  if (unit === 'MONTH') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  }
  return new Date(date.getTime() + (unit === 'WEEK' ? 7 : 1) * 86_400_000);
}

export function humanise(value: string): string {
  const lower = value.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
