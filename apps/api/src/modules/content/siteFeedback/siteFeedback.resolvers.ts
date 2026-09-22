import type { SiteFeedbackReaction } from '@rk/types';
import type { GraphQLContext } from '../../../graphql/context';
import { siteFeedbackService, type SubmitSiteFeedbackInput } from './siteFeedback.service';

function headerValue(context: GraphQLContext, name: string): string | undefined {
  const value = context.req.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

function actor(context: GraphQLContext) {
  return context.auth;
}

export const siteFeedbackResolvers = {
  Query: {
    siteFeedbackList: (
      _p: unknown,
      args: {
        first?: number | null;
        after?: string | null;
        reaction?: SiteFeedbackReaction | null;
      },
      context: GraphQLContext,
    ) => siteFeedbackService.list(actor(context), args),

    siteFeedbackSummary: (_p: unknown, _args: unknown, context: GraphQLContext) =>
      siteFeedbackService.summary(actor(context)),

    siteFeedbackDashboardOverview: (_p: unknown, _args: unknown, context: GraphQLContext) =>
      siteFeedbackService.dashboardOverview(actor(context)),
  },

  Mutation: {
    submitSiteFeedback: (
      _p: unknown,
      args: { input: SubmitSiteFeedbackInput },
      context: GraphQLContext,
    ) =>
      siteFeedbackService.submit(args.input, {
        ipAddress: context.requestMeta.ipAddress ?? null,
        headerSlug: headerValue(context, 'x-organization-slug'),
        host: headerValue(context, 'host'),
        correlationId: context.correlationId,
        userId: context.auth?.userId ?? null,
      }),
  },
};
