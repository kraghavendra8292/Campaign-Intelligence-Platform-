import { randomUUID } from 'node:crypto';

/**
 * Generates a correlation identifier used to tie together every log line,
 * GraphQL error and HTTP response belonging to a single inbound request.
 */
export function createCorrelationId(): string {
  return randomUUID();
}

/**
 * Untrusted correlation ids are length-capped and restricted to an unambiguous
 * character set so a client cannot inject newlines into log output or smuggle
 * unbounded data into every log line.
 */
const SAFE_CORRELATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Accepts a caller-supplied correlation id only when it is safe to echo back
 * into logs and response headers. Returns `null` for anything else.
 */
export function sanitizeCorrelationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return SAFE_CORRELATION_ID.test(value) ? value : null;
}
