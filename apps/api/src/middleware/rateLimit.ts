import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { HEALTH_DB_PATH, HEALTH_PATH } from '@rk/config';
import type { ApiEnv } from '../config/env';
import { AppError } from '../errors/AppError';

/** Matches the public QR scan endpoint, which governs its own rate limit. */
const QR_SCAN_PATH_PATTERN = /^\/q\/[^/]*$/;

/**
 * Fixed-window rate limiting.
 *
 * Phase 1 uses the in-memory store, which is correct for a single process but
 * does not coordinate across instances. The store is the only thing that needs
 * to change for horizontal scaling - swap in a Redis store (the placeholder
 * service already exists in docker-compose) without touching call sites.
 */
export function createRateLimiter(env: ApiEnv): RateLimitRequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) =>
      // Uptime monitors poll health frequently and must never be throttled.
      req.path === HEALTH_PATH ||
      req.path === HEALTH_DB_PATH ||
      // The public QR scan endpoint carries its OWN, deliberately higher limit
      // (see `qrRedirect.routes.ts`). It is exempted here rather than left to
      // whichever limiter fires first, because this one runs earlier in the
      // chain and its lower ceiling would otherwise silently override the
      // scan-specific one - throttling a classroom or a public meeting
      // scanning the same poster, which is exactly the traffic the product is
      // for.
      QR_SCAN_PATH_PATTERN.test(req.path),
    // Route rejections through the standard error pipeline so the response
    // shape matches every other error the API returns.
    handler: (_req, _res, next) => {
      next(AppError.rateLimited('Too many requests. Please retry shortly.'));
    },
  });
}
