import type { Logger } from 'pino';

/**
 * Request-scoped values attached by `requestContext` middleware.
 * Declared here so every handler sees them as first-class typed properties.
 */
declare global {
  namespace Express {
    interface Request {
      /** Stable id correlating this request across logs and error payloads. */
      correlationId: string;
      /** Logger pre-bound to `correlationId`. */
      log: Logger;
    }
  }
}

export {};
