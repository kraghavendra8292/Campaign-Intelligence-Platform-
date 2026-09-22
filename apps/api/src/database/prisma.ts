import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { getEnv } from '../config/env';
import { isPooledConnectionString } from '../config/databaseUrl';
import { getLogger } from '../logging/logger';

/**
 * Process-wide Prisma client.
 *
 * Prisma 7 connects through a driver adapter rather than a URL in the schema,
 * so the validated `DATABASE_URL` is handed to `PrismaPg` here - this file is
 * the single place the application learns how to reach the database.
 *
 * Driver choice: `@prisma/adapter-pg` (node-postgres) rather than the Neon
 * serverless driver, because this API is a long-running Node process that
 * reuses one TCP pool across requests. The serverless driver's HTTP/WebSocket
 * transport exists for edge and per-request runtimes, which this is not.
 *
 * One instance is reused because each client owns a connection pool;
 * constructing one per request would exhaust the database's connection budget.
 * The instance is cached on `globalThis` so a dev-server hot restart reuses the
 * existing pool instead of leaking a new one on every reload.
 */
const globalForPrisma = globalThis as unknown as { rkPrisma?: AppPrismaClient };

/**
 * The client type carries the log levels it was constructed with, which is what
 * makes `$on('warn' | 'error')` type-check. Using the bare `PrismaClient` would
 * default those generics to `never`.
 */
export type AppPrismaClient = PrismaClient<'warn' | 'error'>;

function createPrismaClient(): AppPrismaClient {
  const env = getEnv();

  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    // Hosted Postgres closes idle connections server-side; releasing them first
    // avoids handing a dead socket to the next query.
    idleTimeoutMillis: 30_000,
    // Fail a stuck connection attempt rather than hanging a request forever.
    connectionTimeoutMillis: 15_000,
    // TCP keepalive (Phase 10).
    //
    // A pooled connection to a hosted database crosses at least one NAT or
    // stateful firewall, and those drop idle flows silently - the socket looks
    // open from here and is gone at the other end, so the next query fails with
    // "Connection terminated unexpectedly" rather than with anything diagnostic.
    // It presents as unexplained intermittent 500s that never reproduce when
    // somebody goes looking, and it is worse the further the client is from the
    // region.
    //
    // Keepalive probes hold the flow open so the intermediary does not reap it.
    // The initial delay is well under the ~350s that common NAT tables use.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    // Warnings and errors are forwarded to the structured logger rather than
    // being printed straight to stdout by Prisma.
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });
}

function attachLogging(client: AppPrismaClient): AppPrismaClient {
  const logger = getLogger();

  client.$on('warn', (event) => {
    logger.warn({ target: event.target }, event.message);
  });

  client.$on('error', (event) => {
    logger.error({ target: event.target }, event.message);
  });

  return client;
}

export const prisma: AppPrismaClient =
  globalForPrisma.rkPrisma ?? attachLogging(createPrismaClient());

if (!getEnv().isProduction) {
  globalForPrisma.rkPrisma = prisma;
}

/**
 * Warns when the runtime is pointed at a direct endpoint.
 *
 * Not fatal - a direct connection works - but on Neon it forfeits PgBouncer and
 * will exhaust the connection budget under real concurrency, which is a problem
 * that only shows up under load. Better to say so at startup.
 */
export function warnIfNotPooled(): void {
  const env = getEnv();
  if (env.isTest) return;

  if (env.DATABASE_URL_UNPOOLED && !isPooledConnectionString(env.DATABASE_URL)) {
    getLogger().warn(
      'DATABASE_URL does not look like a pooled endpoint. On Neon, application ' +
        'traffic should use the -pooler host; keep the direct host for DATABASE_URL_UNPOOLED.',
    );
  }
}

/** Closes the connection pool during graceful shutdown. */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export type { PrismaClient };
