/**
 * Values that must stay identical across the API, web and mobile applications.
 * Anything environment-specific belongs in `.env`, never here.
 */

/** Header used to propagate a request correlation id end to end. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Header that will carry the active tenant in Phase 2.
 * Declared now so clients and the API agree on the name from day one.
 */
export const TENANT_HEADER = 'x-organization-id';

/** Canonical GraphQL endpoint path, shared by server and clients. */
export const GRAPHQL_PATH = '/graphql';

/** REST health endpoints. */
export const HEALTH_PATH = '/health';
export const HEALTH_DB_PATH = '/health/db';
/**
 * Readiness, for orchestrators that distinguish it from liveness (Phase 10).
 *
 * Separate from `/health` on purpose: a failing readiness probe should drain
 * traffic away from an instance, whereas a failing liveness probe should
 * restart it. Pointing both at the same dependency check means a brief database
 * blip kills every healthy pod instead of parking them.
 */
export const READY_PATH = '/ready';

/** Maximum accepted request body size. Blocks trivial memory-exhaustion. */
export const MAX_REQUEST_BODY_SIZE = '256kb';
