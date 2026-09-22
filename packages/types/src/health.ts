/** Health reporting contract shared by the REST and GraphQL health surfaces. */

export const HEALTH_STATUSES = ['OK', 'DEGRADED', 'ERROR'] as const;

export type HealthStatus = (typeof HEALTH_STATUSES)[number];

/** Result of probing a single dependency (for example the database). */
export interface DependencyHealth {
  readonly name: string;
  readonly status: HealthStatus;
  /** Round-trip latency of the probe in milliseconds. */
  readonly latencyMs: number;
}

/**
 * Aggregate service health.
 *
 * Deliberately contains no credentials, connection strings, host names or
 * driver error text - this payload is safe to expose to unauthenticated
 * callers and to uptime monitors.
 */
export interface ServiceHealth {
  readonly status: HealthStatus;
  readonly service: string;
  readonly version: string;
  readonly environment: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
  readonly dependencies: readonly DependencyHealth[];
}
