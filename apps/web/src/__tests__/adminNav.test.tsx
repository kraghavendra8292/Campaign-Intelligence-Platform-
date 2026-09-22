import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { ADMIN_NAV } from '../config/adminNav';
import { translateAdmin } from '../i18n/adminStrings';

/**
 * Campaign console navigation.
 *
 * Two things are worth asserting and one is not. The GROUPING is a design
 * decision that will keep changing, so it is not pinned here. What must not
 * change silently is the set of DESTINATIONS - regrouping a sidebar is exactly
 * the kind of edit that quietly loses a route - and the drawer's behaviour on
 * a phone, which the public site already got wrong once.
 */

const VIEWER = {
  user: { id: 'u1', email: 'admin@example.test', fullName: 'Admin', status: 'ACTIVE' },
  organization: { id: 'org1', name: 'Demo Org', slug: 'demo-org' },
  roles: ['CAMPAIGN_ADMIN'],
  permissions: ['USER_READ', 'PROFILE_READ'],
  isPlatformAdmin: false,
  memberships: [],
};

/** Answers the session exchange so `ProtectedRoute` lets the console render. */
function stubSignedIn() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { query: string };
      const respond = (payload: unknown) =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      if (body.query.includes('mutation Refresh')) {
        return respond({ data: { refreshToken: { accessToken: 'token', expiresIn: 900 } } });
      }
      if (body.query.includes('query Me')) return respond({ data: { me: VIEWER } });
      return respond({ data: {} });
    }),
  );
}

/**
 * Pretends the viewport is narrower than the sidebar's desktop breakpoint.
 *
 * jsdom implements no `matchMedia` at all, and the component deliberately
 * treats that absence as "desktop" so a missing API can never leave the whole
 * navigation inert. Simulating a phone therefore means supplying the API.
 */
function stubViewport({ desktop }: { desktop: boolean }) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

async function renderConsole() {
  stubSignedIn();
  const router = createMemoryRouter(routes, { initialEntries: ['/admin'] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  await screen.findByRole('heading', { name: /Campaign console/i, level: 1 });
}

function sidebar() {
  return document.getElementById('admin-sidebar') as HTMLElement;
}

describe('console navigation - destinations', () => {
  it('still links to every route the flat sidebar had', async () => {
    await renderConsole();

    /*
     * The regrouping moved eighteen links between six groups; Phase 10 added a
     * nineteenth, /admin/system, in its own Operations group. This asserts the
     * set of hrefs matches the nav definition exactly, which is the property
     * that regrouping is most likely to break and the one a visual review is
     * least likely to catch.
     *
     * The literal count is deliberate rather than derived: asserting
     * `expected.length === hrefs.length` would pass even if a link were dropped
     * from BOTH the nav and the sidebar at once. Update it when a route is
     * added on purpose.
     */
    const hrefs = Array.from(sidebar().querySelectorAll('a[href^="/admin"]')).map((a) =>
      a.getAttribute('href'),
    );

    const expected = ADMIN_NAV.flatMap((group) => group.items.map((item) => item.to));
    expect(expected).toHaveLength(19);
    expect(new Set(hrefs)).toEqual(new Set(expected));
  });

  it('labels every group as a heading', async () => {
    await renderConsole();

    for (const group of ADMIN_NAV) {
      // A heading rather than a styled paragraph, so the groups are navigable
      // structure rather than decoration.
      expect(
        within(sidebar()).getByRole('heading', { level: 2, name: groupName(group) }),
      ).toBeInTheDocument();
    }
  });

  it('marks the current page, and only the current page', async () => {
    await renderConsole();

    const active = sidebar().querySelectorAll('.admin-nav__link--active');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('href', '/admin');
  });
});

describe('console navigation - drawer on a phone', () => {
  it('starts closed', async () => {
    stubViewport({ desktop: false });
    await renderConsole();

    expect(sidebar()).toHaveAttribute('data-open', 'false');
    expect(screen.getByRole('button', { name: /open navigation/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('opens from the toggle and closes again from the close button', async () => {
    stubViewport({ desktop: false });
    await renderConsole();

    const toggle = screen.getByRole('button', { name: /open navigation/i });
    await userEvent.click(toggle);
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-open', 'true'));

    await userEvent.click(within(sidebar()).getByRole('button', { name: /close navigation/i }));
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-open', 'false'));

    // The keyboard must come back to where it was, not to the top of the page.
    expect(document.activeElement).toBe(toggle);
  });

  it('closes on Escape', async () => {
    stubViewport({ desktop: false });
    await renderConsole();

    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-open', 'true'));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-open', 'false'));
  });

  it('closes when the area beside the panel is clicked', async () => {
    stubViewport({ desktop: false });
    await renderConsole();

    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-open', 'true'));

    await userEvent.click(sidebar().querySelector('.admin-sidebar__scrim') as HTMLElement);
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-open', 'false'));
  });

  it('closes when a destination is chosen', async () => {
    stubViewport({ desktop: false });
    await renderConsole();

    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-open', 'true'));

    await userEvent.click(within(sidebar()).getByRole('link', { name: /Projects/i }));
    await waitFor(() => expect(sidebar()).toHaveAttribute('data-open', 'false'));
  });

  it('is unreachable while closed, rather than merely invisible', async () => {
    stubViewport({ desktop: false });
    await renderConsole();

    // `inert` plus `aria-hidden`: a closed drawer must not be tabbable or
    // announced, or the keyboard walks into a panel nobody can see.
    expect(sidebar()).toHaveAttribute('inert');
    expect(sidebar()).toHaveAttribute('aria-hidden', 'true');
  });

  it('is a permanent column on the desktop, never inert', async () => {
    stubViewport({ desktop: true });
    await renderConsole();

    expect(sidebar()).not.toHaveAttribute('inert');
    expect(sidebar()).not.toHaveAttribute('aria-hidden');
    /*
     * The toggle stays in the DOM and is hidden by the stylesheet from `lg` up.
     * jsdom applies no CSS, so this asserts what it can honestly assert - that
     * the control still exists - while the media query is what removes it on a
     * real desktop.
     */
    expect(screen.getByRole('button', { name: /open navigation/i })).toBeInTheDocument();
  });
});

function groupName(group: (typeof ADMIN_NAV)[number]): string {
  // Read from the dictionary rather than restated here, so the test cannot
  // drift from the labels the console actually renders.
  return translateAdmin('en', group.titleKey);
}
