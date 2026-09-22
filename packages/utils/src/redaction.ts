/**
 * Keys whose values must never reach a log sink, an error payload or an
 * analytics event. Matching is case-insensitive and substring-based so that
 * `userPassword`, `X-API-Key` and `access_token` are all caught.
 */
export const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'apikey',
  'cookie',
  'session',
  'credential',
  'connectionstring',
  'databaseurl',
  'privatekey',
  'otp',
  'pin',
  'aadhaar',
  'ssn',
] as const;

export const REDACTED = '[REDACTED]';

/** Normalises a key so `X-Api-Key`, `api_key` and `apiKey` all compare equal. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Recursively replaces sensitive values with a redaction marker.
 *
 * Applied before anything is written to logs so secrets and sensitive citizen
 * data cannot leak through incidental object logging. Depth-limited and
 * cycle-safe so a hostile or malformed object cannot hang the logger.
 */
export function redactSensitive<T>(value: T, maxDepth = 6): T {
  return redactInternal(value, maxDepth, new WeakSet()) as T;
}

function redactInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth <= 0) return '[TRUNCATED]';

  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, depth - 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactInternal(entry, depth - 1, seen);
  }
  return result;
}
