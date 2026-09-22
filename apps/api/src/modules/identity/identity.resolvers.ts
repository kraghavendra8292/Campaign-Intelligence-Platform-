import type { CampaignStatus, UserStatus } from '@rk/types';
import type { GraphQLContext } from '../../graphql/context/index';
import { AppError } from '../../errors/AppError';
import { authorizationService } from '../auth/authorization.service';
import { userService } from './user.service';
import { campaignService, organizationService } from './organization.service';
import { auditQueryService } from '../audit/audit.query';

/**
 * Identity, tenancy and audit resolvers.
 *
 * Every one delegates to a service that performs the permission check AND the
 * tenant-scoped query. Resolvers never build a Prisma `where` clause, which is
 * precisely how a tenant filter gets forgotten.
 */

/** Caps page size so a client cannot ask for the whole table. */
const MAX_PAGE_SIZE = 100;

function clampPageSize(requested: number | null | undefined, fallback: number): number {
  const value = requested ?? fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw AppError.validation('`first` must be a positive integer.', {
      details: { field: 'first' },
    });
  }
  return Math.min(value, MAX_PAGE_SIZE);
}

export const identityResolvers = {
  Query: {
    users: async (
      _parent: unknown,
      args: { first?: number; after?: string; search?: string; status?: UserStatus },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);

      const result = await userService.listUsers(auth, {
        first: clampPageSize(args.first, 25),
        afterCursor: args.after ?? null,
        search: args.search ?? null,
        status: args.status ?? null,
      });

      const last = result.users.at(-1);
      return {
        nodes: result.users,
        pageInfo: {
          hasNextPage: result.hasNextPage,
          endCursor: result.hasNextPage ? (last?.id ?? null) : null,
        },
        totalCount: result.totalCount,
      };
    },

    user: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return userService.getUser(auth, args.id);
    },

    organization: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return organizationService.getActiveOrganization(auth);
    },

    organizations: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return organizationService.listVisibleOrganizations(auth);
    },

    campaigns: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return campaignService.listCampaigns(auth);
    },

    campaign: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return campaignService.getCampaign(auth, args.id);
    },

    auditLogs: async (
      _parent: unknown,
      args: { first?: number; after?: string; action?: string; actorUserId?: string },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);

      const result = await auditQueryService.list(auth, {
        first: clampPageSize(args.first, 50),
        afterCursor: args.after ?? null,
        action: args.action ?? null,
        actorUserId: args.actorUserId ?? null,
      });

      const last = result.records.at(-1);
      return {
        nodes: result.records,
        pageInfo: {
          hasNextPage: result.hasNextPage,
          endCursor: result.hasNextPage ? (last?.id ?? null) : null,
        },
        totalCount: result.totalCount,
      };
    },
  },

  Mutation: {
    createUser: async (
      _parent: unknown,
      args: { input: { email: string; fullName: string; roleKey: string } },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);
      const { user } = await userService.createUser(auth, args.input, context.requestMeta);
      // The invitation token is deliberately NOT returned: it is a bearer
      // credential, and the GraphQL response is the wrong channel for it.
      return user;
    },

    updateUser: async (
      _parent: unknown,
      args: { input: { userId: string; fullName?: string } },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);
      return userService.updateUser(auth, args.input, context.requestMeta);
    },

    activateUser: async (_parent: unknown, args: { userId: string }, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return userService.setUserStatus(auth, args.userId, 'ACTIVE', context.requestMeta);
    },

    suspendUser: async (_parent: unknown, args: { userId: string }, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return userService.setUserStatus(auth, args.userId, 'SUSPENDED', context.requestMeta);
    },

    disableUser: async (_parent: unknown, args: { userId: string }, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return userService.setUserStatus(auth, args.userId, 'DISABLED', context.requestMeta);
    },

    assignRole: async (
      _parent: unknown,
      args: { userId: string; roleKey: string },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);
      return userService.assignRole(auth, args.userId, args.roleKey, context.requestMeta);
    },

    revokeRole: async (_parent: unknown, args: { userId: string }, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return userService.revokeRole(auth, args.userId, context.requestMeta);
    },

    createOrganization: async (
      _parent: unknown,
      args: { name: string },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);
      return organizationService.createOrganization(auth, args.name, context.requestMeta);
    },

    updateOrganization: async (
      _parent: unknown,
      args: { name: string },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);
      return organizationService.updateOrganization(auth, args.name, context.requestMeta);
    },

    createCampaign: async (
      _parent: unknown,
      args: { input: { name: string } },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);
      return campaignService.createCampaign(auth, args.input.name, context.requestMeta);
    },

    updateCampaign: async (
      _parent: unknown,
      args: { input: { campaignId: string; name?: string; status?: CampaignStatus } },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);
      return campaignService.updateCampaign(
        auth,
        args.input.campaignId,
        { name: args.input.name ?? null, status: args.input.status ?? null },
        context.requestMeta,
      );
    },

    archiveCampaign: async (
      _parent: unknown,
      args: { campaignId: string },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);
      return campaignService.archiveCampaign(auth, args.campaignId, context.requestMeta);
    },
  },
};
