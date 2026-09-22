import { z } from 'zod';
import { booleanSchema, httpUrlSchema } from '@rk/config';

/**
 * Authentication configuration.
 *
 * Kept in its own schema so the auth module owns its contract, and merged into
 * the API env schema in `env.ts`.
 *
 * The signing secret has NO default. A development fallback would inevitably
 * reach a deployment, and a JWT secret that is public in source control means
 * anyone can mint a token for any user. Startup fails instead.
 */
export const authEnvSchema = {
  /** HMAC signing key for access tokens. Minimum 32 bytes of entropy. */
  JWT_SECRET: z
    .string({ message: 'is required (generate with: openssl rand -base64 48)' })
    .min(32, 'must be at least 32 characters of high-entropy secret'),

  JWT_ISSUER: z.string().min(1).default('rk-campaign-api'),
  JWT_AUDIENCE: z.string().min(1).default('rk-campaign-clients'),

  /**
   * Access token lifetime in seconds. Short by design: an access token cannot
   * be revoked individually, so its blast radius is bounded by expiry (and by
   * the `tokenValidFrom` epoch on the user).
   */
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

  /** Refresh session lifetime in seconds. Default 30 days. */
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(60 * 60 * 24 * 90)
    .default(60 * 60 * 24 * 30),

  /** Password reset token lifetime. Short: it is a bearer credential. */
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(3600),

  /** Invitation lifetime in seconds. Default 7 days. */
  INVITATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(3600)
    .max(60 * 60 * 24 * 30)
    .default(60 * 60 * 24 * 7),

  // --- Cookie settings (web refresh credential) ----------------------------
  /** Empty means "host-only cookie", which is the safest default. */
  COOKIE_DOMAIN: z.string().optional(),
  /** Must be true in production; validated in env.ts. */
  COOKIE_SECURE: booleanSchema(false),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  /** Base URL of the admin web app, used to build password-reset links. */
  PUBLIC_WEB_URL: httpUrlSchema.default('http://localhost:5173'),

  // --- Password policy -----------------------------------------------------
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(128).default(12),
  PASSWORD_MAX_LENGTH: z.coerce.number().int().min(64).max(1024).default(256),

  // --- Authentication rate limiting ---------------------------------------
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900_000),
  /** Failed logins per identifier+IP per window. */
  AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(10),
  AUTH_PASSWORD_RESET_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  AUTH_REFRESH_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(60),

  /**
   * Development-only: writes password reset and invitation links to the log.
   * Refused in production by the cross-field check in env.ts - it would put a
   * live bearer credential into the log stream.
   */
  AUTH_DEV_EXPOSE_TOKENS: booleanSchema(false),
};

/**
 * Phase 3 content configuration.
 *
 * `MEDIA_STORAGE_DRIVER` selects the adapter. Local disk is for development;
 * `s3` targets Neon Object Storage (or any S3-compatible host). The
 * `storageKey` contract is identical either way.
 */
export const contentEnvSchema = {
  /**
   * Where uploaded bytes live.
   * - `local` — disk under MEDIA_STORAGE_PATH (ephemeral on Render; OK for local)
   * - `s3` — Neon Object Storage / S3-compatible (required in production)
   */
  MEDIA_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),

  /** Directory for local-disk media. Git-ignored; not suitable for production. */
  MEDIA_STORAGE_PATH: z.string().min(1).default('var/media'),

  /** S3 bucket name (e.g. Neon Object Storage bucket `media`). */
  MEDIA_S3_BUCKET: z.string().min(1).optional(),
  /** S3 region (Neon: `us-east-2` for aws-us-east-2 projects). */
  MEDIA_S3_REGION: z.string().min(1).optional(),
  /** S3 API endpoint (Neon branch storage URL from `get_storage` / console). */
  MEDIA_S3_ENDPOINT: z.string().url().optional(),
  /** S3 access key (Neon credential `token_id`). */
  MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  /** S3 secret key (Neon credential `s3_secret_access_key`). */
  MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  /**
   * Base URL used to build absolute canonical and Open Graph URLs for public
   * pages. Absolute URLs are required: a relative og:image is ignored by every
   * social crawler.
   */
  PUBLIC_SITE_URL: httpUrlSchema.default('http://localhost:5173'),
};

/**
 * Phase 4 QR configuration.
 *
 * `QR_SCAN_BASE_URL` is the origin printed INTO every QR symbol. It is separate
 * from `PUBLIC_SITE_URL` because the scan endpoint lives on the API while the
 * destination page lives on the web app, and in production those are usually
 * different hosts — unless a reverse proxy (Cloudflare Worker `/q/*`) fronts
 * both on one origin. Getting this wrong means printing codes that point
 * nowhere, so it is configuration rather than something inferred at request
 * time (aside from Render's `RENDER_EXTERNAL_URL` fallback).
 */
export const qrEnvSchema = {
  /** Origin that serves `GET /q/:code`. Encoded into printed symbols. */
  QR_SCAN_BASE_URL: httpUrlSchema.default('http://localhost:4000'),

  /**
   * Rate limit for the public scan endpoint.
   *
   * Deliberately generous: a public meeting or a classroom scanning one poster
   * from behind a single NAT is legitimate traffic, and throttling it would
   * break the product for the people it is for. It still stops a script.
   */
  QR_SCAN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  QR_SCAN_RATE_LIMIT_MAX: z.coerce.number().int().min(10).default(600),

  /**
   * Whether to compute the daily, salted visit hash used to estimate repeat
   * scans. Turning it off stores no hash at all and reports the unique estimate
   * as unavailable rather than as zero.
   */
  QR_UNIQUE_ESTIMATION: booleanSchema(true),

  /**
   * Days to retain individual scan rows.
   *
   * Phase 4 does not run a deletion job - this value is the documented policy
   * and the input a future retention task will read. It is declared now so the
   * decision is recorded in configuration rather than left implicit.
   */
  QR_SCAN_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(400),
};

/**
 * Phase 5 citizen submission configuration.
 *
 * These budgets protect an endpoint open to the whole internet, and every one
 * of them is a trade-off against a real person trying to report a real problem.
 * They are deliberately loose: a household, a classroom or an internet cafe
 * behind one NAT must never be blocked, so the limits stop scripts rather than
 * neighbours.
 */
export const issueEnvSchema = {
  /** Window all three citizen budgets are measured over. */
  ISSUE_SUBMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(600_000),
  /** Submissions per IP per window. Ten in ten minutes is generous for a human. */
  ISSUE_SUBMIT_MAX_PER_WINDOW: z.coerce.number().int().min(1).default(10),
  /** Attachment uploads per IP per window; five per submission, so allow more. */
  ISSUE_UPLOAD_MAX_PER_WINDOW: z.coerce.number().int().min(1).default(30),

  /**
   * Reference lookups per IP per window. Much tighter than submission: the
   * reference space is already too large to brute force, and this makes the
   * attempt not worth starting.
   */
  ISSUE_TRACK_WINDOW_MS: z.coerce.number().int().min(1000).default(300_000),
  ISSUE_TRACK_MAX_PER_WINDOW: z.coerce.number().int().min(1).default(20),
};

/** Seed-only bootstrap credentials. Never referenced by the running API. */
export const seedEnvSchema = {
  SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(12).optional(),
  SEED_SUPER_ADMIN_NAME: z.string().min(1).optional(),
};
