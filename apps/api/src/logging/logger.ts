import { pino, type Logger } from 'pino';
import { SENSITIVE_KEY_PATTERNS } from '@rk/utils';
import { getEnv } from '../config/env';
import { SERVICE_NAME, SERVICE_VERSION } from '../config/service';

/**
 * Paths pino redacts before anything reaches a log sink.
 *
 * Redaction is enforced at the transport rather than at each call site so that
 * an incidental `logger.info({ req })` can never leak an Authorization header,
 * a cookie or a connection string.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEY_PATTERNS.flatMap((key) => [key, `*.${key}`, `context.${key}`]),
];

function createLogger(): Logger {
  const env = getEnv();

  return pino({
    level: env.LOG_LEVEL,
    base: {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      env: env.NODE_ENV,
    },
    // ISO timestamps keep production logs sortable across aggregators.
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    formatters: {
      // Emit `level: "info"` rather than `level: 30` for readable structured logs.
      level: (label) => ({ level: label }),
    },
    ...(env.LOG_PRETTY
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname,service,version,env',
              singleLine: false,
            },
          },
        }
      : {}),
  });
}

let cached: Logger | null = null;

/**
 * The application logger.
 *
 * Never use `console.*` in the API - the ESLint config enforces this - so that
 * every line is structured, level-filtered and redacted.
 */
export function getLogger(): Logger {
  cached ??= createLogger();
  return cached;
}

/** Child logger bound to a request's correlation id. */
export function createRequestLogger(correlationId: string): Logger {
  return getLogger().child({ correlationId });
}

export type { Logger };
