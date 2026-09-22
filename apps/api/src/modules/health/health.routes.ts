import { Router } from 'express';
import { HEALTH_DB_PATH, HEALTH_PATH, READY_PATH } from '@rk/config';
import { healthService } from './health.service';

/**
 * REST health surface, kept alongside GraphQL because orchestrators, load
 * balancers and uptime monitors expect plain HTTP status codes.
 *
 * No endpoint here returns a connection string, host name, credential or
 * driver error - only a coarse status and a latency figure.
 */
export function createHealthRouter(): Router {
  const router = Router();

  // Liveness. Always 200 while the process can serve traffic.
  router.get(HEALTH_PATH, (_req, res) => {
    res.status(200).json({
      status: healthService.getLiveness(),
    });
  });

  /**
   * Readiness. 503 when a dependency is down so traffic can be drained.
   *
   * `healthService.getReadiness()` existed from Phase 1 but was never routed -
   * the only dependency probe reachable over HTTP was `/health/db`, which is
   * named for the database rather than for the question an orchestrator asks.
   * Phase 10 exposes it at the conventional path so a Kubernetes readinessProbe
   * or a load-balancer target group can be pointed at it without knowing that
   * the database happens to be the only dependency probed today.
   */
  router.get(READY_PATH, async (_req, res, next) => {
    try {
      const health = await healthService.getReadiness();
      res.status(health.status === 'OK' ? 200 : 503).json(health);
    } catch (error) {
      next(error);
    }
  });

  // Kept at its original path: Phase 1-9 deployments and any uptime monitor
  // already configured against it must not break.
  router.get(HEALTH_DB_PATH, async (_req, res, next) => {
    try {
      const health = await healthService.getDatabaseHealth();
      res.status(health.status === 'OK' ? 200 : 503).json(health);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
