import type { ApiErrorPayload, ErrorCode } from '@rk/types';

/** Maps each error code to the HTTP status used when it escapes over REST. */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export interface AppErrorOptions {
  /** Structured, non-sensitive context safe to return to the client. */
  details?: Record<string, unknown>;
  /** Underlying error, retained for server-side logs only. */
  cause?: unknown;
  /**
   * Whether the message may be shown to the client.
   *
   * Defaults to true for deliberate 4xx errors and false for 5xx, so an
   * unexpected server failure can never expose internal detail by accident.
   */
  expose?: boolean;
}

/**
 * The single error type thrown by application code.
 *
 * Carries everything both transports need: a stable machine-readable `code`,
 * an HTTP `status`, a client-safe `message` and optional `details`. Stack
 * traces and `cause` never cross the wire.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;
  public readonly expose: boolean;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    this.expose = options.expose ?? this.status < 500;

    Error.captureStackTrace?.(this, AppError);
  }

  /**
   * Renders the client-facing payload.
   *
   * Non-exposable errors are flattened to a generic message so internal
   * failures never leak driver text, file paths or configuration values.
   */
  public toPayload(correlationId?: string): ApiErrorPayload {
    return {
      code: this.code,
      message: this.expose ? this.message : 'An unexpected error occurred.',
      status: this.status,
      ...(this.expose && this.details ? { details: this.details } : {}),
      ...(correlationId ? { correlationId } : {}),
    };
  }

  static badRequest(message: string, options?: AppErrorOptions): AppError {
    return new AppError('BAD_REQUEST', message, options);
  }

  static validation(message: string, options?: AppErrorOptions): AppError {
    return new AppError('VALIDATION_ERROR', message, options);
  }

  static notFound(message = 'Resource not found.', options?: AppErrorOptions): AppError {
    return new AppError('NOT_FOUND', message, options);
  }

  /** The caller has not proven who they are. */
  static unauthenticated(
    message = 'Authentication is required.',
    options?: AppErrorOptions,
  ): AppError {
    return new AppError('UNAUTHENTICATED', message, options);
  }

  /**
   * The caller is authenticated but lacks authority.
   *
   * The default message deliberately does not name the missing permission or
   * confirm that the target exists - that would turn an authorization failure
   * into a discovery oracle for resources in other tenants.
   */
  static forbidden(message = 'You do not have permission to perform this action.'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static conflict(message: string, options?: AppErrorOptions): AppError {
    return new AppError('CONFLICT', message, options);
  }

  static rateLimited(message = 'Too many requests.', options?: AppErrorOptions): AppError {
    return new AppError('RATE_LIMITED', message, options);
  }

  static serviceUnavailable(message: string, options?: AppErrorOptions): AppError {
    return new AppError('SERVICE_UNAVAILABLE', message, options);
  }

  static internal(message = 'An unexpected error occurred.', options?: AppErrorOptions): AppError {
    return new AppError('INTERNAL_SERVER_ERROR', message, { ...options, expose: false });
  }
}

/** Narrows an unknown thrown value to `AppError`. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Converts any thrown value into an `AppError`.
 *
 * The original error is preserved as `cause` for server-side logging while the
 * client-facing message stays generic.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  return AppError.internal('An unexpected error occurred.', { cause: error });
}
