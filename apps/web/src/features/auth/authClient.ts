import { CORRELATION_ID_HEADER, GRAPHQL_PATH, TENANT_HEADER } from '@rk/config';
import type { ApiErrorPayload } from '@rk/types';
import { apiBaseUrl } from '../../config/env';

/**
 * Authenticated GraphQL transport.
 *
 * Token handling policy, and why:
 *
 *  - The ACCESS token is held in memory only (see `tokenStore`). Not
 *    localStorage: anything readable by JavaScript is readable by any XSS that
 *    executes on the page, and a token in memory dies with the tab.
 *  - The REFRESH token is never touched by this code at all. It lives in an
 *    HttpOnly cookie the browser attaches automatically, which is why
 *    `credentials: 'include'` is set and why there is no refresh token variable
 *    anywhere in the web app.
 *
 * The cost is that a page reload starts with no access token - which is why
 * bootstrapping calls `refresh()` first.
 */

/** In-memory access token. Deliberately not persisted anywhere. */
let accessToken: string | null = null;
let activeOrganizationId: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
    activeOrganizationId = null;
  },
};

export const organizationStore = {
  get: () => activeOrganizationId,
  set: (id: string | null) => {
    activeOrganizationId = id;
  },
};

export class ApiError extends Error {
  readonly code: ApiErrorPayload['code'] | 'NETWORK_ERROR';
  readonly correlationId?: string;
  /**
   * Structured, non-sensitive context from the API - notably `field`, which
   * lets a form highlight the input that failed rather than only showing a
   * banner the user has to interpret.
   */
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ApiErrorPayload['code'] | 'NETWORK_ERROR',
    correlationId?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    if (correlationId) this.correlationId = correlationId;
    if (details) this.details = details;
  }
}

interface GraphQLBody<TData> {
  data?: TData;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
      correlationId?: string;
      details?: Record<string, unknown>;
    };
  }>;
}

interface RequestOptions {
  variables?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Skips the refresh-and-retry cycle, so refreshing cannot recurse. */
  skipAuthRetry?: boolean;
}

async function execute<TData>(query: string, options: RequestOptions = {}): Promise<TData> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (activeOrganizationId) headers[TENANT_HEADER] = activeOrganizationId;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${GRAPHQL_PATH}`, {
      method: 'POST',
      headers,
      // Sends the HttpOnly refresh cookie. Required for login and refresh.
      credentials: 'include',
      body: JSON.stringify({ query, variables: options.variables }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Unable to reach the API.', 'NETWORK_ERROR');
  }

  const correlationId = response.headers.get(CORRELATION_ID_HEADER) ?? undefined;

  let body: GraphQLBody<TData>;
  try {
    body = (await response.json()) as GraphQLBody<TData>;
  } catch {
    throw new ApiError('The API returned an unreadable response.', 'NETWORK_ERROR', correlationId);
  }

  const first = body.errors?.[0];

  if (first) {
    const code = (first.extensions?.code ?? 'INTERNAL_SERVER_ERROR') as ApiErrorPayload['code'];

    // The access token has expired: rotate once, then replay the original
    // request. Guarded by `skipAuthRetry` so a failing refresh cannot loop.
    if (code === 'UNAUTHENTICATED' && !options.skipAuthRetry && accessToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return execute<TData>(query, { ...options, skipAuthRetry: true });
      }
    }

    throw new ApiError(
      first.message,
      code,
      first.extensions?.correlationId ?? correlationId,
      first.extensions?.details,
    );
  }

  if (body.data === undefined) {
    throw new ApiError('The API returned an unexpected response.', 'INTERNAL_SERVER_ERROR');
  }

  return body.data;
}

export function graphqlRequest<TData>(query: string, options?: RequestOptions): Promise<TData> {
  return execute<TData>(query, options);
}

const REFRESH_MUTATION = /* GraphQL */ `
  mutation Refresh {
    refreshToken {
      accessToken
      expiresIn
    }
  }
`;

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * Returns false rather than throwing: "not signed in" is an ordinary state at
 * application start, not an error to surface.
 */
export async function refreshAccessToken(): Promise<boolean> {
  try {
    const data = await execute<{ refreshToken: { accessToken: string } }>(REFRESH_MUTATION, {
      skipAuthRetry: true,
    });
    tokenStore.set(data.refreshToken.accessToken);
    return true;
  } catch {
    tokenStore.set(null);
    return false;
  }
}
