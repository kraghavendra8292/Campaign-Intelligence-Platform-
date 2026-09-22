import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getEnv } from '../../config/env';
import { AppError } from '../../errors/AppError';

/**
 * Token minting and verification.
 *
 * Two credential kinds, deliberately different in nature:
 *
 *  - ACCESS token: a short-lived signed JWT. Stateless, so it is fast to
 *    verify, but it cannot be individually revoked - which is why it is short
 *    and why every request still re-reads authority from the database.
 *
 *  - REFRESH token: a long-lived opaque random string. It carries no claims;
 *    it is a lookup key into the `sessions` table, so it is revocable and
 *    rotatable. Only its SHA-256 digest is persisted.
 */

/** 256 bits of entropy. Guessing is not a realistic attack at this size. */
const OPAQUE_TOKEN_BYTES = 32;

export type AccessTokenClaims = {
  /** Subject: the user id. */
  sub: string;
  /** Session id, so an access token can be tied back to its refresh session. */
  sid: string;
  /** Token type, so a refresh flow can never accept an access token. */
  typ: 'access';
};

let cachedKey: Uint8Array | null = null;

function signingKey(): Uint8Array {
  cachedKey ??= new TextEncoder().encode(getEnv().JWT_SECRET);
  return cachedKey;
}

/** Test helper: drops the memoised key after the environment changes. */
export function resetTokenServiceCache(): void {
  cachedKey = null;
}

export const tokenService = {
  /**
   * Mints an access token.
   *
   * The payload carries identity only - no email, no roles, no permissions. A
   * JWT is signed but not encrypted, so anything inside it is readable by
   * anyone holding the token; and cached authority would keep working after a
   * role was revoked.
   */
  async issueAccessToken(userId: string, sessionId: string): Promise<string> {
    const env = getEnv();
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({ sid: sessionId, typ: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + env.ACCESS_TOKEN_TTL_SECONDS)
      .setJti(randomBytes(16).toString('hex'))
      .sign(signingKey());
  },

  /**
   * Verifies an access token.
   *
   * Signature, issuer, audience, expiry and not-before are all checked by
   * `jwtVerify`; the algorithm is pinned to HS256 so a token cannot arrive
   * claiming `alg: none` or an asymmetric algorithm. The token type is checked
   * explicitly to keep credential kinds from being interchangeable.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const env = getEnv();

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, signingKey(), {
        algorithms: ['HS256'],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        clockTolerance: 5,
      }));
    } catch {
      // Never surface the library's reason: "expired" vs "bad signature" tells
      // an attacker which half of a forgery attempt succeeded.
      throw AppError.unauthenticated('Your session is no longer valid. Please sign in again.');
    }

    const sub = payload.sub;
    const sid = payload['sid'];
    const typ = payload['typ'];

    if (typeof sub !== 'string' || typeof sid !== 'string' || typ !== 'access') {
      throw AppError.unauthenticated('Your session is no longer valid. Please sign in again.');
    }

    return { sub, sid, typ: 'access' };
  },

  /** Generates an opaque, URL-safe bearer token (refresh / reset / invite). */
  generateOpaqueToken(): string {
    return randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');
  },

  /**
   * Digests an opaque token for storage.
   *
   * Plain SHA-256 is correct here, unlike for passwords: the input already has
   * 256 bits of entropy, so there is nothing to brute-force and a slow KDF
   * would only add latency to every refresh.
   */
  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  },

  /** Constant-time digest comparison, to avoid leaking a prefix match. */
  digestsMatch(left: string, right: string): boolean {
    const a = Buffer.from(left, 'utf8');
    const b = Buffer.from(right, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },
};
