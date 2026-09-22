import {
  highestRank,
  isRoleKey,
  ROLE_RANK,
  type AuthContext,
  type RoleKey,
  type UserStatus,
} from '@rk/types';
import { prisma } from '../../database/prisma';
import { getEnv } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { getLogger } from '../../logging/logger';
import { auditService } from '../audit/audit.service';
import { authorizationService } from '../auth/authorization.service';
import { normalizeEmail, type RequestMetadata } from '../auth/auth.service';
import { tokenService } from '../auth/token.service';
import { SESSION_REVOCATION_REASONS, sessionService } from '../auth/session.service';
import { userRepository, type UserRecord, type UserPageArgs } from './user.repository';

/**
 * User and membership administration.
 *
 * Two invariants hold across every method:
 *
 *  - the actor's permission is checked, AND
 *  - the target is re-loaded through a tenant-scoped query.
 *
 * Both are needed. Permission alone would let a CAMPAIGN_ADMIN with USER_UPDATE
 * pass any user id from any tenant; the scoped lookup is what turns that into
 * "not found". Platform admins are the deliberate exception and take an
 * explicit unscoped path.
 */

export interface CreateUserInput {
  readonly email: string;
  readonly fullName: string;
  readonly roleKey: string;
}

export interface UpdateUserInput {
  readonly userId: string;
  readonly fullName?: string | null;
}

export const userService = {
  async listUsers(auth: AuthContext, args: UserPageArgs) {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'USER_READ'),
    );
    return userRepository.listForOrganization(organizationId, args);
  },

  /**
   * Loads one user within the active tenant.
   *
   * A platform admin may read any user; everyone else is confined to their
   * organisation, and a cross-tenant id yields NOT_FOUND rather than FORBIDDEN
   * so the response cannot confirm that the id exists elsewhere.
   */
  async getUser(auth: AuthContext, userId: string): Promise<UserRecord> {
    authorizationService.requirePermission(auth, 'USER_READ');

    const user = auth.isPlatformAdmin
      ? await userRepository.findByIdUnscoped(userId)
      : await userRepository.findInOrganization(
          userId,
          authorizationService.requireOrganization(auth).organizationId,
        );

    if (!user) throw AppError.notFound('User not found.');
    return user;
  },

  /**
   * Invites a user into the active organisation.
   *
   * The account is created in INVITED status with no password: a password is
   * only ever set by the invitee through the reset/acceptance flow, so an
   * administrator never knows another user's credentials.
   *
   * An existing user is added to the organisation rather than rejected - the
   * same person legitimately works for several campaigns.
   */
  async createUser(
    auth: AuthContext,
    input: CreateUserInput,
    meta: RequestMetadata,
  ): Promise<{ user: UserRecord; invitationToken: string }> {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'USER_CREATE'),
    );

    if (!isRoleKey(input.roleKey)) {
      throw AppError.validation('Unknown role.', { details: { field: 'roleKey' } });
    }

    const roleKey: RoleKey = input.roleKey;
    // Bounds escalation: an admin cannot invite someone at or above their rank.
    authorizationService.assertCanGrantRole(auth, roleKey);

    if (roleKey === 'SUPER_ADMIN') {
      // SUPER_ADMIN is platform-scoped and is never granted via a membership.
      throw AppError.forbidden();
    }

    const email = normalizeEmail(input.email);
    const role = await requireRoleByKey(roleKey);

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

    const existingMembership = existing
      ? await prisma.organizationMembership.findUnique({
          where: { organizationId_userId: { organizationId, userId: existing.id } },
          select: { id: true },
        })
      : null;

    if (existingMembership) {
      throw AppError.conflict('That person is already a member of this organisation.');
    }

    const invitationToken = tokenService.generateOpaqueToken();

    const user = await prisma.$transaction(async (tx) => {
      const record = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {},
            select: {
              id: true,
              email: true,
              fullName: true,
              status: true,
              lastLoginAt: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : await tx.user.create({
            data: {
              email,
              fullName: input.fullName.trim(),
              status: 'INVITED',
              passwordHash: null,
            },
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

      await tx.organizationMembership.create({
        data: { organizationId, userId: record.id, roleId: role.id },
      });

      await tx.invitation.create({
        data: {
          organizationId,
          email,
          roleId: role.id,
          tokenHash: tokenService.hashOpaqueToken(invitationToken),
          expiresAt: new Date(Date.now() + getEnv().INVITATION_TTL_SECONDS * 1000),
          createdByUserId: auth.userId,
        },
      });

      return record;
    });

    await auditService.record({
      action: existing ? 'USER_INVITED' : 'USER_CREATED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'User',
      entityId: user.id,
      metadata: { email, role: roleKey },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    deliverInvitation(email, invitationToken);
    return { user, invitationToken };
  },

  /** Updates mutable profile fields. Email is immutable in Phase 2. */
  async updateUser(
    auth: AuthContext,
    input: UpdateUserInput,
    meta: RequestMetadata,
  ): Promise<UserRecord> {
    authorizationService.requirePermission(auth, 'USER_UPDATE');
    const target = await userService.getUser(auth, input.userId);

    // Editing one's own profile is always allowed; editing somebody else's is
    // administration and obeys the same rank rule as status and role changes,
    // so an admin cannot edit a peer's or a superior's record.
    if (target.id !== auth.userId) {
      await assertCanAdministerTarget(auth, target.id);
    }

    const fullName = input.fullName?.trim();
    if (fullName !== undefined && fullName.length === 0) {
      throw AppError.validation('Name must not be blank.', { details: { field: 'fullName' } });
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { ...(fullName ? { fullName } : {}) },
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

    await auditService.record({
      action: 'USER_UPDATED',
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      entityType: 'User',
      entityId: target.id,
      metadata: { fields: Object.keys(input).filter((key) => key !== 'userId') },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return updated;
  },

  /**
   * Moves an account between lifecycle states.
   *
   * Losing access takes effect immediately: SUSPENDED and DISABLED revoke every
   * live session, so an attacker holding a valid refresh token is cut off at
   * the moment of suspension rather than when the token happens to expire.
   */
  async setUserStatus(
    auth: AuthContext,
    userId: string,
    status: UserStatus,
    meta: RequestMetadata,
  ): Promise<UserRecord> {
    authorizationService.requirePermission(auth, 'USER_UPDATE');
    // An admin must not be able to lock themselves out, or un-suspend
    // themselves after another admin acted.
    authorizationService.assertNotSelfTargeted(auth, userId);

    const target = await userService.getUser(auth, userId);
    await assertCanAdministerTarget(auth, target.id);

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        status,
        // Re-issuing authority: tokens minted before now stop being accepted.
        ...(status === 'SUSPENDED' || status === 'DISABLED' ? { tokenValidFrom: new Date() } : {}),
      },
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

    if (status === 'SUSPENDED' || status === 'DISABLED') {
      await sessionService.revokeAllForUser(target.id, SESSION_REVOCATION_REASONS.statusChange);
    }

    const action =
      status === 'ACTIVE'
        ? 'USER_ACTIVATED'
        : status === 'SUSPENDED'
          ? 'USER_SUSPENDED'
          : 'USER_DISABLED';

    await auditService.record({
      action,
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      entityType: 'User',
      entityId: target.id,
      metadata: { status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return updated;
  },

  /**
   * Changes a user's role within the active organisation.
   *
   * Three guards, all required: the actor holds ROLE_ASSIGN; the actor outranks
   * the role being granted; and the actor outranks the role the target already
   * holds. The third stops a CAMPAIGN_ADMIN from demoting a peer or an owner.
   */
  async assignRole(
    auth: AuthContext,
    userId: string,
    roleKey: string,
    meta: RequestMetadata,
  ): Promise<UserRecord> {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'ROLE_ASSIGN'),
    );
    authorizationService.assertNotSelfTargeted(auth, userId);

    if (!isRoleKey(roleKey)) {
      throw AppError.validation('Unknown role.', { details: { field: 'roleKey' } });
    }
    if (roleKey === 'SUPER_ADMIN') {
      // Platform scope: not grantable through a tenant membership at all.
      throw AppError.forbidden();
    }

    authorizationService.assertCanGrantRole(auth, roleKey);

    const target = await userRepository.findInOrganization(userId, organizationId);
    if (!target) throw AppError.notFound('User not found.');

    await assertCanAdministerTarget(auth, target.id);

    const role = await requireRoleByKey(roleKey);

    await prisma.organizationMembership.update({
      where: { organizationId_userId: { organizationId, userId: target.id } },
      data: { roleId: role.id },
    });

    await auditService.record({
      action: 'ROLE_ASSIGNED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'User',
      entityId: target.id,
      metadata: { role: roleKey },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return target;
  },

  /**
   * Removes a user from the active organisation.
   *
   * The membership is deleted, not the user: the account may belong to other
   * organisations, and audit history must keep referencing a real actor.
   */
  async revokeRole(auth: AuthContext, userId: string, meta: RequestMetadata): Promise<UserRecord> {
    const { organizationId } = authorizationService.requireOrganization(
      authorizationService.requirePermission(auth, 'ROLE_REVOKE'),
    );
    authorizationService.assertNotSelfTargeted(auth, userId);

    const target = await userRepository.findInOrganization(userId, organizationId);
    if (!target) throw AppError.notFound('User not found.');

    await assertCanAdministerTarget(auth, target.id);

    await prisma.organizationMembership.delete({
      where: { organizationId_userId: { organizationId, userId: target.id } },
    });

    // Their authority in this tenant is gone; end their sessions so a live
    // token cannot keep acting under the membership that just disappeared.
    await sessionService.revokeAllForUser(target.id, SESSION_REVOCATION_REASONS.adminRevoked);

    await auditService.record({
      action: 'ROLE_REVOKED',
      organizationId,
      actorUserId: auth.userId,
      entityType: 'User',
      entityId: target.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return target;
  },

  /** Memberships of the signed-in user. Self-service, so no extra permission. */
  async listMyMemberships(auth: AuthContext) {
    return userRepository.listMembershipsForUser(auth.userId);
  },
};

/**
 * Refuses action against a target who outranks, or matches, the actor.
 *
 * Without this, USER_UPDATE alone would let one CAMPAIGN_ADMIN suspend another,
 * or a tenant admin suspend a platform admin who happens to hold a membership.
 */
async function assertCanAdministerTarget(auth: AuthContext, targetUserId: string): Promise<void> {
  if (auth.isPlatformAdmin) return;

  const targetIsPlatformAdmin = await prisma.platformRoleAssignment.findFirst({
    where: { userId: targetUserId, role: { key: 'SUPER_ADMIN' } },
    select: { id: true },
  });

  if (targetIsPlatformAdmin) throw AppError.forbidden();

  if (!auth.organizationId) throw AppError.forbidden();

  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: auth.organizationId, userId: targetUserId } },
    select: { role: { select: { key: true, rank: true } } },
  });

  if (!membership) return;

  const actorRank = highestRank(auth.roles);
  // Prefer the seeded rank on the row, falling back to the compiled table so a
  // role seeded with rank 0 cannot accidentally read as "outranks nobody".
  const targetRank = isRoleKey(membership.role.key)
    ? ROLE_RANK[membership.role.key]
    : membership.role.rank;

  if (targetRank >= actorRank) {
    throw AppError.forbidden();
  }
}

async function requireRoleByKey(key: RoleKey) {
  const role = await prisma.role.findUnique({ where: { key }, select: { id: true, key: true } });
  if (!role) {
    throw AppError.internal(`Role ${key} is not seeded. Run: npm run db:seed`);
  }
  return role;
}

/**
 * Development delivery for invitations.
 *
 * Same contract as password reset: the token is stored hashed and is only
 * surfaced when AUTH_DEV_EXPOSE_TOKENS is on, which production configuration
 * refuses. The message form is used because the logger redacts `token` keys.
 */
function deliverInvitation(email: string, token: string): void {
  const env = getEnv();

  if (env.isProduction || !env.AUTH_DEV_EXPOSE_TOKENS) {
    getLogger().info({ email }, 'Invitation created; delivery adapter not configured');
    return;
  }

  const url = `${env.PUBLIC_WEB_URL.replace(/\/+$/, '')}/accept-invitation?token=${token}`;
  getLogger().warn(`DEV ONLY invitation link for ${email}: ${url}`);
}
