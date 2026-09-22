import type { AuthContext } from '@rk/types';
import {
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  ANALYTICS_LIMITS,
  RESOLUTION_BUCKETS,
  RESOLUTION_BUCKET_LABELS,
  TERMINAL_ISSUE_STATUSES,
  agingBucketFor,
  resolutionBucketFor,
} from '@rk/types';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { analyticsService, mean, median } from './analytics.service';
import { daysBetween, rate, type AnalyticsFilter } from './shared/analyticsFilters';

/**
 * Resolution performance: how fast work is cleared, and what is waiting.
 *
 * TWO DISTRIBUTIONS THAT LOOK SIMILAR AND ANSWER OPPOSITE QUESTIONS:
 *
 *  - TIME TO RESOLUTION is a record of the PAST. It covers submissions already
 *    resolved, and it flatters a team that closes easy items quickly while
 *    ignoring hard ones, because the hard ones are not in it.
 *  - BACKLOG AGING is a picture of the PRESENT. It covers submissions still
 *    open, and it is where those ignored hard items show up.
 *
 * Both are reported, side by side, precisely because either alone is
 * misleading. A dashboard showing only the first can look excellent while a
 * ward's drains have been waiting four months.
 *
 * MEAN AND MEDIAN ARE BOTH REPORTED for the same reason. A handful of
 * submissions that sat for eight months drags the mean well above anything a
 * team recognises; the median is what they experience. A wide gap between them
 * is itself the signal that a few very old items are distorting the average, so
 * hiding either would hide that signal.
 */

const OPEN_FILTER: Prisma.IssueWhereInput = {
  status: { notIn: [...TERMINAL_ISSUE_STATUSES] },
};

export const resolutionAnalyticsService = {
  /**
   * The full resolution picture for the selected filters.
   *
   * Both distributions are computed from bounded selections of scalar columns:
   * the resolved set is bounded by the date window, and the open set is bounded
   * by the tenant's actual backlog, which is the number of things staff have
   * not finished - a quantity that is small by construction, because a backlog
   * that is not small is the problem the dashboard exists to surface.
   */
  async summary(auth: AuthContext, filter?: AnalyticsFilter | null) {
    const scope = analyticsService.scopeFor(auth, filter);
    const now = new Date();

    const [resolvedRows, openRows, totalInRange, firstResponseRows] = await Promise.all([
      prisma.issue.findMany({
        where: { ...scope.where, resolvedAt: { gte: scope.range.from, lt: scope.range.to } },
        select: { submittedAt: true, resolvedAt: true, categoryId: true, priority: true },
      }),

      prisma.issue.findMany({
        where: { ...scope.where, ...OPEN_FILTER },
        select: { submittedAt: true, priority: true },
      }),

      prisma.issue.count({ where: scope.windowed }),

      /**
       * Time to FIRST RESPONSE, approximated by the first status change.
       *
       * Phase 5 records no explicit "first responded at" column, so this uses
       * the earliest `IssueHistory` entry whose action is a status change -
       * which is the moment a staff member first did something visible with the
       * submission. It is an approximation and is labelled as one in the UI and
       * the docs; inventing a column and backfilling it would be worse, because
       * the backfilled values would be guesses presented as records.
       */
      prisma.issueHistory.findMany({
        where: {
          organizationId: scope.organizationId,
          action: 'STATUS_CHANGED',
          createdAt: { gte: scope.range.from, lt: scope.range.to },
          issue: scope.where,
        },
        select: { issueId: true, createdAt: true, issue: { select: { submittedAt: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // ---- Time to resolution -------------------------------------------------
    const resolutionDays: number[] = [];
    const resolutionBuckets = new Map<string, number>();
    const byCategoryDurations = new Map<string | null, number[]>();

    for (const row of resolvedRows) {
      if (!row.resolvedAt) continue;
      if (row.resolvedAt.getTime() < row.submittedAt.getTime()) continue;

      const days = daysBetween(row.submittedAt, row.resolvedAt);
      resolutionDays.push(days);

      const bucket = resolutionBucketFor(days);
      resolutionBuckets.set(bucket, (resolutionBuckets.get(bucket) ?? 0) + 1);

      const list = byCategoryDurations.get(row.categoryId) ?? [];
      list.push(days);
      byCategoryDurations.set(row.categoryId, list);
    }

    // ---- Backlog aging ------------------------------------------------------
    const agingBuckets = new Map<string, number>();
    const openDays: number[] = [];
    let highPriorityOpen = 0;

    for (const row of openRows) {
      const days = daysBetween(row.submittedAt, now);
      openDays.push(days);
      const bucket = agingBucketFor(days);
      agingBuckets.set(bucket, (agingBuckets.get(bucket) ?? 0) + 1);
      if (row.priority === 'HIGH' || row.priority === 'URGENT') highPriorityOpen += 1;
    }

    // ---- First response -----------------------------------------------------
    // One entry per issue: the FIRST status change is the response, and later
    // ones are progress. Keyed on issueId over an ascending scan.
    const firstResponseByIssue = new Map<string, number>();
    for (const row of firstResponseRows) {
      if (firstResponseByIssue.has(row.issueId)) continue;
      const days = daysBetween(row.issue.submittedAt, row.createdAt);
      if (days >= 0) firstResponseByIssue.set(row.issueId, days);
    }
    const firstResponseDays = [...firstResponseByIssue.values()];

    // ---- Slowest categories -------------------------------------------------
    const categoryIds = [...byCategoryDurations.keys()].filter((id): id is string => id !== null);
    const categories = await prisma.issueCategory.findMany({
      where: { organizationId: scope.organizationId, id: { in: categoryIds } },
      select: { id: true, key: true, label: true },
    });
    const categoryById = new Map(categories.map((row) => [row.id, row]));

    const slowestCategories = [...byCategoryDurations.entries()]
      .map(([id, durations]) => {
        const category = id ? categoryById.get(id) : undefined;
        return {
          key: category?.key ?? 'UNCATEGORISED',
          label: category?.label ?? 'Not categorised',
          averageResolutionDays: mean(durations) ?? 0,
          medianResolutionDays: median(durations) ?? 0,
          resolvedCount: durations.length,
        };
      })
      // Same minimum-sample rule as the area table: one slow item in a category
      // with two resolutions is not a slow category.
      .filter((row) => row.resolvedCount >= ANALYTICS_LIMITS.minSamplesForRate)
      .sort((a, b) => b.averageResolutionDays - a.averageResolutionDays)
      .slice(0, 10);

    const resolvedInRange = resolutionDays.length;

    return {
      range: scope.range,
      generatedAt: now,

      totalInRange,
      resolvedInRange,
      openCount: openRows.length,
      highPriorityOpen,
      resolutionRatePct: rate(resolvedInRange, totalInRange),

      averageResolutionDays: mean(resolutionDays),
      medianResolutionDays: median(resolutionDays),
      averageFirstResponseDays: mean(firstResponseDays),
      firstResponseSampleCount: firstResponseDays.length,

      averageOpenAgeDays: mean(openDays),
      oldestOpenAgeDays: openDays.length > 0 ? Math.floor(Math.max(...openDays)) : null,

      // Every bucket is emitted, including empty ones, so the distribution
      // keeps its shape and an empty bucket reads as zero rather than as a
      // missing category.
      timeToResolution: RESOLUTION_BUCKETS.map((bucket) => ({
        key: bucket,
        label: RESOLUTION_BUCKET_LABELS[bucket],
        count: resolutionBuckets.get(bucket) ?? 0,
        sharePct: rate(resolutionBuckets.get(bucket) ?? 0, resolvedInRange),
      })),

      backlogAging: AGING_BUCKETS.map((bucket) => ({
        key: bucket,
        label: AGING_BUCKET_LABELS[bucket],
        count: agingBuckets.get(bucket) ?? 0,
        sharePct: rate(agingBuckets.get(bucket) ?? 0, openRows.length),
      })),

      slowestCategories,
    };
  },
};
