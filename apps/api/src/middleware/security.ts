import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { CORRELATION_ID_HEADER, TENANT_HEADER } from '@rk/config';
import { AppError } from '../errors/AppError';
import type { ApiEnv } from '../config/env';

/**
 * Security response headers.
 *
 * The API serves JSON only, so the CSP is locked to `'none'` for every
 * directive. The GraphQL IDE is a separate concern: it is mounted with its own
 * relaxed policy in development and disabled entirely in production.
 */
export function securityHeaders(env: ApiEnv): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
    // The API is not a browsing context; deny embedding outright.
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    // Only meaningful over TLS; enabled in production where TLS terminates.
    hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    // Hides the fact this is Express.
    hidePoweredBy: true,
    // Public site and API are often different registrable domains (e.g.
    // *.workers.dev → *.onrender.com). `same-site` would block <img src> for
    // /media/:id; `cross-origin` allows embedding while CSP still locks the API.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
}

/**
 * Cross-origin policy driven entirely by `CORS_ORIGINS`.
 *
 * An explicit allow-list is used rather than reflecting the request origin, so
 * a browser on an unknown site cannot read authenticated responses once
 * credentials arrive in Phase 2.
 */
export function corsMiddleware(env: ApiEnv): RequestHandler {
  const allowed = new Set(env.CORS_ORIGINS);

  const options: CorsOptions = {
    origin(origin, callback) {
      // Same-origin, server-to-server and health-probe requests send no Origin.
      if (!origin) return callback(null, true);

      if (allowed.has(origin)) return callback(null, true);

      return callback(AppError.badRequest('Origin is not permitted by CORS policy.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', CORRELATION_ID_HEADER, TENANT_HEADER],
    exposedHeaders: [CORRELATION_ID_HEADER],
    maxAge: 86_400,
  };

  return cors(options);
}
