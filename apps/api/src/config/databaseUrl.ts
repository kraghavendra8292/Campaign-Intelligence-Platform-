/**
 * Resolves which connection string a given workload should use.
 *
 * Neon exposes the same database through two endpoints:
 *
 *   DATABASE_URL           pooled   (hostname contains `-pooler`, via PgBouncer)
 *   DATABASE_URL_UNPOOLED  direct   (no `-pooler`)
 *
 * The pooled endpoint runs PgBouncer in transaction mode, which does not keep
 * session state. That is right for ordinary application queries and wrong for
 * schema migrations: Prisma Migrate reuses prepared statements and session
 * settings across statements, and over a pooled connection that surfaces as
 * confusing failures such as `prepared statement "s0" already exists` or a
 * `SET` that silently does not persist.
 *
 * This module is the single place that encodes that rule, so the Prisma CLI
 * config and the seed script cannot drift apart.
 *
 * Kept dependency-free (no imports) because the Prisma CLI loads
 * `prisma.config.ts`, which imports this file, outside the application runtime.
 */

/** The pooled connection used for ordinary application queries. */
export function resolveRuntimeDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return firstNonEmpty(env.DATABASE_URL);
}

/**
 * The direct connection used for migrations, seeding and dumps.
 *
 * Falls back to `DATABASE_URL` so a plain local PostgreSQL - which has no
 * pooled/direct split - needs only one variable.
 */
export function resolveDirectDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return firstNonEmpty(env.DATABASE_URL_UNPOOLED, env.DATABASE_URL);
}

/**
 * Same as `resolveDirectDatabaseUrl`, but fails loudly with actionable text.
 * Used by entry points that cannot do anything useful without a database.
 */
export function requireDirectDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = resolveDirectDatabaseUrl(env);

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set.\n' +
        'Copy apps/api/.env.example to apps/api/.env and paste your Neon connection string.\n' +
        'For Neon, also set DATABASE_URL_UNPOOLED to the direct (non -pooler) string so ' +
        'migrations do not run through PgBouncer.',
    );
  }

  return url;
}

/** True when the connection string points at Neon's pooled (PgBouncer) endpoint. */
export function isPooledConnectionString(url: string): boolean {
  try {
    return new URL(url).hostname.includes('-pooler');
  } catch {
    return false;
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}
