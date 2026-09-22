import type { RequestHandler } from 'express';
import { CORRELATION_ID_HEADER } from '@rk/config';
import { createCorrelationId, sanitizeCorrelationId } from '@rk/utils';
import { createRequestLogger } from '../logging/logger';

/**
 * Establishes per-request context before anything else runs.
 *
 * A caller-supplied correlation id is reused when it passes validation so a
 * trace can span several services; otherwise a fresh one is generated. The id
 * is echoed in the response header and bound to a child logger, which is what
 * ties an error a user reports back to the exact server-side log lines.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const supplied = sanitizeCorrelationId(req.header(CORRELATION_ID_HEADER));
  const correlationId = supplied ?? createCorrelationId();

  req.correlationId = correlationId;
  req.log = createRequestLogger(correlationId);
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
};
