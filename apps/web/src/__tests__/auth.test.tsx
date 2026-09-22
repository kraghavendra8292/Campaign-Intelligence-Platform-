import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { tokenStore } from '../features/auth/authClient';

/**
 * Front-end authentication behaviour.
 *
 * The API is stubbed at `fetch`, so these assert what the UI does with a given
 * server response - not whether the server is correct, which is covered by the
 * API's own integration and security suites.
 */

interface StubOptions {
  /** Whether the refresh cookie exchange succeeds on load. */
  refreshSucceeds?: boolean;
  /**
   * The viewer the API returns. `null` is meaningful (signed out), so presence
   * is detected with `in` rather than `??`, which would collapse null into the
   * default.
   */
  viewer?: unknown;
  loginError?: { message: string; code: string };
}

const VIEWER = {
  user: { id: 'u1', email: 'admin@example.test', fullName: 'Admin', status: 'ACTIVE' },
  organization: { id: 'org1', name: 'Demo Org', slug: 'demo-org' },
  roles: ['CAMPAIGN_ADMIN'],
  permissions: ['USER_READ', 'PROFILE_READ'],
  isPlatformAdmin: false,
  memberships: [
    {
      id: 'm1',
      organization: { id: 'org1', name: 'Demo Org', slug: 'demo-org' },
      role: { key: 'CAMPAIGN_ADMIN', name: 'Campaign Admin' },
    },
  ],
};

/** Routes GraphQL operations by name, the way the real server would. */
function stubApi(options: StubOptions = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { query: string };

    const respond = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    if (body.query.includes('mutation Refresh')) {
      return options.refreshSucceeds
        ? respond({ data: { refreshToken: { accessToken: 'access-token-1', expiresIn: 900 } } })
        : respond({
            errors: [{ message: 'Session expired.', extensions: { code: 'UNAUTHENTICATED' } }],
          });
    }

    if (body.query.includes('mutation Login')) {
      if (options.loginError) {
        return respond({
          errors: [
            {
              message: options.loginError.message,
              extensions: { code: options.loginError.code },
            },
          ],
        });
      }
      return respond({
        data: {
          login: {
            accessToken: 'access-token-1',
            viewer: 'viewer' in options ? options.viewer : VIEWER,
          },
        },
      });
    }

    if (body.query.includes('mutation Logout')) {
      return respond({ data: { logout: { success: true } } });
    }

    if (body.query.includes('query Me')) {
      return respond({ data: { me: 'viewer' in options ? options.viewer : VIEWER } });
    }

    return respond({ data: {} });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  tokenStore.clear();
});

describe('protected routes', () => {
  it('redirects an anonymous visitor from /admin to the login page', async () => {
    stubApi({ refreshSucceeds: false });
    renderAt('/admin');

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Campaign console/i })).not.toBeInTheDocument();
  });

  it('renders the console for a restored session', async () => {
    stubApi({ refreshSucceeds: true });
    renderAt('/admin');

    expect(
      await screen.findByRole('heading', { name: /Campaign console/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('admin@example.test')).toBeInTheDocument();
  });

  it('shows a loading state while the session is being checked', () => {
    stubApi({ refreshSucceeds: true });
    renderAt('/admin');

    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
  });
});

describe('login', () => {
  it('signs in and lands on the console', async () => {
    stubApi({ refreshSucceeds: false });
    renderAt('/login');

    await userEvent.type(await screen.findByLabelText(/email/i), 'admin@example.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-password-1234');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByRole('heading', { name: /Campaign console/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it('surfaces the generic credential error without revealing more', async () => {
    stubApi({
      refreshSucceeds: false,
      loginError: { message: 'Invalid email or password.', code: 'UNAUTHENTICATED' },
    });
    renderAt('/login');

    await userEvent.type(await screen.findByLabelText(/email/i), 'admin@example.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid email or password.');
    // Nothing in the UI should hint at which half was wrong.
    expect(alert).not.toHaveTextContent(/no such user|unknown email|account/i);
  });

  it('sends cookie delivery so the refresh token never enters JavaScript', async () => {
    const fetchMock = stubApi({ refreshSucceeds: false });
    renderAt('/login');

    await userEvent.type(await screen.findByLabelText(/email/i), 'admin@example.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-password-1234');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      const loginCall = fetchMock.mock.calls.find((call) =>
        String((call[1] as RequestInit).body).includes('mutation Login'),
      );
      expect(loginCall).toBeDefined();
      expect(String((loginCall?.[1] as RequestInit).body)).toContain('COOKIE');
      expect((loginCall?.[1] as RequestInit).credentials).toBe('include');
    });
  });

  it('never writes a token to localStorage', async () => {
    stubApi({ refreshSucceeds: false });
    renderAt('/login');

    await userEvent.type(await screen.findByLabelText(/email/i), 'admin@example.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-password-1234');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(tokenStore.get()).toBe('access-token-1'));

    const stored = Object.keys(window.localStorage);
    expect(stored).toHaveLength(0);
  });
});

describe('logout', () => {
  it('clears the session and returns to the login page', async () => {
    stubApi({ refreshSucceeds: true });
    renderAt('/admin');

    await screen.findByRole('heading', { name: /Campaign console/i, level: 1 });
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
  });
});

describe('session expiry', () => {
  it('treats a failed refresh as signed out rather than crashing', async () => {
    stubApi({ refreshSucceeds: false });
    renderAt('/admin');

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('treats a null viewer as signed out', async () => {
    stubApi({ refreshSucceeds: true, viewer: null });
    renderAt('/admin');

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
