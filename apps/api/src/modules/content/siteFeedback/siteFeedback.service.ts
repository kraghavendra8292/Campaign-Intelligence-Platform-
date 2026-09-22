import {
  SITE_FEEDBACK_LIMITS,
  isSiteFeedbackReaction,
  type SiteFeedbackReaction,
} from '@rk/types';
import type { AuthContext } from '@rk/types';
import { prisma } from '../../../database/prisma';
import { AppError } from '../../../errors/AppError';
import { auditService } from '../../audit/audit.service';
import { getAttemptLimiter } from '../../auth/rateLimiter';
import { authorizationService } from '../../auth/authorization.service';
import { publicTenantService } from '../../content/public/publicTenant.service';
import { organizationService } from '../../identity/organization.service';
import { resolveQrAttribution } from '../../qr/shared/resolveQrAttribution';

/**
 * Homepage opinion pulse.
 *
 * Public write path: tenant from the site being viewed, rate-limited first,
 * optional commentary capped at 500 characters. No contact fields.
 */

export interface SubmitSiteFeedbackInput {
  readonly organizationSlug?: string | null;
  readonly reaction: SiteFeedbackReaction;
  readonly comment?: string | null;
  /** Public QR code identifier (`rk_qr`) when the visitor arrived via a poster. */
  readonly qrCode?: string | null;
}

export interface SubmissionContext {
  readonly ipAddress: string | null;
  readonly headerSlug?: string | undefined;
  readonly host?: string | undefined;
  readonly correlationId: string;
  readonly userId?: string | null;
}

type ReactionTotals = {
  GREAT: number;
  OK: number;
  WORST: number;
};

function emptyTotals(): ReactionTotals {
  return { GREAT: 0, OK: 0, WORST: 0 };
}

function toSummary(totals: ReactionTotals) {
  const total = totals.GREAT + totals.OK + totals.WORST;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  return {
    total,
    byReaction: (['GREAT', 'OK', 'WORST'] as const).map((reaction) => ({
      reaction,
      count: totals[reaction],
    })),
    greatPercent: pct(totals.GREAT),
    okPercent: pct(totals.OK),
    worstPercent: pct(totals.WORST),
    greatCount: totals.GREAT,
    okCount: totals.OK,
    worstCount: totals.WORST,
  };
}

async function totalsForOrganizations(organizationIds: string[]): Promise<ReactionTotals> {
  const totals = emptyTotals();
  if (organizationIds.length === 0) return totals;

  const grouped = await prisma.siteFeedback.groupBy({
    by: ['reaction'],
    where: { organizationId: { in: organizationIds } },
    _count: { _all: true },
  });

  for (const row of grouped) {
    totals[row.reaction] = row._count._all;
  }
  return totals;
}

async function totalsByOrganization(
  organizationIds: string[],
): Promise<Map<string, ReactionTotals>> {
  const map = new Map<string, ReactionTotals>();
  for (const id of organizationIds) map.set(id, emptyTotals());
  if (organizationIds.length === 0) return map;

  const grouped = await prisma.siteFeedback.groupBy({
    by: ['organizationId', 'reaction'],
    where: { organizationId: { in: organizationIds } },
    _count: { _all: true },
  });

  for (const row of grouped) {
    const bucket = map.get(row.organizationId) ?? emptyTotals();
    bucket[row.reaction] = row._count._all;
    map.set(row.organizationId, bucket);
  }
  return map;
}

function normalizeComment(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > SITE_FEEDBACK_LIMITS.maxCommentChars) {
    throw AppError.validation(
      `Please keep your comment to ${SITE_FEEDBACK_LIMITS.maxCommentChars} characters or fewer.`,
      { details: { field: 'comment', max: SITE_FEEDBACK_LIMITS.maxCommentChars } },
    );
  }
  return trimmed;
}

export const siteFeedbackService = {
  async submit(input: SubmitSiteFeedbackInput, ctx: SubmissionContext) {
    const limiter = getAttemptLimiter();
    const ipKey = `site-feedback:${ctx.ipAddress ?? 'unknown'}`;
    const attempt = await limiter.consume(
      ipKey,
      SITE_FEEDBACK_LIMITS.maxPerWindow,
      SITE_FEEDBACK_LIMITS.windowMs,
    );
    if (!attempt.allowed) {
      throw AppError.rateLimited('Too many submissions. Please wait a moment and try again.');
    }

    if (!isSiteFeedbackReaction(input.reaction)) {
      throw AppError.validation('Please choose Great, Ok, or Worst.', {
        details: { field: 'reaction' },
      });
    }

    const tenant = await publicTenantService.resolve({
      organizationSlug: input.organizationSlug ?? null,
      headerSlug: ctx.headerSlug,
      host: ctx.host,
    });

    const comment = normalizeComment(input.comment);
    const attribution = await resolveQrAttribution(tenant.organizationId, input.qrCode);

    const row = await prisma.siteFeedback.create({
      data: {
        organizationId: tenant.organizationId,
        reaction: input.reaction,
        comment,
        submittedByUserId: ctx.userId ?? null,
        campaignId: attribution.campaignId,
        qrCodeId: attribution.qrCodeId,
      },
      select: { id: true, reaction: true, createdAt: true },
    });

    await auditService.record({
      action: 'SITE_FEEDBACK_SUBMITTED',
      organizationId: tenant.organizationId,
      actorUserId: ctx.userId ?? null,
      entityType: 'SiteFeedback',
      entityId: row.id,
      metadata: {
        reaction: row.reaction,
        hasComment: Boolean(comment),
        campaignId: attribution.campaignId,
        qrCodeId: attribution.qrCodeId,
      },
      ipAddress: null,
      userAgent: null,
      correlationId: ctx.correlationId,
    });

    return {
      id: row.id,
      reaction: row.reaction,
      submittedAt: row.createdAt,
    };
  },

  async list(
    auth: AuthContext | null,
    args: { first?: number | null; after?: string | null; reaction?: SiteFeedbackReaction | null },
  ) {
    authorizationService.requirePermission(auth, 'ISSUE_READ');
    const { organizationId } = authorizationService.requireOrganization(auth);

    const take = Math.min(Math.max(args.first ?? 25, 1), 100);
    const cursorId = args.after?.trim() || null;

    const where = {
      organizationId,
      ...(args.reaction ? { reaction: args.reaction } : {}),
    };

    const rows = await prisma.siteFeedback.findMany({
      where,
      take: take + 1,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        reaction: true,
        comment: true,
        createdAt: true,
        submittedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    const hasNext = rows.length > take;
    const nodes = hasNext ? rows.slice(0, take) : rows;
    const last = nodes[nodes.length - 1];

    return {
      nodes: nodes.map((row) => ({
        id: row.id,
        reaction: row.reaction,
        comment: row.comment,
        submittedAt: row.createdAt,
        submittedBy: row.submittedBy,
      })),
      pageInfo: {
        endCursor: last?.id ?? null,
        hasNextPage: hasNext,
      },
    };
  },

  async summary(auth: AuthContext | null) {
    authorizationService.requirePermission(auth, 'ISSUE_ANALYTICS_READ');
    const { organizationId } = authorizationService.requireOrganization(auth);
    return toSummary(await totalsForOrganizations([organizationId]));
  },

  /**
   * Active campaign pulse + overall across every organisation the caller can
   * see + per-organisation rows (labelled as campaigns in the console).
   */
  async dashboardOverview(auth: AuthContext | null) {
    authorizationService.requirePermission(auth, 'ISSUE_ANALYTICS_READ');
    const { organizationId, auth: authed } = authorizationService.requireOrganization(auth);

    const visible = await organizationService.listVisibleOrganizations(authed);
    const orgIds = visible.map((org) => org.id);
    const byOrg = await totalsByOrganization(orgIds);
    const overallTotals = emptyTotals();

    const campaigns = visible.map((org) => {
      const totals = byOrg.get(org.id) ?? emptyTotals();
      overallTotals.GREAT += totals.GREAT;
      overallTotals.OK += totals.OK;
      overallTotals.WORST += totals.WORST;
      const summary = toSummary(totals);
      return {
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        isActive: org.id === organizationId,
        total: summary.total,
        greatCount: summary.greatCount,
        okCount: summary.okCount,
        worstCount: summary.worstCount,
        greatPercent: summary.greatPercent,
        okPercent: summary.okPercent,
        worstPercent: summary.worstPercent,
      };
    });

    campaigns.sort(
      (a, b) => b.total - a.total || a.organizationName.localeCompare(b.organizationName),
    );

    return {
      current: toSummary(byOrg.get(organizationId) ?? emptyTotals()),
      overall: toSummary(overallTotals),
      campaigns,
    };
  },
};
