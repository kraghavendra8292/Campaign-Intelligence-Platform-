import { env } from '../../config/env';
import { credentialStorage, STORAGE_KEYS } from './secureStorage';

/**
 * Mobile authentication transport.
 *
 * Differs from the web client in exactly one respect, and for a concrete
 * reason: a native app has no cookie jar, so it requests `tokenDelivery: BODY`
 * and stores the refresh token itself - in the platform keystore, never in
 * AsyncStorage. The access token stays in memory only, as on web.
 */

export interface MobileViewer {
  user: { id: string; email: string; fullName: string; status: string };
  organization: { id: string; name: string } | null;
  roles: string[];
  permissions: string[];
  isPlatformAdmin: boolean;
}

export class MobileApiError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'MobileApiError';
    this.code = code;
  }
}

let accessToken: string | null = null;

interface GraphQLBody<TData> {
  data?: TData;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

async function request<TData>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<TData> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new MobileApiError('Unable to reach the server.', 'NETWORK_ERROR');
  }

  const body = (await response.json()) as GraphQLBody<TData>;
  const first = body.errors?.[0];

  if (first) {
    throw new MobileApiError(first.message, first.extensions?.code ?? 'INTERNAL_SERVER_ERROR');
  }

  if (body.data === undefined) {
    throw new MobileApiError('Unexpected response from the server.', 'INTERNAL_SERVER_ERROR');
  }

  return body.data;
}

const VIEWER_FIELDS = `
  user { id email fullName status }
  organization { id name }
  roles
  permissions
  isPlatformAdmin
`;

const LOGIN = `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      viewer { ${VIEWER_FIELDS} }
    }
  }
`;

const REFRESH = `
  mutation Refresh($input: RefreshTokenInput) {
    refreshToken(input: $input) {
      accessToken
      refreshToken
    }
  }
`;

const ME = `query Me { me { ${VIEWER_FIELDS} } }`;

const LOGOUT = `mutation Logout { logout { success } }`;

export const authService = {
  async signIn(email: string, password: string): Promise<MobileViewer> {
    const data = await request<{
      login: { accessToken: string; refreshToken: string; viewer: MobileViewer };
    }>(LOGIN, { input: { email, password, tokenDelivery: 'BODY' } });

    accessToken = data.login.accessToken;
    await credentialStorage.set(STORAGE_KEYS.refreshToken, data.login.refreshToken);

    return data.login.viewer;
  },

  /**
   * Restores a session at app launch.
   *
   * Rotation means the stored token is single-use, so the newly issued one must
   * be written back before the next launch - otherwise the app logs itself out.
   */
  async restoreSession(): Promise<MobileViewer | null> {
    const stored = await credentialStorage.get(STORAGE_KEYS.refreshToken);
    if (!stored) return null;

    try {
      const data = await request<{
        refreshToken: { accessToken: string; refreshToken: string };
      }>(REFRESH, { input: { refreshToken: stored, tokenDelivery: 'BODY' } });

      accessToken = data.refreshToken.accessToken;
      await credentialStorage.set(STORAGE_KEYS.refreshToken, data.refreshToken.refreshToken);

      const viewer = await request<{ me: MobileViewer | null }>(ME);
      return viewer.me;
    } catch {
      // The stored credential is spent, revoked or expired: discard it so the
      // app does not retry a token that can never succeed.
      await credentialStorage.remove(STORAGE_KEYS.refreshToken);
      accessToken = null;
      return null;
    }
  },

  async signOut(): Promise<void> {
    try {
      if (accessToken) await request(LOGOUT);
    } catch {
      // The user asked to leave; local credentials are cleared regardless.
    } finally {
      accessToken = null;
      await credentialStorage.remove(STORAGE_KEYS.refreshToken);
    }
  },

  getAccessToken(): string | null {
    return accessToken;
  },
};
