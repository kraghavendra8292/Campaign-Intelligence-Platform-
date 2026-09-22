import type { AuthContext } from '@rk/types';
import { prisma } from '../../database/prisma';
import { getEnv } from '../../config/env';
import { getAiProvider, isAiEnabled } from './provider/index';
import { queueStats } from './aiQueue';
import { requireAiAccess } from './shared/aiGuards';

/**
 * Operational metrics for the AI console.
 *
 * OPERATIONAL, AND ONLY OPERATIONAL. Everything here describes how the
 * ASSISTANT is running: how many generations succeeded, what failed, what is
 * waiting for review, what it cost. There is deliberately no analytic here
 * about citizens, wards or submissions - that is `issueAnalytics.service.ts`,
 * which has its own constraints, and duplicating a subset of it behind an "AI"
 * label would be a second place for the same figures to drift.
 *
 * Every count is a database aggregate scoped to the caller's tenant. Nothing is
 * derived from a sample, and nothing is estimated.
 */

export const aiDashboardService = {
  /**
   * One call, everything the dashboard's header draws.
   *
   * Issued as a single `Promise.all` for the same reason the Phase 5 analytics
   * summary is: one round trip, and no half-populated page when one aggregate
   * is slow.
   */
  async overview(auth: AuthContext) {
    const { organizationId } = requireAiAccess(auth, 'AI_INSIGHT_READ');
    const env = getEnv();

    const scope = { organizationId };

    const [
      totalIssues,
      insightRows,
      reviewRows,
      approvedCount,
      rejectedCount,
      themeCount,
      summaryCount,
      topTopics,
      recentFailures,
    ] = await Promise.all([
      prisma.issue.count({ where: scope }),
      prisma.issueAiInsight.groupBy({
        by: ['processingStatus'],
        where: scope,
        _count: { _all: true },
      }),
      prisma.issueAiInsight.groupBy({
        by: ['reviewStatus'],
        where: scope,
        _count: { _all: true },
      }),
      prisma.issueAiInsight.count({ where: { ...scope, reviewStatus: 'APPROVED' } }),
      prisma.issueAiInsight.count({ where: { ...scope, reviewStatus: 'REJECTED' } }),
      prisma.issueTheme.count({ where: scope }),
      prisma.aiExecutiveSummary.count({ where: scope }),

      // Top subject-matter topics across the tenant. An aggregate over a
      // derived field, and - stated because this is the closest thing here to a
      // population-level statistic - a statement about what was REPORTED, not
      // about who reported it.
      prisma.issueAiTopic.groupBy({
        by: ['normalized'],
        where: scope,
        _count: { _all: true },
        orderBy: { _count: { normalized: 'desc' } },
        take: 15,
      }),

      prisma.issueAiInsight.findMany({
        where: { ...scope, processingStatus: 'FAILED' },
        select: { issueId: true, failureKind: true, failureReason: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
        take: 5,
      }),
    ]);

    const byProcessing = countsByKey(insightRows, 'processingStatus');
    const byReview = countsByKey(reviewRows, 'reviewStatus');

    const processed = byProcessing.COMPLETED ?? 0;
    const failed = byProcessing.FAILED ?? 0;
    const attempted = processed + failed;

    return {
      /** Whether the assistant can run at all right now. */
      enabled: isAiEnabled(),
      provider: getAiProvider().name,
      model: env.AI_MODEL,

      totalIssues,
      notProcessed: totalIssues - Object.values(byProcessing).reduce((sum, n) => sum + n, 0),
      queued: byProcessing.QUEUED ?? 0,
      processing: byProcessing.PROCESSING ?? 0,
      processed,
      failed,
      requiresReview: byProcessing.REQUIRES_REVIEW ?? 0,

      // Null rather than 0 when nothing has been attempted: a success rate of
      // "0%" for a tenant that has never run a generation is a false alarm.
      successRatePct: attempted === 0 ? null : Math.round((processed / attempted) * 1000) / 10,

      pendingReview: (byReview.GENERATED ?? 0) + (byReview.PENDING_REVIEW ?? 0),
      approvedCount,
      rejectedCount,

      themeCount,
      executiveSummaryCount: summaryCount,

      topTopics: topTopics.map((row) => ({
        topic: row.normalized,
        count: row._count._all,
      })),

      recentFailures,

      // In-memory, so it describes THIS process only. Labelled as such in the
      // UI rather than presented as a cluster-wide figure.
      queue: queueStats(),
    };
  },

  /**
   * Usage and cost over a window.
   *
   * Cost is summed from stored per-call estimates, and a null total means "not
   * priced" rather than "free" - see `estimateCost` for why that distinction is
   * preserved all the way to the dashboard.
   */
  async usage(auth: AuthContext, args: { from?: Date | null; to?: Date | null } = {}) {
    const { organizationId } = requireAiAccess(auth, 'AI_ANALYTICS_READ');

    const to = args.to ?? new Date();
    const from = args.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const where = { organizationId, createdAt: { gte: from, lt: to } };

    const [totals, byOperation, failures] = await Promise.all([
      prisma.aiUsageLog.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCostUsd: true },
        _avg: { durationMs: true },
      }),
      prisma.aiUsageLog.groupBy({
        by: ['operation'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCostUsd: true },
      }),
      prisma.aiUsageLog.groupBy({
        by: ['failureKind'],
        where: { ...where, success: false },
        _count: { _all: true },
      }),
    ]);

    const successCount = await prisma.aiUsageLog.count({ where: { ...where, success: true } });
    const requestCount = totals._count._all;

    return {
      from,
      to,
      requestCount,
      successCount,
      failureCount: requestCount - successCount,
      successRatePct:
        requestCount === 0 ? null : Math.round((successCount / requestCount) * 1000) / 10,
      totalTokens: totals._sum.totalTokens ?? null,
      estimatedCostUsd: totals._sum.estimatedCostUsd?.toString() ?? null,
      averageDurationMs:
        totals._avg.durationMs === null ? null : Math.round(totals._avg.durationMs),

      byOperation: byOperation.map((row) => ({
        operation: row.operation,
        requestCount: row._count._all,
        totalTokens: row._sum.totalTokens ?? null,
        estimatedCostUsd: row._sum.estimatedCostUsd?.toString() ?? null,
      })),

      byFailureKind: failures
        .filter((row) => row.failureKind !== null)
        .map((row) => ({ kind: row.failureKind as string, count: row._count._all })),
    };
  },
};

/** Turns a Prisma `groupBy` result into a plain key-to-count record. */
function countsByKey<K extends string>(
  rows: readonly ({ _count: { _all: number } } & Record<K, string>)[],
  key: K,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row[key]] = row._count._all;
  return counts;
}
