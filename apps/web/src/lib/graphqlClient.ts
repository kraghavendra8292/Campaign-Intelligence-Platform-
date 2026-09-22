import { CORRELATION_ID_HEADER, GRAPHQL_PATH } from '@rk/config';
import type { ApiErrorPayload } from '@rk/types';
import { apiBaseUrl } from '../config/env';

/**
 * Minimal GraphQL client.
 *
 * A full client cache (Apollo, urql) is deliberately not introduced in Phase 1:
 * there is no business data to cache yet, and the choice should be made
 * against real query patterns in Phase 3. `fetch` keeps the bundle small while
 * establishing the request/error contract the rest of the app codes against.
 */

/** Error thrown for both transport failures and GraphQL-level errors. */
export class GraphQLRequestError extends Error {
  public readonly code: ApiErrorPayload['code'] | 'NETWORK_ERROR';
  public readonly correlationId?: string;

  constructor(
    message: string,
    code: ApiErrorPayload['code'] | 'NETWORK_ERROR',
    correlationId?: string,
  ) {
    super(message);
    this.name = 'GraphQLRequestError';
    this.code = code;
    this.correlationId = correlationId;
  }
}

interface GraphQLResponseBody<TData> {
  data?: TData;
  errors?: Array<{
    message: string;
    extensions?: { code?: string; correlationId?: string };
  }>;
}

export interface GraphQLRequestOptions {
  variables?: Record<string, unknown>;
  /** Allows a caller (or React) to abort an in-flight request. */
  signal?: AbortSignal;
}

/** Executes a GraphQL operation and returns its typed `data` payload. */
export async function graphqlRequest<TData>(
  query: string,
  options: GraphQLRequestOptions = {},
): Promise<TData> {
  const endpoint = `${apiBaseUrl}${GRAPHQL_PATH}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: options.variables }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    // An abort is a caller decision, not a failure to report as one.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new GraphQLRequestError('Unable to reach the API.', 'NETWORK_ERROR');
  }

  const correlationId = response.headers.get(CORRELATION_ID_HEADER) ?? undefined;

  let body: GraphQLResponseBody<TData>;
  try {
    body = (await response.json()) as GraphQLResponseBody<TData>;
  } catch {
    throw new GraphQLRequestError(
      'The API returned an unreadable response.',
      'NETWORK_ERROR',
      correlationId,
    );
  }

  if (body.errors?.length) {
    const first = body.errors[0];
    throw new GraphQLRequestError(
      first?.message ?? 'The request failed.',
      (first?.extensions?.code as ApiErrorPayload['code']) ?? 'INTERNAL_SERVER_ERROR',
      first?.extensions?.correlationId ?? correlationId,
    );
  }

  if (!response.ok || body.data === undefined) {
    throw new GraphQLRequestError(
      'The API returned an unexpected response.',
      'INTERNAL_SERVER_ERROR',
      correlationId,
    );
  }

  return body.data;
}
