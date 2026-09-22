/**
 * Process entry point.
 *
 * Configuration is validated FIRST, before anything that depends on it is
 * imported. This ordering is deliberate and load-bearing: importing
 * `./bootstrap` transitively constructs the Prisma client and its connection
 * pool, so with a static import a bad `DATABASE_URL` would surface as a Node
 * stack trace thrown during module evaluation, burying the actionable message.
 * Validating here and importing dynamically means a misconfigured environment
 * prints exactly which variable is wrong, and nothing else.
 */
import { EnvValidationError } from '@rk/config';
import { getEnv } from './config/env';

/** Reports a startup failure on stderr and stops. */
function abort(message: string): never {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}

try {
  // Throws EnvValidationError listing every offending variable at once.
  getEnv();
} catch (error) {
  if (error instanceof EnvValidationError) {
    abort(error.message);
  }
  abort(`Failed to read configuration: ${error instanceof Error ? error.message : String(error)}`);
}

// Only now is it safe to pull in the database client and the HTTP stack.
const { startServer } = await import('./bootstrap');
const { getLogger } = await import('./logging/logger');

try {
  await startServer();
} catch (error) {
  getLogger().fatal({ err: error }, 'Failed to start API');
  process.exit(1);
}
