import { ROLE_DEFINITIONS, ROLE_KEYS, type AuthContext, type TokenDeliveryMode } from '@rk/types';
import type { GraphQLContext } from '../../graphql/context/index';
import { AppError } from '../../errors/AppError';
import { authService, type AuthResult } from './auth.service';
import { authorizationService } from './authorization.service';
import { sessionService, SESSION_REVOCATION_REASONS } from './session.service';
import {
  clearRefreshCookie,
  isAllowedOrigin,
  readRefreshCookie,
  setRefreshCookie,
} from './cookies';
import { userService } from '../identity/user.service';
import { organizationService } from '../identity/organization.service';
import { prisma } from '../../database/prisma';
import { auditService } from '../audit/audit.service';

/**
 * Authentication resolvers.
 *
 * Thin by design: each one validates shape, delegates to a service, and maps
 * the result onto the GraphQL type. No authorization logic lives here - it is
 * all in `authorizationService`, so there is exactly one place to audit.
 */

export interface LoginArgs {
  input: { email: string; password: string; tokenDelivery?: TokenDeliveryMode | null };
}

/** Applies the chosen delivery mode to an auth result. */
function deliverCredentials(
  context: GraphQLContext,
  result: AuthResult,
  mode: TokenDeliveryMode,
): { accessToken: string; expiresIn: number; refreshToken: string | null } {
  if (mode === 'COOKIE') {
    setRefreshCookie(context.res, result.session.refreshToken, result.session.expiresAt);
    // Never both: returning it in the body too would undo the point of HttpOnly.
    return {
      accessToken: result.accessToken,
      expiresIn: result.accessTokenExpiresInSeconds,
      refreshToken: null,
    };
  }

  return {
    accessToken: result.accessToken,
    expiresIn: result.accessTokenExpiresInSeconds,
    refreshToken: result.session.refreshToken,
  };
}

/**
 * Builds the viewer payload after authentication.
 *
 * Authority is re-resolved from the database rather than assumed, so the
 * permissions the client receives are the same ones the API will enforce.
 */
async function buildViewer(userId: string, sessionId: string): Promise<unknown> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const memberships = await prisma.organizationMembership.findMany({
    where: { userId },
    select: {
      id: true,
      createdAt: true,
      organization: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      role: {
        select: { id: true, key: true, name: true, description: true, scope: true, rank: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const organizationId = memberships.length === 1 ? memberships[0]?.organization.id : null;
  const authority = await authorizationService.resolveAuthority(userId, organizationId ?? null);

  return {
    user,
    organization: memberships.length === 1 ? memberships[0]?.organization : null,
    campaignId: null,
    roles: authority.roles,
    permissions: authority.permissions,
    isPlatformAdmin: authority.isPlatformAdmin,
    memberships,
    __sessionId: sessionId,
  };
}

/** Rejects a credentialed mutation arriving from a non-allow-listed origin. */
function assertSafeOrigin(context: GraphQLContext): void {
  const origin = context.req.headers.origin;
  if (!isAllowedOrigin(typeof origin === 'string' ? origin : undefined)) {
    throw AppError.forbidden('Request origin is not permitted.');
  }
}

export const authResolvers = {
  Query: {
    /** Null rather than an error when signed out: "who am I" has an answer. */
    me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.auth) return null;
      return buildViewerFromContext(context.auth);
    },

    mySessions: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const auth = authorizationService.requirePermission(context.auth, 'SESSION_READ_OWN');
      const sessions = await sessionService.listActiveSessions(auth.userId);

      return sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        current: session.id === auth.sessionId,
      }));
    },

    myMemberships: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      return userService.listMyMemberships(auth);
    },

    /**
     * Roles the caller may actually grant.
     *
     * Filtered by the same rule the mutation enforces, so the UI cannot offer
     * an option that the server will then refuse.
     */
    assignableRoles: (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const auth = authorizationService.requirePermission(context.auth, 'ROLE_READ');

      return ROLE_KEYS.filter((key) => {
        try {
          authorizationService.assertCanGrantRole(auth, key);
          return key !== 'SUPER_ADMIN' || auth.isPlatformAdmin;
        } catch {
          return false;
        }
      }).map((key) => ({ id: key, ...ROLE_DEFINITIONS[key] }));
    },
  },

  Mutation: {
    login: async (_parent: unknown, args: LoginArgs, context: GraphQLContext) => {
      assertSafeOrigin(context);

      const mode: TokenDeliveryMode = args.input.tokenDelivery ?? 'COOKIE';
      const result = await authService.login(
        { email: args.input.email, password: args.input.password },
        context.requestMeta,
      );

      const credentials = deliverCredentials(context, result, mode);
      return { ...credentials, viewer: await buildViewer(result.userId, result.session.sessionId) };
    },

    logout: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const auth = authorizationService.requireAuth(context.auth);
      await authService.logout(auth.sessionId, auth.userId, context.requestMeta);
      clearRefreshCookie(context.res);
      return { success: true };
    },

    /**
     * Rotates the refresh credential.
     *
     * Runs unauthenticated on purpose: the access token has usually expired by
     * the time a client refreshes, so the refresh token is the only credential
     * presented.
     */
    refreshToken: async (
      _parent: unknown,
      args: { input?: { refreshToken?: string | null; tokenDelivery?: TokenDeliveryMode | null } },
      context: GraphQLContext,
    ) => {
      assertSafeOrigin(context);

      const mode: TokenDeliveryMode = args.input?.tokenDelivery ?? 'COOKIE';
      const presented =
        mode === 'COOKIE' ? readRefreshCookie(context.req) : (args.input?.refreshToken ?? null);

      if (!presented) {
        throw AppError.unauthenticated('Your session has expired. Please sign in again.');
      }

      try {
        const result = await authService.refresh(presented, context.requestMeta);
        const credentials = deliverCredentials(context, result, mode);
        return {
          ...credentials,
          viewer: await buildViewer(result.userId, result.session.sessionId),
        };
      } catch (error) {
        // The cookie is now useless; clearing it stops the client retrying in a
        // loop with a credential that can never succeed.
        if (mode === 'COOKIE') clearRefreshCookie(context.res);
        throw error;
      }
    },

    requestPasswordReset: async (
      _parent: unknown,
      args: { email: string },
      context: GraphQLContext,
    ) => {
      await authService.requestPasswordReset(args.email, context.requestMeta);
      // Always the same answer, whether or not the address is registered.
      return { success: true };
    },

    confirmPasswordReset: async (
      _parent: unknown,
      args: { input: { token: string; newPassword: string; confirmPassword: string } },
      context: GraphQLContext,
    ) => {
      if (args.input.newPassword !== args.input.confirmPassword) {
        throw AppError.validation('The passwords do not match.', {
          details: { field: 'confirmPassword' },
        });
      }

      await authService.confirmPasswordReset(
        args.input.token,
        args.input.newPassword,
        context.requestMeta,
      );
      clearRefreshCookie(context.res);
      return { success: true };
    },

    changePassword: async (
      _parent: unknown,
      args: { input: { currentPassword: string; newPassword: string; confirmPassword: string } },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);

      if (args.input.newPassword !== args.input.confirmPassword) {
        throw AppError.validation('The passwords do not match.', {
          details: { field: 'confirmPassword' },
        });
      }

      await authService.changePassword(
        auth.userId,
        auth.sessionId,
        args.input.currentPassword,
        args.input.newPassword,
        context.requestMeta,
      );

      return { success: true };
    },

    /**
     * Revokes a session.
     *
     * Own sessions need only SESSION_REVOKE_OWN; another user's needs
     * SESSION_REVOKE_ANY *and* that the target is in the caller's tenant.
     */
    revokeSession: async (
      _parent: unknown,
      args: { sessionId: string },
      context: GraphQLContext,
    ) => {
      const auth = authorizationService.requireAuth(context.auth);

      const session = await prisma.session.findUnique({
        where: { id: args.sessionId },
        select: { id: true, userId: true },
      });

      // Unknown and not-yours are the same answer, so this cannot be used to
      // probe for valid session ids.
      if (!session) throw AppError.notFound('Session not found.');

      if (session.userId !== auth.userId) {
        authorizationService.requirePermission(auth, 'SESSION_REVOKE_ANY');
        await assertTargetInTenant(auth, session.userId);
      }

      await sessionService.revokeSession(
        session.id,
        session.userId === auth.userId
          ? SESSION_REVOCATION_REASONS.logout
          : SESSION_REVOCATION_REASONS.adminRevoked,
      );

      await auditService.record({
        action: 'SESSION_REVOKED',
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        entityType: 'Session',
        entityId: session.id,
        ipAddress: context.requestMeta.ipAddress,
        userAgent: context.requestMeta.userAgent,
        correlationId: context.correlationId,
      });

      if (session.userId === auth.userId && session.id === auth.sessionId) {
        clearRefreshCookie(context.res);
      }

      return { success: true };
    },
  },
};

/** Viewer payload for an already-resolved context. */
async function buildViewerFromContext(auth: AuthContext) {
  const [user, memberships] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.organizationMembership.findMany({
      where: { userId: auth.userId },
      select: {
        id: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        role: {
          select: { id: true, key: true, name: true, description: true, scope: true, rank: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const organization = auth.organizationId
    ? await organizationService
        .getActiveOrganization(auth)
        .catch(
          () =>
            memberships.find((m) => m.organization.id === auth.organizationId)?.organization ??
            null,
        )
    : null;

  return {
    user,
    organization,
    campaignId: auth.campaignId,
    roles: auth.roles,
    permissions: auth.permissions,
    isPlatformAdmin: auth.isPlatformAdmin,
    memberships,
  };
}

/** Confirms a target user shares the caller's tenant. */
async function assertTargetInTenant(auth: AuthContext, targetUserId: string): Promise<void> {
  if (auth.isPlatformAdmin) return;

  const { organizationId } = authorizationService.requireOrganization(auth);
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
    select: { id: true },
  });

  if (!membership) throw AppError.notFound('Session not found.');
}
