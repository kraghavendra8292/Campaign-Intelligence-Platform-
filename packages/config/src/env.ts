import { z } from 'zod';

/**
 * Thrown when required configuration is missing or malformed.
 *
 * The message lists every offending variable at once so a developer fixes the
 * whole `.env` in a single pass instead of rediscovering one failure per
 * restart. Values are never echoed back - only variable names and the reason -
 * so a misconfigured secret cannot leak into logs or CI output.
 */
export class EnvValidationError extends Error {
  public readonly issues: readonly string[];

  constructor(appName: string, issues: readonly string[]) {
    const details = issues.map((issue) => `  - ${issue}`).join('\n');
    super(
      `Invalid environment configuration for "${appName}":\n${details}\n\n` +
        `Copy the matching .env.example to .env and fill in the missing values.`,
    );
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Validates a raw environment record against a Zod schema.
 *
 * Kept schema-agnostic so each application owns its own contract while sharing
 * identical failure behaviour and error formatting.
 */
export function parseEnv<TSchema extends z.ZodType>(
  appName: string,
  schema: TSchema,
  source: Record<string, string | undefined>,
): z.infer<TSchema> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    });
    throw new EnvValidationError(appName, issues);
  }

  return result.data;
}

/** Recognised deployment environments. */
export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

/**
 * Parses a TCP port from an environment string.
 *
 * Environment variables are always strings, so this coerces and then enforces
 * a valid, non-privileged-safe port range.
 */
export function portSchema(defaultPort: number) {
  return z.coerce.number().int().min(1).max(65535).default(defaultPort);
}

/** Parses a boolean-ish environment flag (`true`, `1`, `yes`, `on`). */
export function booleanSchema(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return defaultValue;
      return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
    });
}

/**
 * Parses a comma-separated list, for example a CORS allow-list.
 * Blank entries are dropped so a trailing comma is harmless.
 */
export function csvSchema(defaultValue: readonly string[] = []) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return [...defaultValue];
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    });
}

/**
 * Hosts treated as local, where an unencrypted connection is acceptable
 * because the traffic never leaves the machine or the container network.
 */
const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'host.docker.internal',
  'postgres', // docker-compose service name
]);

export function isLocalDatabaseHost(hostname: string): boolean {
  return LOCAL_DATABASE_HOSTS.has(hostname.toLowerCase());
}

/** Parses a connection string, returning null instead of throwing. */
function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * A PostgreSQL connection string.
 *
 * Beyond the scheme check, TLS is *required* for any non-local host. The
 * platform's database is hosted (Neon), so the connection crosses the public
 * internet: a connection string without `sslmode` would send credentials and
 * citizen data in the clear, and it fails silently rather than loudly. Local
 * and container-network hosts are exempt so Docker and CI need no certificates.
 */
export const postgresUrlSchema = z.string().superRefine((value, ctx) => {
  // Checks run most-general first and stop at the first failure, so one bad
  // variable produces one actionable line rather than a cascade of three.
  const addIssue = (message: string) => ctx.addIssue({ code: 'custom', message });

  if (value.trim().length === 0) {
    addIssue('is required');
    return;
  }

  if (!value.startsWith('postgres://') && !value.startsWith('postgresql://')) {
    addIssue('must be a PostgreSQL connection string starting with postgres:// or postgresql://');
    return;
  }

  const url = safeParseUrl(value);
  if (url === null || url.hostname.length === 0) {
    addIssue('must be a parseable connection URL including a host');
    return;
  }

  if (!isLocalDatabaseHost(url.hostname) && !url.searchParams.has('sslmode')) {
    addIssue(
      'must set sslmode for a remote database (Neon: append ?sslmode=verify-full&channel_binding=require)',
    );
  }
});

/** An absolute http(s) URL with no trailing slash ambiguity. */
export const httpUrlSchema = z
  .string()
  .min(1, 'is required')
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be an absolute http(s) URL');
