import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import type { ApiEnv } from '../../../config/env';
import { getLogger } from '../../../logging/logger';
import { qrResolutionService, buildRedirectUrl } from './qrResolution.service';
import { scanEventService } from './scanEvent.service';

/**
 * Public QR redirect.
 *
 *   GET /q/:code
 *
 * REST rather than GraphQL because the response IS an HTTP redirect. Expressing
 * that through GraphQL would mean a round trip to fetch a URL and a second
 * navigation to follow it, doubling the wait for somebody holding a phone up to
 * a poster.
 *
 * The whole path is: resolve, start the scan write without waiting, redirect.
 * No authentication, no cookie, no consent banner and no interstitial - a QR
 * code on a public notice board must behave like the link it appears to be.
 */

function headerValue(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

/**
 * Rate limiting for the scan endpoint.
 *
 * Tuned for the failure mode that actually happens: a whole family, a classroom
 * or a public meeting scanning the same poster from behind one NAT within a
 * minute. That is legitimate traffic and must not be throttled, so the ceiling
 * is high.
 *
 * What it does stop is a script hammering the endpoint to inflate a rival's
 * scan counts or to enumerate identifiers. Combined with the random 8-character
 * code space, guessing a valid identifier at this rate is not viable.
 *
 * The store is in-memory, matching the Phase 1 global limiter: correct for one
 * process, and the single thing to swap for a multi-instance deployment.
 */
function createScanLimiter(env: ApiEnv) {
  return rateLimit({
    windowMs: env.QR_SCAN_RATE_LIMIT_WINDOW_MS,
    limit: env.QR_SCAN_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // A throttled citizen still gets a page rather than a JSON error body:
    // they scanned a poster and deserve an explanation, not a 429 payload.
    handler: (_req: Request, res: Response) => {
      res
        .status(429)
        .type('html')
        .send(
          noticePage({
            title: 'Too many requests',
            message: 'Please wait a moment and scan again.',
          }),
        );
    },
  });
}

/**
 * A minimal self-contained notice page.
 *
 * Inline styles and no assets, because this page renders when something has
 * already gone wrong and must not depend on the web app being reachable. No
 * internal identifiers, no error codes and no database text ever appear here.
 */
function noticePage(input: { title: string; message: string }): string {
  const escape = (value: string): string =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character] ?? character,
    );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escape(input.title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         padding: 24px; background: #F1F5F9; color: #0F172A;
         font: 16px/1.5 'Segoe UI', system-ui, -apple-system, sans-serif; }
  .card { background: #fff; border-radius: 16px; padding: 32px 28px; max-width: 24rem;
          text-align: center; box-shadow: 0 10px 30px rgba(15,23,42,.08); }
  h1 { font-size: 1.25rem; margin: 0 0 12px; }
  p { margin: 0; color: #475569; }
  .mark { display: inline-grid; place-items: center; width: 44px; height: 44px;
          border-radius: 12px; background: #0F172A; color: #fff;
          font-weight: 700; margin-bottom: 16px; }
</style>
</head>
<body>
  <main class="card">
    <span class="mark" aria-hidden="true">RK</span>
    <h1>${escape(input.title)}</h1>
    <p>${escape(input.message)}</p>
  </main>
</body>
</html>`;
}

export function createQrRedirectRouter(env: ApiEnv): Router {
  const router = Router();
  const limiter = createScanLimiter(env);

  router.get('/q/:code', limiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = String(req.params.code ?? '');
      const resolved = await qrResolutionService.resolve(code);

      // Scan endpoints are not content and must never be indexed; a crawler
      // following one would also pollute the campaign's numbers.
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      // Every response here is per-scan and must not be cached by a proxy,
      // or a paused code would keep redirecting from somebody else's cache.
      res.setHeader('Cache-Control', 'no-store');

      if (resolved.outcome === 'NOT_FOUND') {
        res
          .status(404)
          .type('html')
          .send(
            noticePage({
              title: 'QR code not found',
              message: 'This code is not recognised. Please check the code and try again.',
            }),
          );
        return;
      }

      if (resolved.outcome === 'PAUSED') {
        res
          .status(200)
          .type('html')
          .send(
            noticePage({
              title: 'This QR campaign is currently inactive',
              message: 'Please try again later.',
            }),
          );
        return;
      }

      if (resolved.outcome === 'ARCHIVED') {
        res
          .status(410)
          .type('html')
          .send(
            noticePage({
              title: 'This QR code is no longer active',
              message: 'The campaign it belonged to has ended.',
            }),
          );
        return;
      }

      const destination = buildRedirectUrl(
        env.PUBLIC_SITE_URL,
        resolved.destinationPath as string,
        resolved.utm,
        // Carried so a submission made after this scan can be attributed to
        // this exact printed code. See the note in `buildRedirectUrl`.
        code,
      );

      // Started, NOT awaited. The citizen is redirected while this is still in
      // flight, and `scanEventService.record` swallows and logs any failure.
      void scanEventService.record(
        resolved,
        {
          // `req.ip` honours the configured trust-proxy depth, so it cannot be
          // spoofed past the hops actually deployed. It is consumed by the
          // daily hash and never stored.
          ipAddress: req.ip ?? null,
          userAgent: headerValue(req, 'user-agent'),
          referrer: headerValue(req, 'referer') ?? headerValue(req, 'referrer'),
          correlationId: req.correlationId,
        },
        { visitSecret: env.JWT_SECRET, uniqueEstimation: env.QR_UNIQUE_ESTIMATION },
      );

      // 302, not 301. A permanent redirect would be cached by the browser
      // forever, so re-pointing a printed code would never reach anyone who had
      // already scanned it - and no further scans would be counted.
      res.redirect(302, destination);
    } catch (error) {
      // A citizen must never see a stack trace or an internal identifier.
      getLogger().error(
        { err: error, correlationId: req.correlationId },
        'QR redirect failed unexpectedly',
      );

      if (res.headersSent) {
        next(error);
        return;
      }

      res
        .status(500)
        .type('html')
        .send(
          noticePage({
            title: 'Something went wrong',
            message: 'Please try again in a moment.',
          }),
        );
    }
  });

  return router;
}
