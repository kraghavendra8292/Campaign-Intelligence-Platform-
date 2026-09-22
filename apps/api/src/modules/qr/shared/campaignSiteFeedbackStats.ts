import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { rate } from '../../analytics/shared/analyticsFilters';

/**
 * Homepage opinion rollups attributed via rk_qr (`SiteFeedback.campaignId`).
 *
 * Separate from Issue stats: opinions are Great/Ok/Worst pulses, not triage
 * cases. Both can share a poster channel; they answer different questions.
 */

const REACTION_LABELS: Record<string, string> = {
  GREAT: 'Great',
  OK: 'Ok',
  WORST: 'Worst',
};

export interface SiteFeedbackAnalyticsBuckets {
  readonly siteFeedbacksFromQr: number;
  readonly siteFeedbackConversionRatePct: number | null;
  readonly siteFeedbackByReaction: ReadonlyArray<{ key: string; label: string; count: number }>;
  readonly recentSiteFeedbacks: ReadonlyArray<{
    id: string;
    reaction: string;
    comment: string | null;
    submittedAt: Date;
  }>;
}

export async function siteFeedbackAnalyticsForQrScope(args: {
  readonly organizationId: string;
  readonly from: Date;
  readonly to: Date;
  readonly campaignId?: string | null;
  readonly qrCodeId?: string | null;
  readonly totalScans: number;
  readonly recentLimit?: number;
}): Promise<SiteFeedbackAnalyticsBuckets> {
  const scope: Prisma.SiteFeedbackWhereInput = {
    organizationId: args.organizationId,
    createdAt: { gte: args.from, lt: args.to },
    ...(args.campaignId ? { campaignId: args.campaignId } : {}),
    ...(args.qrCodeId ? { qrCodeId: args.qrCodeId } : {}),
    ...(!args.campaignId && !args.qrCodeId
      ? { OR: [{ campaignId: { not: null } }, { qrCodeId: { not: null } }] }
      : {}),
  };

  const recentTake = Math.min(Math.max(args.recentLimit ?? 10, 1), 25);

  const [siteFeedbacksFromQr, byReaction, recent] = await Promise.all([
    prisma.siteFeedback.count({ where: scope }),
    prisma.siteFeedback.groupBy({
      by: ['reaction'],
      where: scope,
      _count: { _all: true },
    }),
    prisma.siteFeedback.findMany({
      where: scope,
      orderBy: [{ createdAt: 'desc' }],
      take: recentTake,
      select: { id: true, reaction: true, comment: true, createdAt: true },
    }),
  ]);

  return {
    siteFeedbacksFromQr,
    siteFeedbackConversionRatePct: rate(siteFeedbacksFromQr, args.totalScans),
    siteFeedbackByReaction: (['GREAT', 'OK', 'WORST'] as const).map((reaction) => {
      const row = byReaction.find((entry) => entry.reaction === reaction);
      return {
        key: reaction,
        label: REACTION_LABELS[reaction] ?? reaction,
        count: row?._count._all ?? 0,
      };
    }),
    recentSiteFeedbacks: recent.map((row) => ({
      id: row.id,
      reaction: row.reaction,
      comment: row.comment,
      submittedAt: row.createdAt,
    })),
  };
}

/** All-time SiteFeedback counts for campaign list/detail rows. */
export async function siteFeedbackCountsForCampaigns(
  organizationId: string,
  campaignIds: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const id of campaignIds) result.set(id, 0);
  if (campaignIds.length === 0) return result;

  const rows = await prisma.siteFeedback.groupBy({
    by: ['campaignId'],
    where: {
      organizationId,
      campaignId: { in: [...campaignIds] },
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (row.campaignId) result.set(row.campaignId, row._count._all);
  }
  return result;
}
