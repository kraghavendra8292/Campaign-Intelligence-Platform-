import type { DependencyHealth, HealthStatus, ServiceHealth } from '@rk/types';
import { getEnv } from '../../config/env';
import { SERVICE_NAME, SERVICE_VERSION } from '../../config/service';
import { healthRepository } from './health.repository';

/**
 * Health business logic.
 *
 * Resolvers and REST routes delegate here; neither transport contains logic of
 * its own. This is the pattern every Phase 2+ module follows:
 *   transport (resolver / route) -> service -> repository -> database.
 */
export const healthService = {
  /**
   * Liveness: is the process up and able to serve requests?
   * Intentionally probes no dependency, so a database outage does not cause an
   * orchestrator to kill an otherwise healthy process.
   */
  getLiveness(): HealthStatus {
    return 'OK';
  },

  /** Readiness: liveness plus every probed dependency. */
  async getReadiness(): Promise<ServiceHealth> {
    const dependencies: DependencyHealth[] = [await healthRepository.probeDatabase()];
    return buildServiceHealth(dependencies);
  },

  /** Database connectivity on its own, for `GET /health/db`. */
  async getDatabaseHealth(): Promise<ServiceHealth> {
    const dependencies: DependencyHealth[] = [await healthRepository.probeDatabase()];
    return buildServiceHealth(dependencies);
  },
};

/**
 * Aggregates dependency results into an overall status.
 *
 * Any failing dependency degrades the whole service to ERROR, which is what an
 * uptime monitor or load balancer needs in order to act.
 */
function buildServiceHealth(dependencies: DependencyHealth[]): ServiceHealth {
  const env = getEnv();
  const status: HealthStatus = dependencies.some((dependency) => dependency.status === 'ERROR')
    ? 'ERROR'
    : 'OK';

  return {
    status,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    dependencies,
  };
}
