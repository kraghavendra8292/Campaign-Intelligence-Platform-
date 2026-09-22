import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authService, type MobileViewer } from './authService';

/**
 * Mobile authentication state.
 *
 * As on web, this drives what is rendered and nothing else: the API authorises
 * every request independently, so tampering with this state changes only what
 * the device draws.
 */

type Status = 'initialising' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  viewer: MobileViewer | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('initialising');
  const [viewer, setViewer] = useState<MobileViewer | null>(null);

  // Restores a session from the keystore on launch.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const restored = await authService.restoreSession();
      if (cancelled) return;

      setViewer(restored);
      setStatus(restored ? 'authenticated' : 'anonymous');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await authService.signIn(email, password);
    setViewer(next);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setViewer(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, viewer, signIn, signOut }),
    [status, viewer, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
