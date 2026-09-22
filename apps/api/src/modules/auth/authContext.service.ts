import type { AuthContext } from '@rk/types';
import { canAuthenticate, type UserStatus } from '@rk/types';
import { prisma } from '../../database/prisma';
import { getLogger } from '../../logging/logger';
import { tokenService } from './token.service';
import { sessionService } from './session.service';
import { authorizationService } from './authorization.service';

/**
 * Builds the authenticated context for a request.
 *
 * This is where a bearer token becomes authority, and it is deliberately
 * database-backed rather than claim-backed. Five independent conditions must
 * all hold; any one of them failing yields an anonymous context rather than an
 * error, so an expired token behaves exactly like no token at all and
 * resolvers have a single "not signed in" path to handle.
 *
 *   1. the JWT verifies (signature, issuer, audience, expiry, type)
 *   2. the session exists, is unrevoked and unexpired
 *   3. the user exists and is ACTIVE
 *   4. the token was issued after the user's `tokenValidFrom` epoch
 *   5. the requested tenant is one the user actually belongs to
 *
 * (2) and (3) are what make revocation immediate: suspending an account or
 * revoking a session stops the *existing* access token, without waiting for it
 * to expire. (4) covers password change, which bumps the epoch.
 */

export interface AuthResolutionInput {
  /** Raw `Authorization` header value, if present. */
  readonly authorizationHeader?: string | undefined;
  /** Raw tenant header. Untrusted - validated against membership below. */
  readonly organizationHeader?: string | undefined;
  readonly campaignHeader?: string | undefined;
  readonly correlationId: string;
}

/** Extracts a bearer token, tolerating case and extra whitespace. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

export const authContextService = {
  /**
   * Resolves the caller, or null when the request is anonymous.
   *
   * Never throws for an invalid credential: a bad token is indistinguishable
   * from no token, which keeps token validity from becoming an oracle.
   */
  async resolve(input: AuthResolutionInput): Promise<AuthContext | null> {
    const token = extractBearerToken(input.authorizationHeader);
    if (!token) return null;

    let claims;
    try {
      claims = await tokenService.verifyAccessToken(token);
    } catch {
      return null;
    }

    const session = await sessionService.findLiveSession(claims.sid);
    if (!session || session.userId !== claims.sub) return null;

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, status: true, tokenValidFrom: true },
    });

    if (!user || !canAuthenticate(user.status as UserStatus)) return null;

    // Tokens minted before the epoch are stale: the password changed, or
    // authority was globally reset, after this token was issued.
    if (session.createdAt.getTime() < user.tokenValidFrom.getTime()) return null;

    const organizationId = await resolveOrganizationScope(
      user.id,
      input.organizationHeader,
      input.correlationId,
    );

    const campaignId = await resolveCampaignScope(input.campaignHeader, organizationId);

    const authority = await authorizationService.resolveAuthority(user.id, organizationId);

    return {
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      isPlatformAdmin: authority.isPlatformAdmin,
      organizationId,
      campaignId,
      roles: authority.roles,
      permissions: authority.permissions,
    };
  },
};

/**
 * Turns the client-supplied tenant header into a trusted scope.
 *
 * THIS IS THE TENANT BOUNDARY. The header is an untrusted request input, so it
 * is never used directly; it is only ever accepted after proving the user holds
 * a membership in that organisation. An unrecognised or unauthorised value
 * resolves to `null` (no tenant) rather than an error, so probing for valid
 * organisation ids returns the same result whether or not the id exists.
 *
 * A platform admin is the one exception: they may act in any organisation, so
 * the header is validated for existence only.
 */
async function resolveOrganizationScope(
  userId: string,
  requested: string | undefined,
  correlationId: string,
): Promise<string | null> {
  const candidate = requested?.trim();

  if (candidate && !isUuid(candidate)) {
    return null;
  }

  if (candidate) {
    const membership = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: candidate, userId } },
      select: { organizationId: true },
    });

    if (membership) return membership.organizationId;

    const platformAdmin = await prisma.platformRoleAssignment.findFirst({
      where: { userId, role: { key: 'SUPER_ADMIN' } },
      select: { id: true },
    });

    if (platformAdmin) {
      const organization = await prisma.organization.findUnique({
        where: { id: candidate },
        select: { id: true },
      });
      return organization?.id ?? null;
    }

    // Someone asked to act in a tenant they do not belong to. Worth seeing.
    getLogger().warn(
      { userId, correlationId },
      'Rejected organisation scope: caller is not a member',
    );
    return null;
  }

  // No header: fall back to the user's sole membership when unambiguous.
  // With several memberships the client must choose, rather than the server
  // guessing which tenant the user meant.
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId },
    select: { organizationId: true },
    take: 2,
  });

  return memberships.length === 1 ? (memberships[0]?.organizationId ?? null) : null;
}

/** Campaign scope is only meaningful inside an already-resolved tenant. */
async function resolveCampaignScope(
  requested: string | undefined,
  organizationId: string | null,
): Promise<string | null> {
  const candidate = requested?.trim();
  if (!candidate || !organizationId || !isUuid(candidate)) return null;

  // Filtered by organizationId, so a campaign id from another tenant cannot
  // resolve even if the id itself is valid.
  const campaign = await prisma.campaign.findFirst({
    where: { id: candidate, organizationId },
    select: { id: true },
  });

  return campaign?.id ?? null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
