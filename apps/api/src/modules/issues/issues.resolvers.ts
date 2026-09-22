import type {
  AnalyticsRange,
  AuthContext,
  IssuePriority,
  IssueStatus,
  ModerationStatus,
} from '@rk/types';
import type { GraphQLContext } from '../../graphql/context/index';
import { prisma } from '../../database/prisma';
import { authorizationService } from '../auth/authorization.service';
import { publicTenantService } from '../content/public/publicTenant.service';
import { issueSubmissionService, type SubmitIssueInput } from './public/issueSubmission.service';
import { issueTrackingService } from './public/issueTracking.service';
import { issueService, type IssueListArgs, type RequestMeta } from './cms/issue.service';
import { issueAnalyticsService } from './cms/issueAnalytics.service';

/**
 * Issue resolvers.
 *
 * Thin: authenticate, delegate, map. Every permission and tenant check lives in
 * the service layer, so a resolver is never the only thing standing between a
 * client and another tenant's data.
 *
 * The public resolvers are grouped first and are the only ones that do NOT call
 * `actor()`. That grouping is deliberate - it should be obvious at a glance
 * which handlers run for an anonymous caller.
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

function headerValue(context: GraphQLContext, name: string): string | undefined {
  const value = context.req.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

/** `publicTenantService` takes a nullable slug; headers give undefined. */
function headerSlug(context: GraphQLContext, name: string): string | null {
  return headerValue(context, name) ?? null;
}

/** The DateTime scalar yields `Date`; services take ISO strings. */
function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export interface PublicSiteArg {
  organizationSlug?: string | null;
  locale?: string | null;
}

export interface IssueFilterArg extends Omit<IssueListArgs, 'from' | 'to'> {
  from?: Date | string | null;
  to?: Date | string | null;
}

export interface IssueAnalyticsFilterArg {
  range?: AnalyticsRange | null;
  from?: Date | string | null;
  to?: Date | string | null;
}

export const issueResolvers = {
  Query: {
    // ----------------------------------------------------------------- public
    /**
     * Categories for the public form.
     *
     * Active ones only, and only the key and label - the internal id, the usage
     * count and the display order are all administrative detail a citizen has
     * no reason to receive.
     */
    publicIssueCategories: async (
      _p: unknown,
      args: { input?: PublicSiteArg | null },
      context: GraphQLContext,
    ) => {
      const tenant = await publicTenantService.resolve({
        organizationSlug:
          args.input?.organizationSlug ?? headerSlug(context, 'x-organization-slug'),
        host: headerValue(context, 'host'),
      });

      const categories = await prisma.issueCategory.findMany({
        where: { organizationId: tenant.organizationId, isActive: true },
        select: { key: true, label: true },
        orderBy: [{ displayOrder: 'asc' }, { label: 'asc' }],
      });

      return categories;
    },

    publicIssueStatus: (_p: unknown, args: { referenceNumber: string }, context: GraphQLContext) =>
      issueTrackingService.lookup(args.referenceNumber, {
        ipAddress: context.requestMeta.ipAddress ?? null,
      }),

    // ------------------------------------------------------------------ admin
    issues: (_p: unknown, args: { filter?: IssueFilterArg | null }, context: GraphQLContext) =>
      issueService.list(actor(context), {
        ...(args.filter ?? {}),
        from: iso(args.filter?.from),
        to: iso(args.filter?.to),
      }),

    issue: (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      issueService.getById(actor(context), args.id),

    issueHistory: (_p: unknown, args: { issueId: string }, context: GraphQLContext) =>
      issueService.history(actor(context), args.issueId),

    issueNotes: (_p: unknown, args: { issueId: string }, context: GraphQLContext) =>
      issueService.notes(actor(context), args.issueId),

    issueAttachments: (_p: unknown, args: { issueId: string }, context: GraphQLContext) =>
      issueService.attachments(actor(context), args.issueId),

    issueCategories: async (
      _p: unknown,
      args: { includeInactive?: boolean | null },
      context: GraphQLContext,
    ) => {
      const rows = await issueService.categories(actor(context), args.includeInactive ?? false);
      return rows.map(({ _count, ...rest }) => ({ ...rest, issueCount: _count.issues }));
    },

    issueAnalytics: (
      _p: unknown,
      args: { filter?: IssueAnalyticsFilterArg | null },
      context: GraphQLContext,
    ) =>
      issueAnalyticsService.summary(actor(context), {
        range: args.filter?.range ?? null,
        from: iso(args.filter?.from),
        to: iso(args.filter?.to),
      }),

    /**
     * Who a submission can be assigned to.
     *
     * Behind ISSUE_ASSIGN rather than USER_READ: this is a colleague picker for
     * one specific act, and somebody who cannot assign has no reason to be
     * handed a staff directory. Scoped to the active tenant's memberships, so
     * it cannot enumerate users of another organisation.
     */
    issueAssignees: async (_p: unknown, _a: unknown, context: GraphQLContext) => {
      const permitted = authorizationService.requirePermission(context.auth, 'ISSUE_ASSIGN');
      const { organizationId } = authorizationService.requireOrganization(permitted);

      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId, user: { status: 'ACTIVE' } },
        select: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { user: { fullName: 'asc' } },
      });

      return memberships.map((membership) => membership.user);
    },
  },

  Mutation: {
    // ----------------------------------------------------------------- public
    submitIssue: (_p: unknown, args: { input: SubmitIssueInput }, context: GraphQLContext) =>
      issueSubmissionService.submit(args.input, {
        // The IP is consumed by the rate limiter and then discarded; it is
        // never written to the submission.
        ipAddress: context.requestMeta.ipAddress ?? null,
        headerSlug: headerValue(context, 'x-organization-slug'),
        host: headerValue(context, 'host'),
        correlationId: context.correlationId,
      }),

    // ------------------------------------------------------------------ admin
    updateIssue: (
      _p: unknown,
      args: { id: string; input: Record<string, never> },
      context: GraphQLContext,
    ) => issueService.update(actor(context), args.id, args.input, meta(context)),

    updateIssueStatus: (
      _p: unknown,
      args: { id: string; status: IssueStatus },
      context: GraphQLContext,
    ) => issueService.updateStatus(actor(context), args.id, args.status, meta(context)),

    updateIssuePriority: (
      _p: unknown,
      args: { id: string; priority: IssuePriority },
      context: GraphQLContext,
    ) => issueService.updatePriority(actor(context), args.id, args.priority, meta(context)),

    assignIssue: (_p: unknown, args: { id: string; userId: string }, context: GraphQLContext) =>
      issueService.assign(actor(context), args.id, args.userId, meta(context)),

    unassignIssue: (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      issueService.assign(actor(context), args.id, null, meta(context)),

    moderateIssue: (
      _p: unknown,
      args: { id: string; moderationStatus: ModerationStatus },
      context: GraphQLContext,
    ) => issueService.moderate(actor(context), args.id, args.moderationStatus, meta(context)),

    addIssueInternalNote: (
      _p: unknown,
      args: { issueId: string; note: string },
      context: GraphQLContext,
    ) => issueService.addNote(actor(context), args.issueId, args.note, meta(context)),

    setIssueCategoryActive: async (
      _p: unknown,
      args: { id: string; isActive: boolean },
      context: GraphQLContext,
    ) => {
      const row = await issueService.setCategoryActive(
        actor(context),
        args.id,
        args.isActive,
        meta(context),
      );
      const { _count, ...rest } = row;
      return { ...rest, issueCount: _count.issues };
    },

    revealIssueContact: (_p: unknown, args: { id: string }, context: GraphQLContext) =>
      issueService.revealContact(actor(context), args.id, meta(context)),
  },
};
