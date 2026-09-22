/**
 * Proxies public QR scan requests to the API while the rest of the site is
 * served as static Vite assets.
 *
 * Architecture:
 *   phone scans  →  https://<site>/q/RK-QR-…
 *                →  this Worker forwards to  API_ORIGIN/q/RK-QR-…
 *                →  API records the scan and 302s to PUBLIC_SITE_URL + destination
 *
 * Without this proxy, QR symbols would have to encode the API host directly,
 * and a misconfigured QR_SCAN_BASE_URL defaults to http://localhost:4000.
 */

export interface Env {
  /** Binding that serves apps/web/dist. */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  /**
   * Absolute origin of the deployed API (no trailing slash), e.g.
   * https://rk-api.onrender.com
   *
   * Set as a Cloudflare Worker secret / environment variable: API_ORIGIN
   */
  API_ORIGIN: string;
}

const SCAN_PATH = /^\/q\/[^/]+\/?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (SCAN_PATH.test(url.pathname)) {
      return proxyScan(request, url, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function proxyScan(request: Request, url: URL, env: Env): Promise<Response> {
  const apiOrigin = (env.API_ORIGIN ?? '').trim().replace(/\/+$/, '');

  if (!apiOrigin) {
    return new Response(
      'QR scan proxy is not configured. Set the API_ORIGIN Worker variable to your API origin.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  let upstream: URL;
  try {
    upstream = new URL(`${url.pathname}${url.search}`, `${apiOrigin}/`);
  } catch {
    return new Response('Invalid API_ORIGIN.', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (upstream.protocol !== 'https:' && upstream.protocol !== 'http:') {
    return new Response('API_ORIGIN must be an http(s) URL.', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const headers = new Headers(request.headers);
  // Upstream should see the citizen's client, not the Worker as the sole hop.
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

  return fetch(upstream, {
    method: request.method,
    headers,
    redirect: 'manual',
  });
}
