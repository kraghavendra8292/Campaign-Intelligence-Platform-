/**
 * Prisma CLI configuration.
 *
 * Prisma 7 removed the connection URL from `schema.prisma` and no longer loads
 * `.env` implicitly, so both are handled here. This file configures the CLI
 * only (migrate, db seed, studio); the runtime client gets the pooled URL
 * through the PrismaPg driver adapter in `src/database/prisma.ts`.
 *
 * Migrations deliberately use the DIRECT connection - see
 * `src/config/databaseUrl.ts` for why a pooled endpoint breaks Prisma Migrate.
 *
 * `prisma generate` never opens a database connection. Hosts that only need the
 * generated client for a compile step (monorepo `npm run build`, Cloudflare
 * Pages, Docker) may not have DATABASE_URL set — those runs get a local
 * placeholder so generate still succeeds. migrate/seed/studio still require a
 * real URL and fail loudly when it is missing.
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import {
  requireDirectDatabaseUrl,
  resolveDirectDatabaseUrl,
} from './src/config/databaseUrl';

/** Used only when `prisma generate` runs without DATABASE_URL. Never connected to. */
const GENERATE_PLACEHOLDER_URL =
  'postgresql://127.0.0.1:5432/prisma_generate_placeholder';

function resolveCliDatabaseUrl(): string {
  const url = resolveDirectDatabaseUrl();
  if (url) return url;
  if (process.argv.includes('generate')) return GENERATE_PLACEHOLDER_URL;
  return requireDirectDatabaseUrl();
}

export default defineConfig({
  schema: 'prisma/schema.prisma',

  datasource: {
    url: resolveCliDatabaseUrl(),
  },

  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
