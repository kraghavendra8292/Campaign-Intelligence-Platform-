import type { AuthContext, TrendGranularity } from '@rk/types';
import type { GraphQLContext } from '../../graphql/context/index';
import { authorizationService } from '../auth/authorization.service';
import type { RequestMeta } from '../issues/cms/issue.service';
import { analyticsService } from './analytics.service';
import { geoAnalyticsService } from './geoAnalytics.service';
import { resolutionAnalyticsService } from './resolutionAnalytics.service';
import { intelligenceAnalyticsService } from './intelligenceAnalytics.service';
import { analyticsExportService, type AnalyticsExportDataset } from './analyticsExport.service';
import type { AnalyticsFilter } from './shared/analyticsFilters';

/**
 * Analytics resolvers.
 *
 * Thin: authenticate, delegate, map - matching every other resolver module in
 * this codebase. Every permission check, tenant scope and filter validation
 * lives in the service layer, so a resolver is never the only thing between a
 * client and another tenant's data.
 *
 * THERE ARE NO PUBLIC RESOLVERS IN THIS FILE. Every handler calls `actor()`,
 * and there is no mutation at all - Phase 7 only reads. That uniformity is the
 * point: there is no "which of these is public?" question to answer wrongly.
 *
 * The only shaping done here is renaming `range` to `period` for the wire,
 * because `AnalyticsPeriod` reads better in a schema than a field called
 * `range` that is not a range type.
 */

function actor(context: GraphQLContext): AuthContext {
  return authorizationService.requireAuth(context.auth);
}

function meta(context: GraphQLContext): RequestMeta {
  return {
    ipAddress: context.requestMeta.ipAddress,
    userAgent: context.requestMeta.userAgent,
    correlationId: context.correlationId,
  };
}

/**
 * The DateTime scalar yields `Date`; the filter carries ISO strings.
 *
 * Converted here rather than in the service so the service's input type stays
 * a plain serialisable shape that a test can construct without a scalar.
 */
function toFilter(input: RawFilter | null | undefined): AnalyticsFilter | null {
  if (!input) return null;

  return {
    ...input,
    from: iso(input.from),
    to: iso(input.to),
  };
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * The filter as it arrives over the wire.
 *
 * Exported because the merged root resolver map's inferred type names it.
 */
export interface RawFilter extends Omit<AnalyticsFilter, 'from' | 'to'> {
  from?: Date | string | null;
  to?: Date | string | null;
}

/** Service `range` becomes wire `period`. */
function withPeriod<T extends { range: unknown }>(
  value: T,
): Omit<T, 'range'> & { period: unknown } {
  const { range, ...rest } = value;
  return { ...rest, period: range };
}

export const analyticsResolvers = {
  Query: {
    analyticsOverview: async (
      _p: unknown,
      args: { filter?: RawFilter | null },
      context: GraphQLContext,
    ) => {
      const overview = await analyticsService.overview(actor(context), toFilter(args.filter));
      const { previousRange, ...rest } = withPeriod(overview);
      return { ...rest, previousPeriod: previousRange };
    },

    analyticsTrend: async (
      _p: unknown,
      args: { filter?: RawFilter | null; granularity?: TrendGranularity | null },
      context: GraphQLContext,
    ) =>
      withPeriod(
        await analyticsService.trend(actor(context), toFilter(args.filter), args.granularity),
      ),

    analyticsByCategory: (
      _p: unknown,
      args: { filter?: RawFilter | null },
      context: GraphQLContext,
    ) => analyticsService.byCategory(actor(context), toFilter(args.filter)),

    analyticsByStatus: (
      _p: unknown,
      args: { filter?: RawFilter | null },
      context: GraphQLContext,
    ) => analyticsService.byStatus(actor(context), toFilter(args.filter)),

    analyticsByPriority: (
      _p: unknown,
      args: { filter?: RawFilter | null },
      context: GraphQLContext,
    ) => analyticsService.byPriority(actor(context), toFilter(args.filter)),

    analyticsAreas: (
      _p: unknown,
      args: { filter?: RawFilter | null; limit?: number | null },
      context: GraphQLContext,
    ) => geoAnalyticsService.areas(actor(context), toFilter(args.filter), args.limit),

    analyticsAreaAttention: (
      _p: unknown,
      args: { filter?: RawFilter | null; limit?: number | null },
      context: GraphQLContext,
    ) => geoAnalyticsService.attention(actor(context), toFilter(args.filter), args.limit ?? 10),

    analyticsAreaDetail: async (
      _p: unknown,
      args: { area: string; filter?: RawFilter | null },
      context: GraphQLContext,
    ) =>
      withPeriod(
        await geoAnalyticsService.areaDetail(actor(context), args.area, toFilter(args.filter)),
      ),

    analyticsAreaOptions: (
      _p: unknown,
      args: { filter?: RawFilter | null },
      context: GraphQLContext,
    ) => geoAnalyticsService.areaOptions(actor(context), toFilter(args.filter)),

    analyticsResolution: async (
      _p: unknown,
      args: { filter?: RawFilter | null },
      context: GraphQLContext,
    ) =>
      withPeriod(await resolutionAnalyticsService.summary(actor(context), toFilter(args.filter))),

    analyticsBacklog: (
      _p: unknown,
      args: { filter?: RawFilter | null; limit?: number | null },
      context: GraphQLContext,
    ) =>
      analyticsService.highPriorityBacklog(actor(context), toFilter(args.filter), args.limit ?? 50),

    analyticsThemes: (_p: unknown, args: { filter?: RawFilter | null }, context: GraphQLContext) =>
      intelligenceAnalyticsService.themes(actor(context), toFilter(args.filter)),

    analyticsTopics: (_p: unknown, args: { filter?: RawFilter | null }, context: GraphQLContext) =>
      intelligenceAnalyticsService.topics(actor(context), toFilter(args.filter)),

    analyticsSource: async (
      _p: unknown,
      args: { filter?: RawFilter | null },
      context: GraphQLContext,
    ) => {
      const result = await intelligenceAnalyticsService.source(
        actor(context),
        toFilter(args.filter),
      );
      return result ? withPeriod(result) : null;
    },

    analyticsInsights: (
      _p: unknown,
      args: { filter?: RawFilter | null },
      context: GraphQLContext,
    ) => intelligenceAnalyticsService.insights(actor(context), toFilter(args.filter)),

    analyticsExportCsv: (
      _p: unknown,
      args: { dataset: AnalyticsExportDataset; filter?: RawFilter | null },
      context: GraphQLContext,
    ) =>
      analyticsExportService.exportCsv(
        actor(context),
        args.dataset,
        toFilter(args.filter),
        meta(context),
      ),
  },
};
