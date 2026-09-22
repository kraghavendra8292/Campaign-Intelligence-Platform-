import { canAuthenticate, type UserStatus } from '@rk/types';
import { prisma } from '../../database/prisma';
import { getEnv } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { getLogger } from '../../logging/logger';
import { auditService } from '../audit/audit.service';
import { passwordService } from './password.service';
import { tokenService } from './token.service';
import {
  SESSION_REVOCATION_REASONS,
  sessionService,
  type IssuedSession,
  type SessionClientInfo,
} from './session.service';
import { attemptKeys, getAttemptLimiter } from './rateLimiter';

/**
 * Authentication flows.
 *
 * A single principle runs through this module: **an unauthenticated caller
 * learns nothing about which accounts exist.** Login, password reset and
 * invitation all return the same shape and take roughly the same time whether
 * or not the email is registered. Enumeration is not a theoretical concern for
 * a political campaign platform - knowing who works on a campaign is itself
 * sensitive.
 */

/** The one message every credential failure returns. */
const GENERIC_LOGIN_FAILURE = 'Invalid email or password.';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface RequestMetadata extends SessionClientInfo {
  readonly correlationId: string;
}

export interface AuthResult {
  readonly userId: string;
  readonly accessToken: string;
  readonly accessTokenExpiresInSeconds: number;
  readonly session: IssuedSession;
}

/** Canonical email form. Applied on every read and write path. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function issueTokens(userId: string, session: IssuedSession): Promise<AuthResult> {
  const accessToken = await tokenService.issueAccessToken(userId, session.sessionId);
  return {
    userId,
    accessToken,
    accessTokenExpiresInSeconds: getEnv().ACCESS_TOKEN_TTL_SECONDS,
    session,
  };
}

export const authService = {
  /**
   * Authenticates a user and opens a session.
   *
   * Order matters: the attempt budget is consumed before any hashing, so a
   * flood of guesses is shed before it can consume CPU. Every failure path
   * below returns the identical error.
   */
  async login(input: LoginInput, meta: RequestMetadata): Promise<AuthResult> {
    const env = getEnv();
    const email = normalizeEmail(input.email);
    const ip = meta.ipAddress ?? 'unknown';

    const budget = await getAttemptLimiter().consume(
      attemptKeys.login(email, ip),
      env.AUTH_LOGIN_MAX_ATTEMPTS,
      env.AUTH_RATE_LIMIT_WINDOW_MS,
    );

    if (!budget.allowed) {
      await auditService.record({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        metadata: { reason: 'RATE_LIMITED' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      throw AppError.rateLimited(
        `Too many sign-in attempts. Try again in ${budget.retryAfterSeconds} seconds.`,
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true, passwordHash: true },
    });

    // No account, or an invited account that has not set a password yet.
    // Burn comparable time so the timing does not distinguish the cases.
    if (!user || !user.passwordHash) {
      await passwordService.simulateVerification(input.password);
      await recordFailedLogin(null, email, 'UNKNOWN_ACCOUNT', meta);
      throw AppError.unauthenticated(GENERIC_LOGIN_FAILURE);
    }

    const passwordMatches = await passwordService.verifyPassword(user.passwordHash, input.password);

    if (!passwordMatches) {
      await recordFailedLogin(user.id, email, 'BAD_PASSWORD', meta);
      throw AppError.unauthenticated(GENERIC_LOGIN_FAILURE);
    }

    // Status is checked only AFTER the password verifies. Checking it earlier
    // would let anyone discover which accounts are suspended.
    if (!canAuthenticate(user.status as UserStatus)) {
      await recordFailedLogin(user.id, email, `STATUS_${user.status}`, meta);
      throw AppError.unauthenticated(GENERIC_LOGIN_FAILURE);
    }

    await getAttemptLimiter().reset(attemptKeys.login(email, ip));

    const session = await sessionService.createSession(user.id, meta);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await auditService.record({
      action: 'AUTH_LOGIN_SUCCEEDED',
      organizationId: await resolveAuditOrganization(user.id),
      actorUserId: user.id,
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return issueTokens(user.id, session);
  },

  /** Ends one session. Idempotent, so a double logout is not an error. */
  async logout(sessionId: string, userId: string, meta: RequestMetadata): Promise<void> {
    await sessionService.revokeSession(sessionId, SESSION_REVOCATION_REASONS.logout);

    await auditService.record({
      action: 'AUTH_LOGOUT',
      organizationId: await resolveAuditOrganization(userId),
      actorUserId: userId,
      entityType: 'Session',
      entityId: sessionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
  },

  /**
   * Rotates a refresh token and mints a fresh access token.
   *
   * On replay the entire session family is revoked and the event is audited:
   * a refresh token is single-use, so a second presentation means a copy
   * exists. Revoking the family logs out the attacker and the legitimate user
   * together, which is the safe outcome.
   */
  async refresh(presentedToken: string, meta: RequestMetadata): Promise<AuthResult> {
    const env = getEnv();

    const budget = await getAttemptLimiter().consume(
      attemptKeys.refresh(meta.ipAddress ?? 'unknown'),
      env.AUTH_REFRESH_MAX_ATTEMPTS,
      env.AUTH_RATE_LIMIT_WINDOW_MS,
    );

    if (!budget.allowed) {
      throw AppError.rateLimited('Too many refresh attempts. Please retry shortly.');
    }

    const result = await sessionService.rotate(presentedToken, meta);

    if ('replayOf' in result) {
      const revokedCount = await sessionService.revokeFamily(
        result.replayOf.familyId,
        SESSION_REVOCATION_REASONS.replay,
      );

      getLogger().warn(
        { userId: result.replayOf.userId, correlationId: meta.correlationId, revokedCount },
        'Refresh token replay detected; session family revoked',
      );

      await auditService.record({
        action: 'AUTH_REFRESH_REPLAY_DETECTED',
        actorUserId: result.replayOf.userId,
        entityType: 'Session',
        entityId: result.replayOf.id,
        metadata: { revokedSessions: revokedCount },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });

      throw AppError.unauthenticated('Your session has expired. Please sign in again.');
    }

    // Re-check the account: a session opened while ACTIVE must stop working
    // the moment the account is suspended, not when the token expires.
    const user = await prisma.user.findUnique({
      where: { id: result.outcome.userId },
      select: { id: true, status: true },
    });

    if (!user || !canAuthenticate(user.status as UserStatus)) {
      await sessionService.revokeSession(
        result.outcome.session.sessionId,
        SESSION_REVOCATION_REASONS.statusChange,
      );
      throw AppError.unauthenticated('Your session has expired. Please sign in again.');
    }

    await auditService.record({
      action: 'AUTH_TOKEN_REFRESHED',
      actorUserId: user.id,
      entityType: 'Session',
      entityId: result.outcome.session.sessionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return issueTokens(user.id, result.outcome.session);
  },

  /**
   * Changes a password for the signed-in user.
   *
   * Requires the current password even though the caller is already
   * authenticated: it re-proves possession, so an unattended session cannot be
   * used to take over the account permanently.
   */
  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMetadata,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      throw AppError.unauthenticated('Your session is no longer valid. Please sign in again.');
    }

    const matches = await passwordService.verifyPassword(user.passwordHash, currentPassword);
    if (!matches) {
      throw AppError.validation('Your current password is incorrect.', {
        details: { field: 'currentPassword' },
      });
    }

    passwordService.assertPolicy(newPassword);

    if (await passwordService.verifyPassword(user.passwordHash, newPassword)) {
      throw AppError.validation('Your new password must differ from the current one.', {
        details: { field: 'newPassword' },
      });
    }

    const passwordHash = await passwordService.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      // `tokenValidFrom` is deliberately NOT bumped here. It is a blunt "every
      // token issued before now is void" epoch, and it would also void the
      // session performing the change - the one session we intend to keep.
      // Revoking the other sessions below is sufficient and precise: every
      // request re-reads its session row, so a revoked session's access token
      // stops working on its very next call.
      data: { passwordHash },
    });

    // Every other session is ended; the current one survives so the user is
    // not signed out of the tab they just used.
    await sessionService.revokeAllForUser(
      userId,
      SESSION_REVOCATION_REASONS.passwordChange,
      currentSessionId,
    );

    await auditService.record({
      action: 'AUTH_PASSWORD_CHANGED',
      organizationId: await resolveAuditOrganization(userId),
      actorUserId: userId,
      entityType: 'User',
      entityId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
  },

  /**
   * Starts a password reset.
   *
   * Always resolves successfully, whatever the email. The caller receives the
   * same response for a registered and an unregistered address, so this
   * endpoint cannot be used to test whether an account exists.
   */
  async requestPasswordReset(rawEmail: string, meta: RequestMetadata): Promise<void> {
    const env = getEnv();
    const email = normalizeEmail(rawEmail);

    const budget = await getAttemptLimiter().consume(
      attemptKeys.passwordReset(email, meta.ipAddress ?? 'unknown'),
      env.AUTH_PASSWORD_RESET_MAX_ATTEMPTS,
      env.AUTH_RATE_LIMIT_WINDOW_MS,
    );

    // Even exhausting the budget returns success, for the same reason.
    if (!budget.allowed) return;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });

    if (!user || user.status === 'DISABLED') return;

    const token = tokenService.generateOpaqueToken();

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenService.hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_SECONDS * 1000),
        requestedIp: meta.ipAddress ?? null,
      },
    });

    await auditService.record({
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      actorUserId: user.id,
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    deliverResetToken(email, token);
  },

  /**
   * Completes a password reset.
   *
   * The token is single-use and is consumed inside a transaction with a
   * guarded update, so two concurrent requests cannot both redeem it.
   */
  async confirmPasswordReset(
    rawToken: string,
    newPassword: string,
    meta: RequestMetadata,
  ): Promise<void> {
    passwordService.assertPolicy(newPassword);

    const tokenHash = tokenService.hashOpaqueToken(rawToken);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    const invalid = AppError.validation('This reset link is invalid or has expired.');

    if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
      throw invalid;
    }

    const passwordHash = await passwordService.hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      // `usedAt: null` in the filter makes redemption atomic: the second of two
      // concurrent requests matches zero rows and is rejected.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (claimed.count === 0) throw invalid;

      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          tokenValidFrom: new Date(),
          // A reset is also the invitation-acceptance path for a user who was
          // invited and never signed in.
          status: 'ACTIVE',
        },
      });

      // Unlike a password change, a reset revokes EVERY session: the user may
      // be resetting precisely because an attacker holds one.
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: SESSION_REVOCATION_REASONS.passwordChange },
      });

      // Any other outstanding reset links become useless too.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });

    await auditService.record({
      action: 'AUTH_PASSWORD_RESET_COMPLETED',
      organizationId: await resolveAuditOrganization(record.userId),
      actorUserId: record.userId,
      entityType: 'User',
      entityId: record.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });
  },
};

/**
 * Best-effort tenant attribution for authentication events.
 *
 * Login happens before any tenant is resolved - the credential identifies a
 * person, not an organisation - so these records would otherwise all be
 * platform-scoped and invisible to the tenant administrators who most need to
 * see them ("who signed in, and when?").
 *
 * When the user belongs to exactly one organisation the event is attributed to
 * it. With several memberships it stays platform-scoped rather than being
 * attributed to an arbitrary one, which would be misleading and would leak one
 * tenant's sign-in activity into another tenant's audit view.
 */
async function resolveAuditOrganization(userId: string): Promise<string | null> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId },
    select: { organizationId: true },
    take: 2,
  });

  return memberships.length === 1 ? (memberships[0]?.organizationId ?? null) : null;
}

async function recordFailedLogin(
  userId: string | null,
  email: string,
  reason: string,
  meta: RequestMetadata,
): Promise<void> {
  await auditService.record({
    action: 'AUTH_LOGIN_FAILED',
    organizationId: userId ? await resolveAuditOrganization(userId) : null,
    actorUserId: userId,
    entityType: 'User',
    entityId: userId,
    // The email is recorded so repeated attempts against one account are
    // visible. The submitted password never is, in any form.
    metadata: { reason, email },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    correlationId: meta.correlationId,
  });
}

/**
 * Development delivery for reset links.
 *
 * Email infrastructure is out of Phase 2 scope, so the token is surfaced
 * through the log ONLY when explicitly enabled, and that flag is refused in
 * production by the configuration check in `config/env.ts`. Without the flag
 * the token is generated, stored and simply never displayed - which is the
 * correct production behaviour once a real delivery adapter exists.
 */
function deliverResetToken(email: string, token: string): void {
  const env = getEnv();

  if (env.isProduction || !env.AUTH_DEV_EXPOSE_TOKENS) {
    // The token was still generated and stored; it simply is not displayed.
    // This is the correct production path until a real email adapter exists.
    getLogger().info({ email }, 'Password reset requested; delivery adapter not configured');
    return;
  }

  const url = `${env.PUBLIC_WEB_URL.replace(/\/+$/, '')}/reset-password?token=${token}`;

  // Embedded in the message rather than passed as a field on purpose: the
  // logger redacts any key matching /token/, so a `resetToken` field would
  // print as [REDACTED] and the development affordance would not work. That
  // redaction is exactly what we want everywhere else, so it is bypassed here
  // only, on a path that configuration validation forbids in production.
  getLogger().warn(`DEV ONLY password reset link for ${email}: ${url}`);
}
