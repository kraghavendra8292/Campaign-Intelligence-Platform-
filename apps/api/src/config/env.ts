import 'dotenv/config';
import { z } from 'zod';
import {
  booleanSchema,
  csvSchema,
  nodeEnvSchema,
  parseEnv,
  portSchema,
  postgresUrlSchema,
} from '@rk/config';
import { EnvValidationError } from '@rk/config';
import { authEnvSchema, contentEnvSchema, issueEnvSchema, qrEnvSchema } from './authEnv';
import { aiEnvSchema } from './aiEnv';
import { communicationEnvSchema } from './communicationEnv';

/**
 * The API's environment contract.
 *
 * Validated once at startup so a misconfigured deployment fails immediately
 * and loudly rather than at the first request that happens to need a variable.
 */
const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,

  /**
   * Pooled PostgreSQL connection string used for application queries.
   * Never logged, never returned to a client.
   */
  DATABASE_URL: postgresUrlSchema,

  /**
   * Direct (non-pooled) connection string, used by migrations and seeding.
   * Optional: a plain local PostgreSQL has no pooled/direct split, so this
   * falls back to DATABASE_URL. Required in practice for Neon.
   */
  DATABASE_URL_UNPOOLED: postgresUrlSchema.optional(),

  /**
   * Maximum connections this process opens to PostgreSQL.
   * Kept small by default: Neon's pooled endpoint fronts PgBouncer, so a large
   * client-side pool buys nothing and just consumes the project's budget.
   */
  /**
   * Maximum pooled database connections.
   *
   * RAISED FROM 10 TO 25 IN PHASE 10, because 10 was smaller than a single
   * request. The analytics services deliberately fan out - one dashboard answer
   * is a dozen independent aggregates issued together - and the widest are:
   *
   *   issueAnalytics.byCategory   15 concurrent queries
   *   qrAnalytics.summary         12
   *   analytics.overview          11
   *
   * With a pool of 10, ONE of those requests could not fit. It did not fail
   * outright; it queued against itself and, once a second request arrived,
   * waited past `connectionTimeoutMillis` and surfaced as an opaque 500. That
   * is exactly how it presented - dashboards that worked when clicked slowly and
   * failed intermittently under load, which is the hardest kind of fault to
   * diagnose from a bug report.
   *
   * 25 fits the widest single request with room for concurrent traffic. Neon's
   * pooled endpoint accommodates far more, so this is not close to a limit; the
   * ceiling below exists to stop a typo exhausting the database instead.
   *
   * If a future query fans out wider than this, raise it or bound the fan-out.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(25),

  /**
   * Timeout for the database health probe.
   * Generous by default because Neon computes scale to zero when idle, so the
   * first query after a suspend pays a cold-start penalty that would otherwise
   * make an idle-but-healthy database look like an outage.
   */
  DATABASE_PROBE_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(10_000),

  GRAPHQL_PORT: portSchema(4000),
  HOST: z.string().min(1).default('0.0.0.0'),

  /** Comma-separated browser origins permitted to call the API. */
  CORS_ORIGINS: csvSchema(['http://localhost:5173']),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Human-readable colourised logs. Defaults on outside production. */
  LOG_PRETTY: booleanSchema(false),

  /** Serves the GraphQL IDE and introspection. Must stay off in production. */
  GRAPHQL_INTROSPECTION: booleanSchema(false),

  /**
   * Ceilings on how much work ONE GraphQL document may ask for (Phase 10).
   *
   * Rate limits cap how many requests arrive and pagination caps how many rows
   * a field returns; neither caps a single deeply nested request. `/graphql` is
   * reachable unauthenticated because the public site is served through it, so
   * that gap was exploitable with one request and no credentials.
   *
   * Configurable rather than fixed so an operator can tighten them under attack
   * without a deploy. Defaults are in `graphql/validation/queryLimits.ts`.
   */
  GRAPHQL_MAX_DEPTH: z.coerce.number().int().min(3).max(50).default(12),
  GRAPHQL_MAX_COST: z.coerce.number().int().min(100).max(1_000_000).default(5_000),

  /** Fixed window rate limit applied to all HTTP traffic. */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  /** Number of reverse proxies in front of the API (affects client IP trust). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  // --- Authentication (Phase 2) -------------------------------------------
  ...authEnvSchema,

  // --- Public site and CMS (Phase 3) --------------------------------------
  ...contentEnvSchema,

  // --- QR campaigns (Phase 4) ---------------------------------------------
  ...qrEnvSchema,

  // --- Citizen submissions (Phase 5) --------------------------------------
  ...issueEnvSchema,

  // --- AI issue intelligence (Phase 6) ------------------------------------
  ...aiEnvSchema,

  // --- Citizen communication (Phase 8) ------------------------------------
  ...communicationEnvSchema,
});

export type ApiEnv = z.infer<typeof apiEnvSchema> & {
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
};

/**
 * Configuration that is merely unwise in development but unacceptable in
 * production. Checked after parsing so the message can name the variable and
 * explain the risk, rather than failing an opaque schema rule.
 */
function assertProductionHardening(parsed: z.infer<typeof apiEnvSchema>): void {
  const problems: string[] = [];

  if (!parsed.COOKIE_SECURE) {
    problems.push('COOKIE_SECURE must be true: the refresh cookie would be sent over plain HTTP.');
  }

  if (parsed.COOKIE_SAMESITE === 'none' && !parsed.COOKIE_SECURE) {
    problems.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true.');
  }

  if (parsed.AUTH_DEV_EXPOSE_TOKENS) {
    problems.push(
      'AUTH_DEV_EXPOSE_TOKENS must be false: it writes live password reset and ' +
        'invitation tokens into the log stream.',
    );
  }

  if (parsed.GRAPHQL_INTROSPECTION) {
    problems.push('GRAPHQL_INTROSPECTION must be false so the schema is not publicly enumerable.');
  }

  if (parsed.CORS_ORIGINS.some((origin) => origin.startsWith('http://'))) {
    problems.push('CORS_ORIGINS must not contain a plain http:// origin.');
  }

  for (const [name, value] of [
    ['QR_SCAN_BASE_URL', parsed.QR_SCAN_BASE_URL],
    ['PUBLIC_SITE_URL', parsed.PUBLIC_SITE_URL],
    ['PUBLIC_WEB_URL', parsed.PUBLIC_WEB_URL],
    ['NOTIFICATION_LINK_BASE_URL', parsed.NOTIFICATION_LINK_BASE_URL],
  ] as const) {
    if (isLoopbackHttpUrl(value)) {
      problems.push(
        `${name} must not be a localhost URL in production: QR symbols, redirects ` +
          'and emailed links would point at the visitor’s own machine.',
      );
    }
  }

  if (parsed.AI_ENABLED && parsed.AI_PROVIDER === 'openai' && !parsed.OPENAI_API_KEY) {
    problems.push(
      'OPENAI_API_KEY is required when AI_ENABLED=true and AI_PROVIDER=openai: ' +
        'every generation would fail at the provider call.',
    );
  }

  if (parsed.NOTIFICATIONS_ENABLED && parsed.EMAIL_PROVIDER === 'log') {
    problems.push(
      'EMAIL_PROVIDER must not be "log" in production: notifications would be ' +
        'recorded as sent while the citizen received nothing.',
    );
  }

  if (parsed.NOTIFICATIONS_ENABLED && !parsed.EMAIL_FROM) {
    problems.push('EMAIL_FROM is required when NOTIFICATIONS_ENABLED=true.');
  }

  if (
    parsed.NOTIFICATIONS_ENABLED &&
    parsed.EMAIL_PROVIDER === 'smtp' &&
    (!parsed.SMTP_HOST || !parsed.SMTP_USER || !parsed.SMTP_PASSWORD)
  ) {
    problems.push('SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required when EMAIL_PROVIDER=smtp.');
  }

  if (parsed.AI_ENABLED && parsed.AI_PROVIDER === 'mock') {
    problems.push(
      'AI_PROVIDER must not be "mock" in production: it returns placeholder ' +
        'text that would be shown to administrators as though it were analysis.',
    );
  }

  if (parsed.MEDIA_STORAGE_DRIVER !== 's3') {
    problems.push(
      'MEDIA_STORAGE_DRIVER must be "s3" in production: local disk is ephemeral ' +
        'on container hosts and hero/CMS images disappear after every redeploy.',
    );
  } else {
    for (const [name, value] of [
      ['MEDIA_S3_BUCKET', parsed.MEDIA_S3_BUCKET],
      ['MEDIA_S3_REGION', parsed.MEDIA_S3_REGION],
      ['MEDIA_S3_ENDPOINT', parsed.MEDIA_S3_ENDPOINT],
      ['MEDIA_S3_ACCESS_KEY_ID', parsed.MEDIA_S3_ACCESS_KEY_ID],
      ['MEDIA_S3_SECRET_ACCESS_KEY', parsed.MEDIA_S3_SECRET_ACCESS_KEY],
    ] as const) {
      if (!value) {
        problems.push(`${name} is required when MEDIA_STORAGE_DRIVER=s3.`);
      }
    }
  }

  if (problems.length > 0) {
    throw new EnvValidationError('@rk/api (production hardening)', problems);
  }
}

/**
 * Cross-field check for S3 media config outside production (dev/test may use
 * local disk). When the driver is s3, every credential field must be present
 * so a half-configured deployment fails at boot instead of on first upload.
 */
function assertS3MediaConfig(parsed: z.infer<typeof apiEnvSchema>): void {
  if (parsed.MEDIA_STORAGE_DRIVER !== 's3') return;

  const problems: string[] = [];
  for (const [name, value] of [
    ['MEDIA_S3_BUCKET', parsed.MEDIA_S3_BUCKET],
    ['MEDIA_S3_REGION', parsed.MEDIA_S3_REGION],
    ['MEDIA_S3_ENDPOINT', parsed.MEDIA_S3_ENDPOINT],
    ['MEDIA_S3_ACCESS_KEY_ID', parsed.MEDIA_S3_ACCESS_KEY_ID],
    ['MEDIA_S3_SECRET_ACCESS_KEY', parsed.MEDIA_S3_SECRET_ACCESS_KEY],
  ] as const) {
    if (!value) problems.push(`${name} is required when MEDIA_STORAGE_DRIVER=s3.`);
  }

  if (problems.length > 0) {
    throw new EnvValidationError('@rk/api (media storage)', problems);
  }
}

/** True for http(s) URLs whose host is loopback (localhost / 127.0.0.1 / ::1). */
function isLoopbackHttpUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Applies platform-provided public URL defaults before schema parsing.
 *
 * Render injects `RENDER_EXTERNAL_URL` for the service. When an operator forgets
 * `QR_SCAN_BASE_URL`, that value is a safer production default than the
 * localhost schema default — QR symbols would otherwise encode
 * http://localhost:4000 and never record a scan.
 */
function applyPublicUrlDefaults(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const renderUrl = firstNonEmpty(source.RENDER_EXTERNAL_URL)?.replace(/\/+$/, '');
  if (!renderUrl) return source;

  const next = { ...source };
  if (!firstNonEmpty(source.QR_SCAN_BASE_URL)) {
    next.QR_SCAN_BASE_URL = renderUrl;
  }
  return next;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function build(source: Record<string, string | undefined>): ApiEnv {
  const withDefaults = applyPublicUrlDefaults(source);
  const parsed = parseEnv('@rk/api', apiEnvSchema, withDefaults);
  const isProduction = parsed.NODE_ENV === 'production';

  assertS3MediaConfig(parsed);

  if (isProduction) {
    assertProductionHardening({
      ...parsed,
      GRAPHQL_INTROSPECTION:
        withDefaults.GRAPHQL_INTROSPECTION === undefined ? false : parsed.GRAPHQL_INTROSPECTION,
    });
  }

  return {
    ...parsed,
    // Developer-friendly defaults that stay safe in production: pretty logs and
    // the GraphQL IDE are enabled outside production unless explicitly set.
    LOG_PRETTY: withDefaults.LOG_PRETTY === undefined ? !isProduction : parsed.LOG_PRETTY,
    GRAPHQL_INTROSPECTION:
      withDefaults.GRAPHQL_INTROSPECTION === undefined ? !isProduction : parsed.GRAPHQL_INTROSPECTION,
    isProduction,
    isDevelopment: parsed.NODE_ENV === 'development',
    isTest: parsed.NODE_ENV === 'test',
  };
}

let cached: ApiEnv | null = null;

/** Returns the validated environment, parsing it on first use. */
export function getEnv(): ApiEnv {
  cached ??= build(process.env);
  return cached;
}

/** Test helper: builds an env object from an explicit source without caching. */
export function buildEnvForTesting(source: Record<string, string | undefined>): ApiEnv {
  return build(source);
}
