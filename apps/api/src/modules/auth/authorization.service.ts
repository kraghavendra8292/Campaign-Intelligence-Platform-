import {
  ROLE_RANK,
  SELF_SERVICE_PERMISSIONS,
  highestRank,
  isRoleKey,
  permissionsForRoles,
  type AuthContext,
  type Permission,
  type RoleKey,
} from '@rk/types';
import { prisma } from '../../database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * The single authorization decision point.
 *
 * Every protected resolver funnels through `requireAuth` / `requirePermission`
 * / `requireOrganization` here. Nothing re-implements a permission check
 * locally, because the failure mode of scattered checks is that one of them is
 * eventually forgotten - and a forgotten check is a silent authorization bypass
 * rather than a visible error.
 */

/** Resolved authority for one user in one scope. */
export interface ResolvedAuthority {
  readonly roles: RoleKey[];
  readonly permissions: Permission[];
  readonly isPlatformAdmin: boolean;
}

/**
 * Role to permission mapping, cached in process.
 *
 * Safe to cache because it changes only through a migration or seed, never
 * through a request. Role *assignments* are never cached - they are read from
 * the database on every request, so revoking a user's role takes effect
 * immediately rather than after a TTL.
 *
 * This is the seam where a Redis cache would go for multi-instance deployments.
 */
const ROLE_PERMISSION_TTL_MS = 60_000;
let rolePermissionCache: { loadedAt: number; map: Map<string, Permission[]> } | null = null;

export function clearRolePermissionCache(): void {
  rolePermissionCache = null;
}

async function loadRolePermissions(): Promise<Map<string, Permission[]>> {
  const now = Date.now();
  if (rolePermissionCache && now - rolePermissionCache.loadedAt < ROLE_PERMISSION_TTL_MS) {
    return rolePermissionCache.map;
  }

  const roles = await prisma.role.findMany({
    select: { key: true, permissions: { select: { permission: { select: { key: true } } } } },
  });

  const map = new Map<string, Permission[]>();
  for (const role of roles) {
    map.set(role.key, role.permissions.map((rp) => rp.permission.key) as Permission[]);
  }

  rolePermissionCache = { loadedAt: now, map };
  return map;
}

export const authorizationService = {
  /**
   * Resolves what a user may do in a given organisation.
   *
   * Platform roles apply everywhere; organisation roles apply only inside the
   * organisation that granted them. Passing `organizationId: null` therefore
   * yields platform authority only, which is what an un-scoped request gets.
   */
  async resolveAuthority(
    userId: string,
    organizationId: string | null,
  ): Promise<ResolvedAuthority> {
    const [platformAssignments, membership] = await Promise.all([
      prisma.platformRoleAssignment.findMany({
        where: { userId },
        select: { role: { select: { key: true } } },
      }),
      organizationId
        ? prisma.organizationMembership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { role: { select: { key: true } } },
          })
        : Promise.resolve(null),
    ]);

    const roles: RoleKey[] = [];
    for (const assignment of platformAssignments) {
      if (isRoleKey(assignment.role.key)) roles.push(assignment.role.key);
    }
    if (membership && isRoleKey(membership.role.key)) {
      roles.push(membership.role.key);
    }

    const isPlatformAdmin = roles.includes('SUPER_ADMIN');
    const rolePermissions = await loadRolePermissions();

    // Baseline first: managing one's own account never depends on a role, and
    // a user with no membership still has an account to manage.
    const permissions = new Set<Permission>(SELF_SERVICE_PERMISSIONS);

    for (const role of roles) {
      // The database mapping is authoritative; the compiled matrix is the
      // fallback so a not-yet-seeded environment still behaves predictably.
      const granted = rolePermissions.get(role) ?? permissionsForRoles([role]);
      for (const permission of granted) permissions.add(permission);
    }

    return { roles, permissions: [...permissions], isPlatformAdmin };
  },

  /** Asserts the request is authenticated, returning the narrowed context. */
  requireAuth(auth: AuthContext | null): AuthContext {
    if (!auth) {
      throw AppError.unauthenticated('You must be signed in to perform this action.');
    }
    return auth;
  },

  /** True when the actor holds the permission in the active scope. */
  can(auth: AuthContext | null, permission: Permission): boolean {
    if (!auth) return false;
    return auth.permissions.includes(permission);
  },

  /**
   * Asserts a permission.
   *
   * Authentication and authorization are separated so a client can tell "sign
   * in again" from "you will never be allowed to do this" - and so an expired
   * session does not present as a permissions bug.
   */
  requirePermission(auth: AuthContext | null, permission: Permission): AuthContext {
    const context = authorizationService.requireAuth(auth);
    if (!context.permissions.includes(permission)) {
      throw AppError.forbidden();
    }
    return context;
  },

  /** Asserts every permission in the list. */
  requireAllPermissions(auth: AuthContext | null, permissions: readonly Permission[]): AuthContext {
    const context = authorizationService.requireAuth(auth);
    for (const permission of permissions) {
      if (!context.permissions.includes(permission)) throw AppError.forbidden();
    }
    return context;
  },

  /**
   * Asserts an active tenant, returning its id.
   *
   * A resolver that touches tenant data must call this rather than reading an
   * organisation id from its arguments: the context value has already been
   * checked against the user's memberships, an argument has not.
   */
  requireOrganization(auth: AuthContext | null): { auth: AuthContext; organizationId: string } {
    const context = authorizationService.requireAuth(auth);
    if (!context.organizationId) {
      throw AppError.badRequest(
        'No active organisation. Supply the x-organization-id header for this operation.',
      );
    }
    return { auth: context, organizationId: context.organizationId };
  },

  /** Asserts platform-level authority (SUPER_ADMIN). */
  requirePlatformAdmin(auth: AuthContext | null): AuthContext {
    const context = authorizationService.requireAuth(auth);
    if (!context.isPlatformAdmin) throw AppError.forbidden();
    return context;
  },

  /**
   * Bounds privilege escalation on role assignment.
   *
   * Rules, in order:
   *  1. SUPER_ADMIN is only ever grantable by a platform admin. Nothing a
   *     tenant admin can do reaches it.
   *  2. An actor may only grant a role ranked strictly BELOW their own highest
   *     rank. Strictly below, not at-or-below, so a CAMPAIGN_ADMIN cannot mint
   *     another CAMPAIGN_ADMIN and thereby dilute accountability, and no role
   *     can ever clone itself into a peer.
   *
   * A platform admin is exempt from (2) - being able to grant anything is what
   * the role is for.
   */
  assertCanGrantRole(auth: AuthContext, targetRole: RoleKey): void {
    if (targetRole === 'SUPER_ADMIN') {
      if (!auth.isPlatformAdmin) throw AppError.forbidden();
      return;
    }

    if (auth.isPlatformAdmin) return;

    const actorRank = highestRank(auth.roles);
    const targetRank = ROLE_RANK[targetRole];

    if (targetRank >= actorRank) {
      throw AppError.forbidden();
    }
  },

  /**
   * Guards self-mutation of one's own authority.
   *
   * Even a correctly ranked actor must not edit their own role: it is the
   * simplest escalation path (grant yourself, then use it) and there is no
   * legitimate reason to need it.
   */
  assertNotSelfTargeted(auth: AuthContext, targetUserId: string): void {
    if (auth.userId === targetUserId) {
      throw AppError.forbidden(
        'You cannot change your own roles or account status. Ask another administrator.',
      );
    }
  },
};
