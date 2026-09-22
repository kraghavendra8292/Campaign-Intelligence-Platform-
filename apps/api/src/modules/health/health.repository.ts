import type { DependencyHealth } from '@rk/types';
import { withTimeout } from '@rk/utils';
import { prisma } from '../../database/prisma';
import { getEnv } from '../../config/env';
import { getLogger } from '../../logging/logger';

/**
 * Data-access layer for health probes.
 *
 * This is the only place in the health module that talks to the database; the
 * service layer above it stays free of persistence concerns.
 */
export const healthRepository = {
  /**
   * Probes database connectivity with the cheapest possible round trip.
   *
   * `SELECT 1` is the one justified use of a raw query in the codebase: it
   * deliberately touches no table, so the probe stays valid as the schema
   * evolves and cannot be affected by row-level data.
   *
   * Failures are logged server-side and reduced to a status - the driver
   * message, which can contain the host, port, database name and user, is
   * never returned to the caller.
   *
   * The timeout is configurable and generous by default: Neon suspends idle
   * computes, so the first probe after a quiet period pays a cold-start penalty
   * and a tight timeout would report a healthy database as an outage.
   */
  async probeDatabase(): Promise<DependencyHealth> {
    const startedAt = performance.now();

    try {
      await withTimeout(
        prisma.$queryRaw`SELECT 1`,
        getEnv().DATABASE_PROBE_TIMEOUT_MS,
        'Database health probe timed out',
      );

      return {
        name: 'database',
        status: 'OK',
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      getLogger().error({ err: error }, 'Database health probe failed');

      return {
        name: 'database',
        status: 'ERROR',
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }
  },
};
