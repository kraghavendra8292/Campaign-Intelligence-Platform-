import type { Request, Response } from 'express';
import { getEnv } from '../../config/env';

/**
 * The refresh-token cookie.
 *
 * Why a cookie at all: the refresh token is the long-lived credential, so the
 * one place it must never be readable is JavaScript. `HttpOnly` puts it beyond
 * reach of any XSS that manages to run on the page - which localStorage cannot
 * do, and which is why the access token (short-lived, in memory) is the only
 * credential the SPA ever handles directly.
 *
 * CSRF is addressed in layers rather than by SameSite alone:
 *   - SameSite=strict keeps the cookie off cross-site requests entirely;
 *   - Apollo Server's CSRF prevention requires a preflighted content type, so a
 *     simple <form> POST cannot reach the GraphQL endpoint at all;
 *   - `assertSameOrigin` below rejects a mutation whose Origin is not allow-listed.
 * SameSite is not treated as sufficient on its own because it is a same-SITE
 * control, not same-origin: a sibling subdomain is still "same site".
 */
export const REFRESH_COOKIE_NAME = 'rk_refresh_token';

/** Scoped to the GraphQL path: it is never sent to any other route. */
const REFRESH_COOKIE_PATH = '/graphql';

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  const env = getEnv();

  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

/**
 * Clears the cookie on logout.
 *
 * Attributes must match those used when setting it, or the browser keeps the
 * original cookie and the "logout" silently fails client-side.
 */
export function clearRefreshCookie(res: Response): void {
  const env = getEnv();

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

export function readRefreshCookie(req: Request): string | null {
  const value = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Rejects a cross-origin request that carries credentials.
 *
 * Defence in depth behind SameSite. A request with no Origin header is allowed
 * because non-browser clients (mobile, server-to-server, curl) legitimately
 * omit it - and those clients are not subject to CSRF, which is a browser
 * ambient-credential problem.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return getEnv().CORS_ORIGINS.includes(origin);
}
