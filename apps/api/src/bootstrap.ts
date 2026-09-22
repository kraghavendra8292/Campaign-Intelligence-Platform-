import type { Server } from 'node:http';
import { GRAPHQL_PATH, HEALTH_PATH } from '@rk/config';
import { createApp } from './app';
import { getEnv } from './config/env';
import { getLogger } from './logging/logger';
import { disconnectPrisma, warnIfNotPooled } from './database/prisma';
import { requeueStranded } from './modules/ai/aiQueue';
import { requeueStranded as requeueNotifications } from './modules/communication/notificationQueue';

/**
 * Server lifecycle.
 *
 * Split from `server.ts` so the entry point can validate configuration *before*
 * this module is imported: importing it constructs the Prisma client and its
 * connection pool, which requires a valid `DATABASE_URL`.
 */

/** How long in-flight requests get to finish before the process exits. */
const SHUTDOWN_GRACE_MS = 10_000;

export async function startServer(): Promise<void> {
  const env = getEnv();
  const logger = getLogger();
  const { app, apollo } = await createApp(env);

  warnIfNotPooled();

  const server: Server = app.listen(env.GRAPHQL_PORT, env.HOST, () => {
    logger.info(
      {
        port: env.GRAPHQL_PORT,
        host: env.HOST,
        graphql: GRAPHQL_PATH,
        health: HEALTH_PATH,
        introspection: env.GRAPHQL_INTROSPECTION,
      },
      'API listening',
    );
  });

  server.on('error', (error) => {
    logger.fatal({ err: error }, 'HTTP server error');
    process.exitCode = 1;
  });

  registerShutdownHandlers(server, apollo);

  /**
   * Phase 6: pick up AI work stranded by the previous shutdown.
   *
   * Deliberately not awaited, and deliberately after the server is listening.
   * This is a background convenience - the API must start serving traffic
   * whether or not the AI subsystem has anything to recover, and a slow or
   * failing recovery must not delay readiness. `requeueStranded` swallows its
   * own errors for the same reason.
   */
  void requeueStranded();

  /**
   * Phase 8: pick up notifications stranded by the previous shutdown.
   *
   * Same contract as the AI recovery above - detached, after the server is
   * listening, swallowing its own errors. Bounded, so a crash does not produce
   * a burst of stale messages to citizens the moment the process returns.
   */
  void requeueNotifications();
}

/**
 * Graceful shutdown.
 *
 * Stops accepting connections, lets in-flight work finish, then releases the
 * database pool. A hard timeout guarantees the process still exits if a
 * connection refuses to close.
 */
function registerShutdownHandlers(server: Server, apollo: { stop: () => Promise<void> }): void {
  const logger = getLogger();
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutting down');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceExit.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await apollo.stop();
      await disconnectPrisma();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // A process in an unknown state must not keep serving traffic.
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection');
  });
}
