import { TERMINAL_ISSUE_STATUSES } from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { rate } from '../../analytics/shared/analyticsFilters';
import { siteFeedbackCountsForCampaigns } from './campaignSiteFeedbackStats';

/**
 * Per-campaign issue + opinion rollups attributed via rk_qr.
 *
 * Batched with `groupBy` so a campaign list never becomes an N+1 of counts.
 * Open = not CLOSED/REJECTED, matching the rest of the analytics surface.
 */

export interface CampaignIssueStats {
  readonly issueCount: number;
  readonly openIssueCount: number;
  readonly siteFeedbackCount: number;
  readonly conversionRatePct: number | null;
}

const OPEN_FILTER: Prisma.IssueWhereInput = {
  status: { notIn: [...TERMINAL_ISSUE_STATUSES] },
};

const EMPTY: CampaignIssueStats = {
  issueCount: 0,
  openIssueCount: 0,
  siteFeedbackCount: 0,
  conversionRatePct: null,
};

export function conversionFrom(submissions: number, scans: number): number | null {
  return rate(submissions, scans);
}

/**
 * All-time issue + SiteFeedback counts for the given campaign ids within one tenant.
 *
 * `scansByCampaignId` supplies the denominator for conversion; pass the
 * campaign's all-time scan total when enriching list/detail rows.
 * Conversion uses issues + homepage opinions as the numerator.
 */
export async function issueStatsForCampaigns(
  organizationId: string,
  campaignIds: readonly string[],
  scansByCampaignId: ReadonlyMap<string, number>,
): Promise<Map<string, CampaignIssueStats>> {
  const result = new Map<string, CampaignIssueStats>();
  for (const id of campaignIds) {
    const scans = scansByCampaignId.get(id) ?? 0;
    result.set(id, {
      issueCount: 0,
      openIssueCount: 0,
      siteFeedbackCount: 0,
      conversionRatePct: conversionFrom(0, scans),
    });
  }

  if (campaignIds.length === 0) return result;

  const [allRows, openRows, siteFeedbackById] = await Promise.all([
    prisma.issue.groupBy({
      by: ['campaignId'],
      where: {
        organizationId,
        campaignId: { in: [...campaignIds] },
      },
      _count: { _all: true },
    }),
    prisma.issue.groupBy({
      by: ['campaignId'],
      where: {
        organizationId,
        campaignId: { in: [...campaignIds] },
        ...OPEN_FILTER,
      },
      _count: { _all: true },
    }),
    siteFeedbackCountsForCampaigns(organizationId, campaignIds),
  ]);

  const openById = new Map(
    openRows
      .filter((row): row is typeof row & { campaignId: string } => row.campaignId !== null)
      .map((row) => [row.campaignId, row._count._all]),
  );

  const issueById = new Map(
    allRows
      .filter((row): row is typeof row & { campaignId: string } => row.campaignId !== null)
      .map((row) => [row.campaignId, row._count._all]),
  );

  for (const id of campaignIds) {
    const issueCount = issueById.get(id) ?? 0;
    const openIssueCount = openById.get(id) ?? 0;
    const siteFeedbackCount = siteFeedbackById.get(id) ?? 0;
    const scans = scansByCampaignId.get(id) ?? 0;
    result.set(id, {
      issueCount,
      openIssueCount,
      siteFeedbackCount,
      conversionRatePct: conversionFrom(issueCount + siteFeedbackCount, scans),
    });
  }

  return result;
}

export interface IssueAnalyticsBuckets {
  readonly issuesFromQr: number;
  readonly openIssues: number;
  readonly conversionRatePct: number | null;
  readonly issuesByStatus: ReadonlyArray<{ key: string; label: string; count: number }>;
  readonly issuesByPriority: ReadonlyArray<{ key: string; label: string; count: number }>;
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

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

/**
 * Windowed issue rollups for a QR analytics scope (tenant / campaign / code).
 */
export async function issueAnalyticsForQrScope(args: {
  readonly organizationId: string;
  readonly from: Date;
  readonly to: Date;
  readonly campaignId?: string | null;
  readonly qrCodeId?: string | null;
  readonly totalScans: number;
}): Promise<IssueAnalyticsBuckets> {
  const scope: Prisma.IssueWhereInput = {
    organizationId: args.organizationId,
    submittedAt: { gte: args.from, lt: args.to },
    ...(args.campaignId ? { campaignId: args.campaignId } : {}),
    ...(args.qrCodeId ? { qrCodeId: args.qrCodeId } : {}),
    // When neither campaign nor code is set, restrict to QR-attributed issues
    // so tenant-wide analytics do not mix in website-only submissions.
    ...(!args.campaignId && !args.qrCodeId
      ? { OR: [{ campaignId: { not: null } }, { qrCodeId: { not: null } }, { source: 'QR' }] }
      : {}),
  };

  const [issuesFromQr, openIssues, byStatus, byPriority] = await Promise.all([
    prisma.issue.count({ where: scope }),
    prisma.issue.count({ where: { ...scope, ...OPEN_FILTER } }),
    prisma.issue.groupBy({
      by: ['status'],
      where: scope,
      _count: { _all: true },
    }),
    prisma.issue.groupBy({
      by: ['priority'],
      where: scope,
      _count: { _all: true },
    }),
  ]);

  return {
    issuesFromQr,
    openIssues,
    conversionRatePct: conversionFrom(issuesFromQr, args.totalScans),
    issuesByStatus: byStatus
      .map((row) => ({
        key: row.status,
        label: STATUS_LABELS[row.status] ?? row.status,
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    issuesByPriority: byPriority
      .map((row) => ({
        key: row.priority,
        label: PRIORITY_LABELS[row.priority] ?? row.priority,
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

export { EMPTY as EMPTY_CAMPAIGN_ISSUE_STATS };
