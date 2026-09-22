import type { AuthContext, QrCampaignStatus, QrCampaignType } from '@rk/types';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { auditService } from '../../audit/audit.service';
import {
  assertDateRange,
  clampQrPageSize,
  normalizeCampaignSlug,
  optionalText,
  parseOptionalDate,
  requireQrAccess,
  requireText,
  rethrowSlugConflict,
} from '../shared/qrGuards';
import {
  EMPTY_CAMPAIGN_ISSUE_STATS,
  issueStatsForCampaigns,
  type CampaignIssueStats,
} from '../shared/campaignIssueStats';

/**
 * QR campaign administration.
 *
 * Every method follows the Phase 3 shape: check the permission, resolve the
 * tenant from the authenticated context, then load the target SCOPED TO THAT
 * TENANT. The scoped load is what makes cross-tenant access impossible rather
 * than merely unlikely - an id from another organisation simply does not match
 * the where clause, and the caller gets NOT_FOUND.
 *
 * NOT_FOUND rather than FORBIDDEN for a cross-tenant id, matching Phase 2/3: a
 * distinct "forbidden" would confirm the id exists somewhere, turning the error
 * into an oracle for enumerating other tenants' campaigns.
 */

const CAMPAIGN_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  campaignType: true,
  status: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { qrCodes: true, scanEvents: true } },
} satisfies Prisma.QrCampaignSelect;

export type CampaignWithIssueStats = Prisma.QrCampaignGetPayload<{
  select: typeof CAMPAIGN_SELECT;
}> &
  CampaignIssueStats;

async function withIssueStats(
  organizationId: string,
  rows: ReadonlyArray<Prisma.QrCampaignGetPayload<{ select: typeof CAMPAIGN_SELECT }>>,
): Promise<CampaignWithIssueStats[]> {
  const scansByCampaignId = new Map(rows.map((row) => [row.id, row._count.scanEvents]));
  const stats = await issueStatsForCampaigns(
    organizationId,
    rows.map((row) => row.id),
    scansByCampaignId,
  );
  return rows.map((row) => ({
    ...row,
    ...(stats.get(row.id) ?? EMPTY_CAMPAIGN_ISSUE_STATS),
  }));
}

export interface QrCampaignInput {
  readonly name: string;
  readonly slug?: string | null;
  readonly description?: string | null;
  readonly campaignType?: QrCampaignType | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

export interface QrCampaignListArgs {
  readonly first?: number | null;
  readonly status?: QrCampaignStatus | null;
  readonly campaignType?: QrCampaignType | null;
  readonly search?: string | null;
}

/**
 * Status transitions an administrator may request.
 *
 * Modelled as named actions rather than "set status to X" so the permitted
 * transitions are enumerable and auditable. ACTIVATE from ARCHIVED is allowed
 * on purpose: a campaign archived by mistake must be recoverable, because the
 * physical posters are still out there.
 */
export const CAMPAIGN_ACTIONS = ['ACTIVATE', 'PAUSE', 'COMPLETE', 'ARCHIVE'] as const;
export type QrCampaignAction = (typeof CAMPAIGN_ACTIONS)[number];

const ACTION_STATUS: Record<QrCampaignAction, QrCampaignStatus> = {
  ACTIVATE: 'ACTIVE',
  PAUSE: 'PAUSED',
  COMPLETE: 'COMPLETED',
  ARCHIVE: 'ARCHIVED',
};

export const qrCampaignService = {
  async list(auth: AuthContext, args: QrCampaignListArgs) {
    const { organizationId } = requireQrAccess(auth, 'QR_CAMPAIGN', 'READ');
    const take = clampQrPageSize(args.first);

    const where: Prisma.QrCampaignWhereInput = {
      organizationId,
      ...(args.status ? { status: args.status } : {}),
      ...(args.campaignType ? { campaignType: args.campaignType } : {}),
      ...(args.search
        ? { name: { contains: args.search.trim(), mode: 'insensitive' as const } }
        : {}),
    };

    const [nodes, totalCount] = await Promise.all([
      prisma.qrCampaign.findMany({
        where,
        select: CAMPAIGN_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        take,
      }),
      prisma.qrCampaign.count({ where }),
    ]);

    return { nodes: await withIssueStats(organizationId, nodes), totalCount };
  },

  async getById(auth: AuthContext, id: string) {
    const { organizationId } = requireQrAccess(auth, 'QR_CAMPAIGN', 'READ');

    const campaign = await prisma.qrCampaign.findFirst({
      // Tenant in the WHERE clause, not checked afterwards: a filter cannot be
      // forgotten the way a post-hoc comparison can.
      where: { id, organizationId },
      select: CAMPAIGN_SELECT,
    });

    if (!campaign) throw AppError.notFound('This QR campaign is not available.');
    const [enriched] = await withIssueStats(organizationId, [campaign]);
    return enriched!;
  },

  async create(auth: AuthContext, input: QrCampaignInput, meta: RequestMeta) {
    const { organizationId } = requireQrAccess(auth, 'QR_CAMPAIGN', 'CREATE');

    const name = requireText(input.name, 'name', 200);
    const slug = normalizeCampaignSlug(input.slug, name);
    const startDate = parseOptionalDate(input.startDate, 'startDate');
    const endDate = parseOptionalDate(input.endDate, 'endDate');
    assertDateRange(startDate, endDate);

    try {
      const campaign = await prisma.qrCampaign.create({
        data: {
          organizationId,
          slug,
          name,
          description: optionalText(input.description, 'description', 1000),
          campaignType: input.campaignType ?? 'OTHER',
          // Always DRAFT on creation. Activation is a separate act requiring a
          // separate permission, so nobody can create-and-activate in one step.
          status: 'DRAFT',
          startDate,
          endDate,
          createdById: auth.userId,
        },
        select: CAMPAIGN_SELECT,
      });

      await auditService.record({
        action: 'QR_CAMPAIGN_CREATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'QrCampaign',
        entityId: campaign.id,
        metadata: { name: campaign.name, slug: campaign.slug, type: campaign.campaignType },
        ...meta,
      });

      return { ...campaign, ...EMPTY_CAMPAIGN_ISSUE_STATS };
    } catch (error) {
      rethrowSlugConflict(error, slug);
    }
  },

  async update(auth: AuthContext, id: string, input: QrCampaignInput, meta: RequestMeta) {
    const { organizationId } = requireQrAccess(auth, 'QR_CAMPAIGN', 'UPDATE');

    const existing = await prisma.qrCampaign.findFirst({
      where: { id, organizationId },
      select: { id: true, slug: true },
    });
    if (!existing) throw AppError.notFound('This QR campaign is not available.');

    const name = requireText(input.name, 'name', 200);
    const slug = normalizeCampaignSlug(input.slug, name);
    const startDate = parseOptionalDate(input.startDate, 'startDate');
    const endDate = parseOptionalDate(input.endDate, 'endDate');
    assertDateRange(startDate, endDate);

    try {
      const campaign = await prisma.qrCampaign.update({
        where: { id: existing.id },
        data: {
          slug,
          name,
          description: optionalText(input.description, 'description', 1000),
          ...(input.campaignType ? { campaignType: input.campaignType } : {}),
          startDate,
          endDate,
        },
        select: CAMPAIGN_SELECT,
      });

      await auditService.record({
        action: 'QR_CAMPAIGN_UPDATED',
        organizationId,
        actorUserId: auth.userId,
        entityType: 'QrCampaign',
        entityId: campaign.id,
        metadata: { name: campaign.name, slug: campaign.slug },
        ...meta,
      });

      const [enriched] = await withIssueStats(organizationId, [campaign]);
      return enriched!;
    } catch (error) {
      rethrowSlugConflict(error, slug);
    }
  },

  /**
   * Moves a campaign through its lifecycle.
   *
   * Requires ARCHIVE rather than UPDATE for every transition, including
   * ACTIVATE. Turning a campaign on is the moment its codes start being printed
   * and distributed, which is a heavier act than renaming it.
   *
   * Note what this does NOT do: it leaves the campaign's QR codes alone.
   * Completing a campaign is a statement about the campaign's schedule, not an
   * instruction to break every poster already on a wall. Retiring the codes is
   * a separate, explicit act per code.
   */
  async transition(auth: AuthContext, id: string, action: QrCampaignAction, meta: RequestMeta) {
    const { organizationId } = requireQrAccess(auth, 'QR_CAMPAIGN', 'ARCHIVE');

    const existing = await prisma.qrCampaign.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!existing) throw AppError.notFound('This QR campaign is not available.');

    const status = ACTION_STATUS[action];

    const campaign = await prisma.qrCampaign.update({
      where: { id: existing.id },
      data: { status },
      select: CAMPAIGN_SELECT,
    });

    await auditService.record({
      action: 'QR_CAMPAIGN_STATUS_CHANGED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'QrCampaign',
      entityId: campaign.id,
      metadata: { from: existing.status, to: status, requested: action },
      ...meta,
    });

    const [enriched] = await withIssueStats(organizationId, [campaign]);
    return enriched!;
  },
};

/** Client metadata forwarded to the audit trail. */
export interface RequestMeta {
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly correlationId?: string | null;
}
