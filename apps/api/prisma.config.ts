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
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { requireDirectDatabaseUrl } from './src/config/databaseUrl';

export default defineConfig({
  schema: 'prisma/schema.prisma',

  datasource: {
    url: requireDirectDatabaseUrl(),
  },

  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
