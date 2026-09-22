/**
 * Health module public surface.
 *
 * Modules export only what other layers may consume. Internals (repository,
 * private helpers) are reached through the service, never imported directly by
 * another module.
 */
export { healthResolvers } from './health.resolvers';
export { createHealthRouter } from './health.routes';
export { healthService } from './health.service';
