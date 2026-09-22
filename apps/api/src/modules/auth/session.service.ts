import { randomUUID } from 'node:crypto';
import type { Session } from '../../generated/prisma/client';
import { prisma } from '../../database/prisma';
import { getEnv } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { tokenService } from './token.service';

/**
 * Refresh-token sessions.
 *
 * Each login opens a session *family* identified by `familyId`. Refreshing
 * rotates the token: the presented session is marked `rotatedAt` and a new row
 * is linked through `replacedById`, so the family is a chain of single-use
 * credentials.
 *
 * That chain is what makes replay detectable. A refresh token is meant to be
 * used exactly once; if an already-rotated token is presented again, either it
 * was stolen or the legitimate client is replaying. Both cases are handled the
 * same way - revoke the ENTIRE family - because the safe assumption is that an
 * attacker holds a copy. The real user simply signs in again.
 */

export const SESSION_REVOCATION_REASONS = {
  logout: 'LOGOUT',
  rotated: 'ROTATED',
  replay: 'REPLAY_DETECTED',
  passwordChange: 'PASSWORD_CHANGE',
  adminRevoked: 'ADMIN_REVOKED',
  statusChange: 'ACCOUNT_STATUS_CHANGE',
} as const;

export type SessionRevocationReason =
  (typeof SESSION_REVOCATION_REASONS)[keyof typeof SESSION_REVOCATION_REASONS];

export interface IssuedSession {
  readonly sessionId: string;
  /** The plaintext refresh token. Returned to the caller exactly once. */
  readonly refreshToken: string;
  readonly expiresAt: Date;
}

export interface SessionClientInfo {
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

export interface RefreshOutcome {
  readonly session: IssuedSession;
  readonly userId: string;
}

function refreshExpiry(): Date {
  return new Date(Date.now() + getEnv().REFRESH_TOKEN_TTL_SECONDS * 1000);
}

export const sessionService = {
  /** Opens a new session family. Called on successful login only. */
  async createSession(userId: string, client: SessionClientInfo): Promise<IssuedSession> {
    const refreshToken = tokenService.generateOpaqueToken();
    const expiresAt = refreshExpiry();

    const session = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash: tokenService.hashOpaqueToken(refreshToken),
        familyId: randomUUID(),
        expiresAt,
        ipAddress: client.ipAddress ?? null,
        userAgent: client.userAgent?.slice(0, 500) ?? null,
      },
    });

    return { sessionId: session.id, refreshToken, expiresAt };
  },

  /**
   * Rotates a refresh token.
   *
   * The lookup is by digest, so the plaintext never reaches the database. The
   * ordering of checks matters: replay is detected before expiry, because a
   * reused-but-expired token is still evidence of compromise.
   */
  async rotate(
    presentedToken: string,
    client: SessionClientInfo,
  ): Promise<{ outcome: RefreshOutcome } | { replayOf: Session }> {
    const digest = tokenService.hashOpaqueToken(presentedToken);
    const existing = await prisma.session.findUnique({ where: { refreshTokenHash: digest } });

    if (!existing) {
      throw AppError.unauthenticated('Your session has expired. Please sign in again.');
    }

    // Already rotated or explicitly revoked: treat as compromise, not as a
    // simple failure. The caller revokes the family and audits it.
    if (existing.rotatedAt !== null || existing.revokedAt !== null) {
      return { replayOf: existing };
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw AppError.unauthenticated('Your session has expired. Please sign in again.');
    }

    const refreshToken = tokenService.generateOpaqueToken();
    const expiresAt = refreshExpiry();

    // One transaction so a crash cannot leave two live tokens in a family.
    const created = await prisma.$transaction(async (tx) => {
      const next = await tx.session.create({
        data: {
          userId: existing.userId,
          refreshTokenHash: tokenService.hashOpaqueToken(refreshToken),
          familyId: existing.familyId,
          expiresAt,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent?.slice(0, 500) ?? null,
        },
      });

      await tx.session.update({
        where: { id: existing.id },
        data: {
          rotatedAt: new Date(),
          revokedAt: new Date(),
          revokedReason: SESSION_REVOCATION_REASONS.rotated,
          replacedById: next.id,
          lastUsedAt: new Date(),
        },
      });

      return next;
    });

    return {
      outcome: {
        userId: existing.userId,
        session: { sessionId: created.id, refreshToken, expiresAt },
      },
    };
  },

  /**
   * Loads a session for access-token validation.
   * Returns null when the session is unusable for any reason.
   */
  async findLiveSession(sessionId: string): Promise<Session | null> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    return session;
  },

  /** Revokes a single session. Idempotent. */
  async revokeSession(sessionId: string, reason: SessionRevocationReason): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  },

  /** Revokes every session in a family. Used on replay detection. */
  async revokeFamily(familyId: string, reason: SessionRevocationReason): Promise<number> {
    const result = await prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  },

  /**
   * Revokes every session a user holds.
   *
   * `exceptSessionId` lets a password change keep the session that performed
   * it, so the user is not logged out of the tab they are working in while
   * every other device is signed out.
   */
  async revokeAllForUser(
    userId: string,
    reason: SessionRevocationReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const result = await prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  },

  /** Live sessions for the account-security screen. */
  async listActiveSessions(userId: string): Promise<Session[]> {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      take: 100,
    });
  },

  /** Records use of a session without blocking the request on the write. */
  async touch(sessionId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });
  },
};
