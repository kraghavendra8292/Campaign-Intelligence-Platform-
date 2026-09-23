import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Permission, RoleKey } from '@rk/types';
import {
  ApiError,
  graphqlRequest,
  organizationStore,
  refreshAccessToken,
  tokenStore,
} from './authClient';

/**
 * Client-side authentication state.
 *
 * IMPORTANT: everything here is a *convenience*, never a security control. The
 * permission list is used to decide what to render, and the API re-checks every
 * single call regardless. A user who edits this state in devtools changes what
 * their browser draws and nothing about what the server will do.
 */

export interface Viewer {
  user: { id: string; email: string; fullName: string; status: string };
  organization: { id: string; name: string; slug: string } | null;
  roles: RoleKey[];
  permissions: Permission[];
  isPlatformAdmin: boolean;
  memberships: Array<{
    id: string;
    organization: { id: string; name: string; slug: string };
    role: { key: string; name: string };
  }>;
}

type AuthStatus = 'initialising' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  viewer: Viewer | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectOrganization: (organizationId: string) => Promise<void>;
  /**
   * Restores a session from the refresh cookie.
   * Public pages skip this on boot; `/admin` and `/login` call it when needed.
   */
  ensureSession: () => Promise<boolean>;
  /** Advisory only - the API is authoritative. */
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

const VIEWER_FIELDS = /* GraphQL */ `
  user {
    id
    email
    fullName
    status
  }
  organization {
    id
    name
    slug
  }
  roles
  permissions
  isPlatformAdmin
  memberships {
    id
    organization {
      id
      name
      slug
    }
    role {
      key
      name
    }
  }
`;

const ME_QUERY = /* GraphQL */ `
  query Me { me { ${VIEWER_FIELDS} } }
`;

const LOGIN_MUTATION = /* GraphQL */ `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      viewer { ${VIEWER_FIELDS} }
    }
  }
`;

const LOGOUT_MUTATION = /* GraphQL */ `
  mutation Logout {
    logout {
      success
    }
  }
`;

function needsSessionOnBoot(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname === '/login';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    typeof window !== 'undefined' && needsSessionOnBoot(window.location.pathname)
      ? 'initialising'
      : 'anonymous',
  );
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const restoreInFlight = useRef<Promise<boolean> | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  viewerRef.current = viewer;

  /**
   * Restores a session from the HttpOnly refresh cookie.
   *
   * Public pages skip this on first paint so a 2G visitor does not wait on an
   * auth round-trip they will never use. Console routes call it explicitly.
   */
  const ensureSession = useCallback(async (): Promise<boolean> => {
    if (tokenStore.get() && viewerRef.current) {
      setStatus('authenticated');
      return true;
    }

    if (restoreInFlight.current) {
      return restoreInFlight.current;
    }

    setStatus('initialising');

    restoreInFlight.current = (async () => {
      try {
        const refreshed = await refreshAccessToken();

        if (!refreshed) {
          setStatus('anonymous');
          return false;
        }

        const data = await graphqlRequest<{ me: Viewer | null }>(ME_QUERY);

        if (data.me) {
          applyViewer(data.me);
          setViewer(data.me);
          setStatus('authenticated');
          return true;
        }

        setStatus('anonymous');
        return false;
      } catch {
        setStatus('anonymous');
        return false;
      } finally {
        restoreInFlight.current = null;
      }
    })();

    return restoreInFlight.current;
  }, []);

  useEffect(() => {
    if (needsSessionOnBoot(window.location.pathname)) {
      void ensureSession();
    }
  }, [ensureSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await graphqlRequest<{
      login: { accessToken: string; viewer: Viewer };
    }>(LOGIN_MUTATION, {
      // COOKIE delivery: the refresh token never enters JavaScript.
      variables: { input: { email, password, tokenDelivery: 'COOKIE' } },
      skipAuthRetry: true,
    });

    tokenStore.set(data.login.accessToken);
    applyViewer(data.login.viewer);
    setViewer(data.login.viewer);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await graphqlRequest(LOGOUT_MUTATION, { skipAuthRetry: true });
    } catch {
      // A failed logout must still clear local state: the user asked to leave,
      // and the server-side session is revoked on its next validation anyway.
    } finally {
      tokenStore.clear();
      setViewer(null);
      setStatus('anonymous');
    }
  }, []);

  /** Switches the active tenant for a user who belongs to several. */
  const selectOrganization = useCallback(async (organizationId: string) => {
    organizationStore.set(organizationId);
    const data = await graphqlRequest<{ me: Viewer | null }>(ME_QUERY);
    if (data.me) setViewer(data.me);
  }, []);

  const can = useCallback(
    (permission: Permission) => viewer?.permissions.includes(permission) ?? false,
    [viewer],
  );

  const value = useMemo<AuthState>(
    () => ({ status, viewer, signIn, signOut, selectOrganization, ensureSession, can }),
    [status, viewer, signIn, signOut, selectOrganization, ensureSession, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Sets the tenant header for subsequent requests when it is unambiguous. */
function applyViewer(next: Viewer): void {
  if (next.organization) {
    organizationStore.set(next.organization.id);
  } else if (next.memberships.length === 1) {
    organizationStore.set(next.memberships[0]?.organization.id ?? null);
  }
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}

export { ApiError };
