import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { ApiHealthCard } from '../features/health/ApiHealthCard';
import { graphqlError, installGraphQLMock } from '../test/graphqlMock';
import { HOMEPAGE, SITE } from '../test/siteFixtures';

/**
 * Route-tree wiring.
 *
 * This file asserts that the three trees described in `routes.tsx` mount the
 * right shell for a given URL - the public site, the login screen and the
 * guarded admin console. What each page renders is covered by `site.test.tsx`
 * and `cms.test.tsx`; what is proven here is only that the URL reaches it.
 *
 * Phase 3 moved the landing page: `/` was the Phase 1 foundation page and is
 * now the public candidate site, and the API health card moved with the rest of
 * the operator tooling onto the admin overview. The health assertions therefore
 * target the card directly rather than a URL that no longer shows it.
 */

/**
 * Mounts the real route tree in a memory router.
 *
 * `AuthProvider` is included because the route guard depends on it, exactly as
 * in `App.tsx` - rendering the routes without it would only prove that the
 * guard throws when misconfigured.
 */
function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

const NO_SESSION = graphqlError('UNAUTHENTICATED', 'no session');

describe('App routes', () => {
  it('mounts the public site shell at the root', async () => {
    installGraphQLMock({ Refresh: NO_SESSION, Site: SITE, Homepage: HOMEPAGE });
    renderAt('/');

    expect(await screen.findByText('Skip to main content')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /J\. N\. Ganesh, MLA, Kampli Constituency/i }),
    ).toBeInTheDocument();
  });

  it('redirects /admin to the login page when unauthenticated', async () => {
    // Phase 2 put /admin behind a route guard. An anonymous visitor now lands
    // on the login screen instead of an empty console shell.
    installGraphQLMock({ Refresh: NO_SESSION });
    renderAt('/admin');

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders the login page at /login outside the site shell', async () => {
    installGraphQLMock({ Refresh: NO_SESSION });
    renderAt('/login');

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    // The public header must not wrap the login screen.
    expect(screen.queryByText('Skip to main content')).not.toBeInTheDocument();
  });

  it('renders the not-found page for an unknown public route', async () => {
    installGraphQLMock({ Refresh: NO_SESSION, Site: SITE });
    renderAt('/no-such-page');

    expect(await screen.findByRole('heading', { name: /Page not found/i })).toBeInTheDocument();
  });
});

describe('API health card', () => {
  it('shows the health result once the query resolves', async () => {
    installGraphQLMock({ Health: { health: 'OK' } });
    render(<ApiHealthCard />);

    await waitFor(() => {
      expect(screen.getByText('OK')).toBeInTheDocument();
    });
    expect(screen.getByText(/reached the GraphQL API successfully/i)).toBeInTheDocument();
  });

  it('shows a safe error state when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    render(<ApiHealthCard />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the API/i);
  });
});
