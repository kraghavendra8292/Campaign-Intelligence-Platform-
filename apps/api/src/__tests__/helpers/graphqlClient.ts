import request from 'supertest';
import type { Express } from 'express';
import { GRAPHQL_PATH, TENANT_HEADER } from '@rk/config';

/**
 * Thin GraphQL client over supertest.
 *
 * Tests drive the API through the real HTTP + GraphQL stack rather than calling
 * resolvers directly. That matters here: middleware, context construction and
 * cookie handling are part of what enforces authentication, so a test that
 * bypassed them would not be testing the thing that protects production.
 */

export interface GraphQLCallOptions {
  readonly accessToken?: string | null;
  /** Raw tenant header value. Tests pass forged ids here on purpose. */
  readonly organizationId?: string | null;
  readonly campaignId?: string | null;
  readonly cookie?: string | null;
  readonly origin?: string | null;
}

export interface GraphQLCallResult<TData = Record<string, unknown>> {
  readonly status: number;
  readonly data: TData | null;
  readonly errors: Array<{ message: string; extensions?: { code?: string } }> | null;
  readonly setCookie: string[];
  /** The first error code, for concise assertions. */
  readonly errorCode: string | null;
}

export async function gql<TData = Record<string, unknown>>(
  app: Express,
  query: string,
  variables: Record<string, unknown> = {},
  options: GraphQLCallOptions = {},
): Promise<GraphQLCallResult<TData>> {
  let call = request(app)
    .post(GRAPHQL_PATH)
    .set('Content-Type', 'application/json')
    .set('Origin', options.origin ?? 'http://localhost:5173');

  if (options.accessToken) call = call.set('Authorization', `Bearer ${options.accessToken}`);
  if (options.organizationId) call = call.set(TENANT_HEADER, options.organizationId);
  if (options.campaignId) call = call.set('x-campaign-id', options.campaignId);
  if (options.cookie) call = call.set('Cookie', options.cookie);

  const response = await call.send({ query, variables });
  const body = response.body as {
    data?: TData;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };

  const rawSetCookie = response.headers['set-cookie'];
  const setCookie = Array.isArray(rawSetCookie)
    ? rawSetCookie
    : typeof rawSetCookie === 'string'
      ? [rawSetCookie]
      : [];

  return {
    status: response.status,
    data: body.data ?? null,
    errors: body.errors ?? null,
    setCookie,
    errorCode: body.errors?.[0]?.extensions?.code ?? null,
  };
}

const LOGIN_MUTATION = /* GraphQL */ `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      expiresIn
      viewer {
        user {
          id
          email
        }
        roles
        permissions
        isPlatformAdmin
      }
    }
  }
`;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
  roles: string[];
  permissions: string[];
}

/** Signs in with BODY delivery so the refresh token is testable directly. */
export async function login(app: Express, email: string, password: string): Promise<LoginResult> {
  const result = await gql<{
    login: {
      accessToken: string;
      refreshToken: string;
      viewer: { user: { id: string }; roles: string[]; permissions: string[] };
    };
  }>(app, LOGIN_MUTATION, { input: { email, password, tokenDelivery: 'BODY' } });

  if (!result.data?.login) {
    throw new Error(`Login failed: ${JSON.stringify(result.errors)}`);
  }

  return {
    accessToken: result.data.login.accessToken,
    refreshToken: result.data.login.refreshToken,
    userId: result.data.login.viewer.user.id,
    roles: result.data.login.viewer.roles,
    permissions: result.data.login.viewer.permissions,
  };
}

export { LOGIN_MUTATION };
