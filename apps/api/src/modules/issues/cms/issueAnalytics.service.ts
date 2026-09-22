import type { AnalyticsRange, AuthContext } from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { resolveRange } from '../../qr/cms/qrAnalytics.service';
import { requireIssueAccess } from '../shared/issueGuards';

/**
 * Aggregate submission analytics.
 *
 * The same three rules as Phase 4's scan analytics, for the same reasons:
 *
 * 1. AGGREGATION HAPPENS IN THE DATABASE. Every figure is a `count` or a
 *    `groupBy`. Individual submissions never reach this service's output, so a
 *    client cannot reassemble what citizens wrote even if it wanted to.
 * 2. EVERY QUERY IS TENANT-SCOPED AND TIME-BOUNDED.
 * 3. THE OUTPUT DESCRIBES WORKLOAD, NOT PEOPLE. Counts by status, category,
 *    ward and channel. There is no per-citizen output anywhere in this file.
 *
 * WHAT IS DELIBERATELY ABSENT, and must stay absent: sentiment, tone, urgency
 * inference, any model, and above all any aggregate that could be read as a
 * statement about a ward's politics. "Ward 12 filed 42 drainage reports" is a
 * statement about drains. It is not, and must never be presented as, a
 * statement about how Ward 12 intends to vote.
 *
 * The date-range resolver is imported from the QR analytics service rather than
 * duplicated: presets must mean the same thing on both dashboards, and two
 * implementations would eventually disagree about where "this month" starts.
 */

export interface IssueAnalyticsArgs {
  readonly range?: AnalyticsRange | null;
  readonly from?: string | null;
  readonly to?: string | null;
}

export interface CountedLabel {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

const SOURCE_LABELS: Record<string, string> = {
  DIRECT_WEBSITE: 'Website',
  QR: 'QR code',
  CAMPAIGN_PAGE: 'Campaign page',
  OTHER: 'Other',
};

function humanise(value: string): string {
  const lower = value.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function topN(items: CountedLabel[], limit = 12): CountedLabel[] {
  return [...items].sort((a, b) => b.count - a.count).slice(0, limit);
}

export const issueAnalyticsService = {
  /**
   * One call, everything the dashboard draws.
   *
   * Issued as a single `Promise.all` so the dashboard is one round trip rather
   * than nine, and so a slow aggregate cannot leave half the page populated.
   */
  async summary(auth: AuthContext, args: IssueAnalyticsArgs) {
    const { organizationId } = requireIssueAccess(auth, 'ISSUE_ANALYTICS_READ');
    const now = new Date();
    const range = resolveRange(args.range, args.from, args.to, now);

    const scope: Prisma.IssueWhereInput = { organizationId };
    const windowed: Prisma.IssueWhereInput = {
      ...scope,
      submittedAt: { gte: range.from, lt: range.to },
    };

    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const [
      totalInRange,
      totalAllTime,
      submittedToday,
      openCount,
      highPriorityOpen,
      unassignedOpen,
      awaitingModeration,
      statusRows,
      priorityRows,
      typeRows,
      sourceRows,
      categoryRows,
      wardRows,
      dayRows,
      categoryNames,
    ] = await Promise.all([
      prisma.issue.count({ where: windowed }),
      prisma.issue.count({ where: scope }),
      prisma.issue.count({ where: { ...scope, submittedAt: { gte: startOfToday } } }),

      // "Open" is everything the campaign has not finished with. Counted over
      // ALL TIME rather than the window: a backlog does not stop mattering
      // because the date filter moved.
      prisma.issue.count({
        where: { ...scope, status: { notIn: ['CLOSED', 'REJECTED'] } },
      }),
      prisma.issue.count({
        where: {
          ...scope,
          status: { notIn: ['CLOSED', 'REJECTED'] },
          priority: { in: ['HIGH', 'URGENT'] },
        },
      }),
      prisma.issue.count({
        where: {
          ...scope,
          status: { notIn: ['CLOSED', 'REJECTED'] },
          assignedToUserId: null,
        },
      }),
      prisma.issue.count({ where: { ...scope, moderationStatus: 'PENDING_REVIEW' } }),

      prisma.issue.groupBy({ by: ['status'], where: windowed, _count: { _all: true } }),
      prisma.issue.groupBy({ by: ['priority'], where: windowed, _count: { _all: true } }),
      prisma.issue.groupBy({ by: ['type'], where: windowed, _count: { _all: true } }),
      prisma.issue.groupBy({ by: ['source'], where: windowed, _count: { _all: true } }),
      prisma.issue.groupBy({ by: ['categoryId'], where: windowed, _count: { _all: true } }),
      prisma.issue.groupBy({ by: ['ward'], where: windowed, _count: { _all: true } }),

      // Per-day counts for the trend. `submittedAt` is a timestamp, so the
      // bucketing happens below rather than in SQL - the row count here is
      // bounded by the range cap, not by submission volume.
      prisma.issue.findMany({
        where: windowed,
        select: { submittedAt: true },
        orderBy: { submittedAt: 'asc' },
      }),

      prisma.issueCategory.findMany({
        where: { organizationId },
        select: { id: true, key: true, label: true },
      }),
    ]);

    const categoryById = new Map(categoryNames.map((row) => [row.id, row]));

    const trendBuckets = new Map<string, number>();
    for (const row of dayRows) {
      const day = row.submittedAt.toISOString().slice(0, 10);
      trendBuckets.set(day, (trendBuckets.get(day) ?? 0) + 1);
    }

    return {
      range,
      totalInRange,
      totalAllTime,
      submittedToday,
      openCount,
      highPriorityOpen,
      unassignedOpen,
      awaitingModeration,

      byStatus: statusRows.map((row) => ({
        key: row.status,
        label: STATUS_LABELS[row.status] ?? humanise(row.status),
        count: row._count._all,
      })),

      byPriority: priorityRows.map((row) => ({
        key: row.priority,
        label: humanise(row.priority),
        count: row._count._all,
      })),

      byType: typeRows.map((row) => ({
        key: row.type,
        label: humanise(row.type),
        count: row._count._all,
      })),

      bySource: sourceRows.map((row) => ({
        key: row.source,
        label: SOURCE_LABELS[row.source] ?? humanise(row.source),
        count: row._count._all,
      })),

      byCategory: topN(
        categoryRows.map((row) => {
          const category = row.categoryId ? categoryById.get(row.categoryId) : undefined;
          return {
            // Uncategorised submissions are counted honestly rather than
            // dropped, so the breakdown still adds up to the total.
            key: row.categoryId ?? 'UNCATEGORISED',
            label: category?.label ?? 'Not categorised',
            count: row._count._all,
          };
        }),
      ),

      byWard: topN(
        wardRows
          .filter((row) => row.ward !== null && row.ward.trim().length > 0)
          .map((row) => ({
            key: row.ward as string,
            label: row.ward as string,
            count: row._count._all,
          })),
      ),

      trend: [...trendBuckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date: new Date(`${date}T00:00:00.000Z`), count })),
    };
  },
};
