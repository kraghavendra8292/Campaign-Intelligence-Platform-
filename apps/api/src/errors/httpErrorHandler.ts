import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, toAppError } from './AppError';
import { getLogger } from '../logging/logger';

/** Terminal 404 handler for unmatched REST routes. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`No route matches ${req.method} ${req.path}.`));
};

/**
 * Centralised Express error handler.
 *
 * The full error (including stack and cause) is written to the server log; the
 * client receives only the sanitised payload plus a correlation id it can quote
 * to support.
 */
export const httpErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = normalize(error);
  const correlationId = req.correlationId;
  const log = req.log ?? getLogger();

  const logPayload = {
    err: error,
    code: appError.code,
    status: appError.status,
    method: req.method,
    path: req.path,
  };

  if (appError.status >= 500) {
    log.error(logPayload, 'Request failed');
  } else {
    log.warn(logPayload, 'Request rejected');
  }

  // Express may have already begun streaming; delegating avoids a double send.
  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(appError.status).json({ error: appError.toPayload(correlationId) });
};

/**
 * Recognises the body-parser and Express failures that should surface as
 * deliberate 4xx responses rather than as opaque 500s.
 */
function normalize(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (typeof error === 'object' && error !== null && 'type' in error) {
    const bodyParserType = (error as { type?: string }).type;

    if (bodyParserType === 'entity.too.large') {
      return new AppError('PAYLOAD_TOO_LARGE', 'Request body exceeds the maximum allowed size.', {
        cause: error,
      });
    }

    if (bodyParserType === 'entity.parse.failed') {
      return AppError.badRequest('Request body is not valid JSON.', { cause: error });
    }
  }

  return toAppError(error);
}
