/** Static identity of this service, surfaced by the health endpoints. */
export const SERVICE_NAME = 'rk-campaign-api';

/**
 * Reported by the health endpoints. Deliberately a coarse application version
 * rather than a build hash or commit SHA, which would leak deployment detail
 * to unauthenticated callers.
 */
export const SERVICE_VERSION = '0.1.0';
