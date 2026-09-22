/**
 * Canonical machine-readable error codes shared between the API and its
 * clients. Clients should branch on `code`, never on human-readable messages.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Client-facing error envelope. Never contains stack traces or secrets. */
export interface ApiErrorPayload {
  readonly code: ErrorCode;
  readonly message: string;
  readonly status: number;
  readonly details?: Readonly<Record<string, unknown>>;
  /** Correlates a client-visible failure with server-side logs. */
  readonly correlationId?: string;
}
