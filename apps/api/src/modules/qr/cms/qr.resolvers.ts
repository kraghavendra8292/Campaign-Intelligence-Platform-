import type {
  AuthContext,
  AnalyticsRange,
  QrCampaignStatus,
  QrCampaignType,
  QrCodeStatus,
} from '@rk/types';
import type { GraphQLContext } from '../../../graphql/context/index';
import { authorizationService } from '../../auth/authorization.service';
import { getEnv } from '../../../config/env';
import { PUBLIC_DESTINATION_ROOTS } from '../shared/qrGuards';
import {
  qrCampaignService,
  type QrCampaignAction,
  type QrCampaignInput,
  type RequestMeta,
} from './qrCampaign.service';
import { qrCodeService, type QrCodeAction, type QrCodeInput } from './qrCode.service';
import { qrAnalyticsService, type AnalyticsArgs } from './qrAnalytics.service';
import { buildScanUrl, qrImageService } from './qrImage.service';

/**
 * QR resolvers.
 *
 * Thin by design, exactly like the CMS resolvers: authenticate, delegate, map.
 * Every permission and tenant check lives in the service layer, so a resolver
 * is never the only thing standing between a client and another tenant's data.
 */

function actor(context: GraphQLContext): AuthContext {
  return authorizationService.requireAuth(context.auth);
}

/** Audit metadata, taken from the request rather than from arguments. */
function meta(context: GraphQLContext): RequestMeta {
  return {
    ipAddress: context.requestMeta.ipAddress,
    userAgent: context.requestMeta.userAgent,
    correlationId: context.correlationId,
  };
}

type CampaignRow = Awaited<ReturnType<typeof qrCampaignService.getById>>;
type CodeRow = Awaited<ReturnType<typeof qrCodeService.getById>>;

/** Flattens Prisma's `_count` into the scalar fields the schema exposes. */
function mapCampaign(row: CampaignRow) {
  const {
    _count,
    issueCount,
    openIssueCount,
    siteFeedbackCount,
    conversionRatePct,
    ...rest
  } = row;
  return {
    ...rest,
    qrCodeCount: _count.qrCodes,
    totalScans: _count.scanEvents,
    issueCount,
    openIssueCount,
    siteFeedbackCount,
    conversionRatePct,
  };
}

function mapCode(row: CodeRow) {
  const { _count, latitude, longitude, ...rest } = row;
  return {
    ...rest,
    // Prisma returns Decimal for these columns; GraphQL Float needs a number.
    latitude: latitude === null ? null : Number(latitude),
    longitude: longitude === null ? null : Number(longitude),
    totalScans: _count.scanEvents,
  };
}

export interface QrListArgs {
  first?: number | null;
  status?: QrCampaignStatus | null;
  campaignType?: QrCampaignType | null;
  search?: string | null;
}

export interface QrCodeListArgs {
  first?: number | null;
  campaignId?: string | null;
  status?: QrCodeStatus | null;
  search?: string | null;
}

export interface AnalyticsFilterArg {
  range?: AnalyticsRange | null;
  from?: Date | string | null;
  to?: Date | string | null;
  campaignId?: string | null;
  qrCodeId?: string | null;
  excludeAutomated?: boolean | null;
}

/** The DateTime scalar yields `Date`; the service takes ISO strings. */
function toFilter(filter: AnalyticsFilterArg | null | undefined): AnalyticsArgs {
  const iso = (value: Date | string | null | undefined): string | null => {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : value;
  };

  return {
    range: filter?.range ?? null,
    from: iso(filter?.from),
    to: iso(filter?.to),
    campaignId: filter?.campaignId ?? null,
    qrCodeId: filter?.qrCodeId ?? null,
    excludeAutomated: filter?.excludeAutomated ?? null,
  };
}

export const qrResolvers = {
  Query: {
    qrCampaigns: async (_p: unknown, args: QrListArgs, context: GraphQLContext) => {
      const page = await qrCampaignService.list(actor(context), args);
      return { nodes: page.nodes.map(mapCampaign), totalCount: page.totalCount };
    },

    qrCampaign: async (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      mapCampaign(await qrCampaignService.getById(actor(context), args.id)),

    qrCodes: async (_p: unknown, args: QrCodeListArgs, context: GraphQLContext) => {
      const page = await qrCodeService.list(actor(context), args);
      return { nodes: page.nodes.map(mapCode), totalCount: page.totalCount };
    },

    qrCode: async (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      mapCode(await qrCodeService.getById(actor(context), args.id)),

    qrAnalytics: (
      _p: unknown,
      args: { filter?: AnalyticsFilterArg | null },
      context: GraphQLContext,
    ) => qrAnalyticsService.summary(actor(context), toFilter(args.filter)),

    qrCampaignComparison: (
      _p: unknown,
      args: { filter?: AnalyticsFilterArg | null },
      context: GraphQLContext,
    ) => qrAnalyticsService.compareCampaigns(actor(context), toFilter(args.filter)),

    qrAnalyticsCsv: (
      _p: unknown,
      args: { filter?: AnalyticsFilterArg | null },
      context: GraphQLContext,
    ) => qrAnalyticsService.exportCsv(actor(context), toFilter(args.filter)),

    /**
     * Destinations an editor may choose.
     *
     * Served from the same allow-list the validator enforces, so the picker
     * cannot drift out of sync with what the server will accept. Behind
     * QR_CODE_READ because it describes the tenant's own site structure.
     */
    qrDestinationOptions: (_p: unknown, _a: unknown, context: GraphQLContext) => {
      authorizationService.requirePermission(context.auth, 'QR_CODE_READ');
      return PUBLIC_DESTINATION_ROOTS;
    },
  },

  QrCode: {
    /**
     * The printable asset, resolved lazily.
     *
     * A field rather than part of the row because rendering a PNG costs real
     * CPU and a list of fifty codes must not pay it fifty times when the client
     * only wanted names. Clients ask for `image` on a detail screen.
     *
     * Returns null rather than throwing when the caller lacks
     * QR_CODE_DOWNLOAD: the rest of the code is legitimately readable, and
     * failing the whole query over one optional field would be hostile.
     */
    image: async (parent: { code: string }, _a: unknown, context: GraphQLContext) => {
      if (!authorizationService.can(context.auth, 'QR_CODE_DOWNLOAD')) return null;

      const env = getEnv();
      const scanUrl = buildScanUrl(env.QR_SCAN_BASE_URL, parent.code);
      return qrImageService.render(scanUrl);
    },
  },

  Mutation: {
    createQrCampaign: async (
      _p: unknown,
      args: { input: QrCampaignInput },
      context: GraphQLContext,
    ) => mapCampaign(await qrCampaignService.create(actor(context), args.input, meta(context))),

    updateQrCampaign: async (
      _p: unknown,
      args: { id: string; input: QrCampaignInput },
      context: GraphQLContext,
    ) =>
      mapCampaign(
        await qrCampaignService.update(actor(context), args.id, args.input, meta(context)),
      ),

    transitionQrCampaign: async (
      _p: unknown,
      args: { id: string; action: QrCampaignAction },
      context: GraphQLContext,
    ) =>
      mapCampaign(
        await qrCampaignService.transition(actor(context), args.id, args.action, meta(context)),
      ),

    createQrCode: async (
      _p: unknown,
      args: { campaignId: string; input: QrCodeInput },
      context: GraphQLContext,
    ) =>
      mapCode(
        await qrCodeService.create(actor(context), args.campaignId, args.input, meta(context)),
      ),

    updateQrCode: async (
      _p: unknown,
      args: { id: string; input: QrCodeInput },
      context: GraphQLContext,
    ) => mapCode(await qrCodeService.update(actor(context), args.id, args.input, meta(context))),

    transitionQrCode: async (
      _p: unknown,
      args: { id: string; action: QrCodeAction },
      context: GraphQLContext,
    ) =>
      mapCode(await qrCodeService.transition(actor(context), args.id, args.action, meta(context))),
  },
};
