import type {
  AuthContext,
  FollowUpOutcome,
  FollowUpResponse,
  NotificationChannel,
} from '@rk/types';
import type { GraphQLContext } from '../../graphql/context/index';
import { authorizationService } from '../auth/authorization.service';
import type { RequestMeta } from '../issues/cms/issue.service';
import { citizenCommunicationService } from './public/citizenCommunication.service';
import { publicUpdateService } from './cms/publicUpdate.service';
import { communicationService, type CommunicationFilter } from './cms/communication.service';

/**
 * Communication resolvers.
 *
 * Thin: authenticate where required, delegate, map. Every permission check,
 * tenant scope and token verification lives in the service layer, so a resolver
 * is never the only thing between a caller and somebody else's data.
 *
 * THE PUBLIC HANDLERS ARE GROUPED FIRST AND ARE THE ONLY ONES THAT DO NOT CALL
 * `actor()`. That grouping is deliberate and is copied from the Phase 5 issue
 * resolvers: it should be obvious at a glance which handlers run for an
 * anonymous caller, because this is the one fragment in the platform that mixes
 * both. Every public handler either returns only disclosed information or
 * verifies a tracking token before it writes.
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

/** Public handlers get the IP for rate limiting and nothing else from context. */
function publicContext(context: GraphQLContext): {
  ipAddress: string | null;
  correlationId: string;
} {
  return {
    ipAddress: context.requestMeta.ipAddress ?? null,
    correlationId: context.correlationId,
  };
}

function toFilter(input: RawCommunicationFilter | null | undefined): CommunicationFilter | null {
  if (!input) return null;
  return {
    ...input,
    from: input.from ? new Date(input.from) : null,
    to: input.to ? new Date(input.to) : null,
  };
}

export interface RawCommunicationFilter extends Omit<CommunicationFilter, 'from' | 'to'> {
  from?: Date | string | null;
  to?: Date | string | null;
}

export const communicationResolvers = {
  Query: {
    // ----------------------------------------------------------------- public
    publicIssueTimeline: (_p: unknown, args: { reference: string }, context: GraphQLContext) =>
      citizenCommunicationService.timeline(args.reference, context.requestMeta.ipAddress ?? null),

    publicIssueSubscription: (
      _p: unknown,
      args: { reference: string; trackingToken: string },
      context: GraphQLContext,
    ) =>
      citizenCommunicationService.subscription(
        args.reference,
        args.trackingToken,
        context.requestMeta.ipAddress ?? null,
      ),

    // ------------------------------------------------------------------ admin
    communicationOverview: (
      _p: unknown,
      args: { filter?: RawCommunicationFilter | null },
      context: GraphQLContext,
    ) => communicationService.overview(actor(context), toFilter(args.filter)),

    communicationNotifications: (
      _p: unknown,
      args: { filter?: RawCommunicationFilter | null },
      context: GraphQLContext,
    ) => communicationService.notifications(actor(context), toFilter(args.filter)),

    issueCommunication: (_p: unknown, args: { issueId: string }, context: GraphQLContext) =>
      communicationService.forIssue(actor(context), args.issueId),

    issuePublicUpdates: (_p: unknown, args: { issueId: string }, context: GraphQLContext) =>
      publicUpdateService.listForIssue(actor(context), args.issueId),

    communicationFollowUps: (
      _p: unknown,
      args: { pendingOnly?: boolean | null; first?: number | null },
      context: GraphQLContext,
    ) =>
      communicationService.followUps(actor(context), {
        pendingOnly: args.pendingOnly ?? false,
        first: args.first ?? 50,
      }),
  },

  Mutation: {
    // ----------------------------------------------------------------- public
    followIssue: (
      _p: unknown,
      args: {
        input: {
          reference: string;
          trackingToken: string;
          channel: NotificationChannel;
          destination: string;
          consent: boolean;
        };
      },
      context: GraphQLContext,
    ) =>
      citizenCommunicationService.follow(
        {
          reference: args.input.reference,
          token: args.input.trackingToken,
          channel: args.input.channel,
          destination: args.input.destination,
          consent: args.input.consent,
        },
        publicContext(context),
      ),

    unsubscribeFromIssue: (
      _p: unknown,
      args: { reference: string; trackingToken: string },
      context: GraphQLContext,
    ) =>
      citizenCommunicationService.unsubscribe(
        { reference: args.reference, token: args.trackingToken },
        publicContext(context),
      ),

    submitIssueFollowUp: (
      _p: unknown,
      args: {
        input: {
          reference: string;
          trackingToken: string;
          response: FollowUpResponse;
          comment?: string | null;
        };
      },
      context: GraphQLContext,
    ) =>
      citizenCommunicationService.submitFollowUp(
        {
          reference: args.input.reference,
          token: args.input.trackingToken,
          response: args.input.response,
          comment: args.input.comment ?? null,
        },
        publicContext(context),
      ),

    // ------------------------------------------------------------------ admin
    createPublicIssueUpdate: (
      _p: unknown,
      args: { issueId: string; body: string },
      context: GraphQLContext,
    ) =>
      publicUpdateService.createDraft(
        actor(context),
        { issueId: args.issueId, body: args.body },
        meta(context),
      ),

    publishPublicIssueUpdate: (_p: unknown, args: { updateId: string }, context: GraphQLContext) =>
      publicUpdateService.publish(actor(context), args.updateId, meta(context)),

    correctPublicIssueUpdate: (
      _p: unknown,
      args: { updateId: string; body: string },
      context: GraphQLContext,
    ) =>
      publicUpdateService.correct(
        actor(context),
        { updateId: args.updateId, body: args.body },
        meta(context),
      ),

    archivePublicIssueUpdate: (_p: unknown, args: { updateId: string }, context: GraphQLContext) =>
      publicUpdateService.archive(actor(context), args.updateId, meta(context)),

    retryNotification: async (
      _p: unknown,
      args: { notificationId: string },
      context: GraphQLContext,
    ) => {
      const result = await communicationService.retry(
        actor(context),
        args.notificationId,
        meta(context),
      );
      return result.queued;
    },

    reviewIssueFollowUp: (
      _p: unknown,
      args: { followUpId: string; outcome: FollowUpOutcome; note?: string | null },
      context: GraphQLContext,
    ) =>
      communicationService.reviewFollowUp(
        actor(context),
        {
          followUpId: args.followUpId,
          outcome: args.outcome,
          note: args.note ?? null,
        },
        meta(context),
      ),
  },
};
