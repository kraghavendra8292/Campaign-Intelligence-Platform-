import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import type { ErrorCode } from '@rk/types';
import { AppError, isAppError } from './AppError';
import { getLogger } from '../logging/logger';

/**
 * Formats every GraphQL error before it leaves the server.
 *
 * Responsibilities:
 *  - log the real error, with stack and cause, server-side;
 *  - replace unexpected errors with a generic client-facing message;
 *  - strip `stacktrace` that Apollo adds in non-production;
 *  - attach a stable `code` and the request `correlationId`.
 *
 * Validation, parse and persisted-query errors raised by GraphQL itself are
 * already safe and are passed through with their original message.
 */
export function formatGraphQLError(
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  const original = unwrapResolverError(error);
  const correlationId = extractCorrelationId(formatted);

  // GraphQL-level failures (bad syntax, unknown field, invalid variables) carry
  // no internal detail and help the client fix its request.
  const graphqlCode = formatted.extensions?.['code'];
  if (typeof graphqlCode === 'string' && CLIENT_SAFE_GRAPHQL_CODES.has(graphqlCode)) {
    return sanitize(formatted, {
      code: 'BAD_REQUEST',
      message: formatted.message,
      correlationId,
    });
  }

  if (isAppError(original)) {
    const payload = original.toPayload(correlationId);

    if (original.status >= 500) {
      getLogger().error({ err: original, correlationId }, 'GraphQL resolver failed');
    }

    return sanitize(formatted, {
      code: payload.code,
      message: payload.message,
      correlationId,
      ...(payload.details ? { details: payload.details } : {}),
    });
  }

  getLogger().error(
    { err: original instanceof Error ? original : new Error(String(original)), correlationId },
    'Unhandled GraphQL error',
  );

  const internal = AppError.internal();
  return sanitize(formatted, {
    code: internal.code,
    message: internal.message,
    correlationId,
  });
}

/** GraphQL request-level error codes that are safe to echo verbatim. */
const CLIENT_SAFE_GRAPHQL_CODES = new Set([
  'GRAPHQL_PARSE_FAILED',
  'GRAPHQL_VALIDATION_FAILED',
  'BAD_USER_INPUT',
  'PERSISTED_QUERY_NOT_FOUND',
  'PERSISTED_QUERY_NOT_SUPPORTED',
  'OPERATION_RESOLUTION_FAILURE',
  'BAD_REQUEST',
]);

interface SanitizedExtensions {
  code: ErrorCode | string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

/**
 * Rebuilds the outgoing error from an allow-list of fields.
 *
 * Using an allow-list rather than deleting known-bad keys means any future
 * extension added by Apollo or a plugin is excluded by default.
 */
function sanitize(
  formatted: GraphQLFormattedError,
  extensions: SanitizedExtensions,
): GraphQLFormattedError {
  const { message, correlationId, details, code } = extensions;

  return {
    message,
    ...(formatted.locations ? { locations: formatted.locations } : {}),
    ...(formatted.path ? { path: formatted.path } : {}),
    extensions: {
      code,
      ...(details ? { details } : {}),
      ...(correlationId ? { correlationId } : {}),
    },
  };
}

function extractCorrelationId(formatted: GraphQLFormattedError): string | undefined {
  const value = formatted.extensions?.['correlationId'];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Raises a client-facing GraphQL error from a resolver.
 *
 * Prefer throwing `AppError` directly; this helper exists for the rare case a
 * resolver needs to attach GraphQL-specific extensions.
 */
export function graphQLError(code: ErrorCode, message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}
