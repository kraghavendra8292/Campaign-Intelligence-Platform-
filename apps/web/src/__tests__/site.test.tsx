import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { graphqlError, installGraphQLMock, type Responder } from '../test/graphqlMock';
import {
  EMPTY_HOMEPAGE,
  HOMEPAGE,
  SITE,
  WORK_DETAIL,
  WORK_DETAIL_WITH_FIGURES,
  projectsPage,
  worksPage,
} from '../test/siteFixtures';

/**
 * Phase 3 - public candidate website.
 *
 * These mount the real route tree against a stubbed API, so what is asserted is
 * what a visitor would actually see. Three things get disproportionate
 * attention, because they are the failures that would matter most on a live
 * campaign site:
 *
 *   1. Absent data is stated, never invented.
 *   2. Every page has a visible loading, empty and error state - a blank screen
 *      is a bug, not a state.
 *   3. Every public request carries the resolved tenant and locale, so no page
 *      can query the wrong site by forgetting to pass them.
 */

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

/** The shell query fires on every public page; include it by default. */
function mockSite(handlers: Record<string, Responder>) {
  return installGraphQLMock({
    Site: SITE,
    Refresh: graphqlError('UNAUTHENTICATED', 'no session'),
    ...handlers,
  });
}

describe('public site - homepage', () => {
  it('renders the hero, the shell and every populated section', async () => {
    mockSite({ Homepage: HOMEPAGE });
    renderAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' }),
    ).toBeInTheDocument();

    // Shell.
    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Primary' }).length).toBeGreaterThan(0);

    // Sections, each driven by its own slice of the single homepage query.
    expect(screen.getByRole('heading', { name: 'Our Work' })).toBeInTheDocument();
    expect(screen.getByText('Sample Road Project')).toBeInTheDocument();
    expect(screen.getByText('Sample Achievement')).toBeInTheDocument();
    expect(screen.getByText('Sample Update')).toBeInTheDocument();
    expect(screen.getByText('Sample Event')).toBeInTheDocument();
    expect(screen.getByText('Sample Priority')).toBeInTheDocument();
  });

  it('shows a loading state before the query resolves', async () => {
    // A never-settling fetch keeps the page in its loading state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderAt('/');

    // Named so the assertion cannot pass on some other live region.
    expect(await screen.findByRole('status', { name: 'Loading…' })).toBeInTheDocument();
  });

  it('degrades to a deliberate page when the tenant has published nothing', async () => {
    mockSite({ Homepage: EMPTY_HOMEPAGE });
    renderAt('/');

    // The hero still renders, falling back to the organisation name.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Demo Campaign' }),
    ).toBeInTheDocument();

    // Empty sections are omitted rather than shown as bare headings.
    expect(screen.queryByRole('heading', { name: 'Our Work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Achievements' })).not.toBeInTheDocument();
  });

  it('shows an error state with a retry when the API fails', async () => {
    mockSite({ Homepage: graphqlError('INTERNAL_SERVER_ERROR', 'Upstream failure') });
    renderAt('/');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Upstream failure');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('retries the query when the error state retry is pressed', async () => {
    const mock = mockSite({ Homepage: graphqlError('INTERNAL_SERVER_ERROR', 'Upstream failure') });
    renderAt('/');

    const alert = await screen.findByRole('alert');
    const before = mock.operations().filter((op) => op === 'Homepage').length;

    await userEvent.click(within(alert).getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(mock.operations().filter((op) => op === 'Homepage').length).toBeGreaterThan(before);
    });
  });
});

describe('public site - tenant and locale', () => {
  it('sends the resolved tenant and locale on every public request', async () => {
    const mock = mockSite({ Homepage: HOMEPAGE });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' });

    const publicCalls = mock.calls.filter((call) => call.operation !== 'Refresh');
    expect(publicCalls.length).toBeGreaterThan(0);

    for (const call of publicCalls) {
      // `organizationSlug` is null in jsdom (no ?org, no subdomain, no env
      // default) - what matters is that the field is always sent, so the API
      // resolves the tenant rather than a page guessing.
      expect(call.variables).toHaveProperty('input');
      expect(call.variables.input).toMatchObject({ locale: 'en' });
      expect(call.variables.input).toHaveProperty('organizationSlug');
    }
  });

  it('switches the interface language and re-queries in the new locale', async () => {
    const mock = mockSite({ Homepage: HOMEPAGE });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'kn');

    // UI chrome is translated...
    expect(await screen.findByText('ಮುಖ್ಯ ವಿಷಯಕ್ಕೆ ಹೋಗಿ')).toBeInTheDocument();

    // ...and content is re-fetched in Kannada, because translations are
    // separate CMS rows rather than a client-side string swap.
    await waitFor(() => {
      expect(mock.variablesFor('Homepage')).toMatchObject({ input: { locale: 'kn' } });
    });
  });
});

describe('public site - project listing', () => {
  it('renders a card grid and the result count', async () => {
    mockSite({ PublicWorks: worksPage() });
    renderAt('/work');

    expect(await screen.findByText('Sample Road Project')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument();
  });

  it('shows a specific empty state rather than a blank grid', async () => {
    mockSite({ PublicWorks: worksPage([]) });
    renderAt('/work');

    expect(await screen.findByText('No projects published yet.')).toBeInTheDocument();
  });

  it('offers "load more" only when another page exists', async () => {
    mockSite({ PublicWorks: worksPage([], false) });
    renderAt('/work');

    await screen.findByText('No projects published yet.');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('puts the search term in the URL and in the query variables', async () => {
    const mock = mockSite({ PublicWorks: worksPage() });
    renderAt('/work');

    await screen.findByText('Sample Road Project');

    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'road');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      // Filters moved inside `filter` when the page moved to `publicWorks`;
      // the URL and the server-side filtering are unchanged.
      expect(mock.variablesFor('PublicWorks')).toMatchObject({
        filter: { search: 'road' },
      });
    });
  });

  it('filters by category from the filter chips', async () => {
    const mock = mockSite({ PublicWorks: worksPage() });
    renderAt('/work');

    await screen.findByText('Sample Road Project');

    const chips = screen.getByRole('group', { name: /category/i });
    await userEvent.click(within(chips).getByRole('button', { name: 'Infrastructure' }));

    await waitFor(() => {
      expect(mock.variablesFor('PublicWorks')).toMatchObject({
        filter: { category: 'INFRASTRUCTURE' },
      });
    });
  });
});

describe('public site - project detail', () => {
  it('renders the project with its status and description', async () => {
    mockSite({ PublicWork: WORK_DETAIL });
    renderAt('/work/sample-road-project');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sample Road Project' }),
    ).toBeInTheDocument();
    // Phase 9 renamed the public label from the internal "In progress" to
    // "Ongoing", which is the vocabulary the transparency pages use throughout.
    expect(screen.getByText('Ongoing')).toBeInTheDocument();
    expect(screen.getByText('Synthetic project description.')).toBeInTheDocument();
  });

  it('states that unpublished figures are not stated, and never shows a zero', async () => {
    mockSite({ PublicWork: WORK_DETAIL });
    renderAt('/work/sample-road-project');

    await screen.findByRole('heading', { level: 1, name: 'Sample Road Project' });

    // Cost and beneficiary count are absent in this fixture.
    expect(screen.getAllByText('Not stated').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('₹0')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders figures when the campaign has actually published them', async () => {
    mockSite({ PublicWork: WORK_DETAIL_WITH_FIGURES });
    renderAt('/work/sample-road-project');

    await screen.findByRole('heading', { level: 1, name: 'Sample Road Project' });

    expect(screen.getByText('4,321')).toBeInTheDocument();
    expect(screen.getByText(/1,234,567|12,34,567/)).toBeInTheDocument();
  });

  it('shows the error state when the slug is not published', async () => {
    mockSite({ PublicWork: graphqlError('NOT_FOUND', 'Not found') });
    renderAt('/work/never-published');

    expect(await screen.findByRole('alert')).toHaveTextContent('Not found');
  });
});

describe('public site - navigation', () => {
  it('renders the not-found page for an unknown public route', async () => {
    mockSite({});
    renderAt('/no-such-page');

    expect(await screen.findByRole('heading', { name: /Page not found/i })).toBeInTheDocument();
  });

  /*
   * The drawer's contract, asserted end to end.
   *
   * The bug these guard against shipped WITH a passing test, because that test
   * only checked `aria-expanded` - a flag the broken build set correctly while
   * rendering the menu permanently open. So these assert reachability instead:
   * whether a visitor can actually get to the links, and whether they can get
   * rid of them again.
   */
  function drawer() {
    const element = document.getElementById('site-mobile-nav');
    if (!element) throw new Error('mobile navigation drawer is not mounted');
    return element.closest('.site-drawer') as HTMLElement;
  }

  /*
   * Matched on the exact name rather than a pattern: while the drawer is open
   * its own close button is named "Close menu", which a loose /menu/i would
   * also match. An exact "Menu" identifies the trigger at either state.
   */
  function toggle() {
    return screen.getByRole('button', { name: 'Menu' });
  }

  async function openMenu() {
    await userEvent.click(toggle());
    return drawer();
  }

  it('starts closed, with its links unreachable', async () => {
    mockSite({ Homepage: HOMEPAGE });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' });

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(drawer()).toHaveAttribute('data-open', 'false');

    // Hidden from the accessibility tree means hidden in practice: a role
    // query is exactly what a screen reader would and would not find.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens from the toggle and moves focus into the drawer', async () => {
    mockSite({ Homepage: HOMEPAGE });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' });
    const panel = await openMenu();

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The keyboard must land inside what just opened, not stay behind it.
    await waitFor(() => {
      expect(document.activeElement).toHaveAccessibleName(/close/i);
    });
  });

  it('closes from the close button and restores focus to the toggle', async () => {
    mockSite({ Homepage: HOMEPAGE });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' });
    const panel = await openMenu();

    await userEvent.click(within(panel).getByRole('button', { name: /close/i }));

    await waitFor(() => expect(panel).toHaveAttribute('data-open', 'false'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(toggle());
  });

  it('closes on Escape', async () => {
    mockSite({ Homepage: HOMEPAGE });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' });
    const panel = await openMenu();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(panel).toHaveAttribute('data-open', 'false'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when the area outside the panel is clicked', async () => {
    mockSite({ Homepage: HOMEPAGE });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' });
    const panel = await openMenu();

    const scrim = panel.querySelector('.site-drawer__scrim');
    await userEvent.click(scrim as HTMLElement);

    await waitFor(() => expect(panel).toHaveAttribute('data-open', 'false'));
  });

  it('closes the mobile menu when a link inside it is followed', async () => {
    mockSite({ Homepage: HOMEPAGE, Projects: projectsPage() });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' });

    const toggleButton = toggle();
    await userEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    const mobileNav = document.getElementById('site-mobile-nav');
    expect(mobileNav).not.toBeNull();
    await userEvent.click(within(mobileNav as HTMLElement).getByRole('link', { name: 'Our Work' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /menu/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });
  });

  it('offers the same destinations in the drawer as in the desktop bar', async () => {
    mockSite({ Homepage: HOMEPAGE });
    renderAt('/');

    await screen.findByRole('heading', { level: 1, name: 'A Demo Vision Headline' });
    const panel = await openMenu();

    // Every primary destination, plus the gallery the desktop bar has no room
    // for. Asserted so the two navigations cannot quietly diverge again.
    for (const label of ['Home', 'Our Work', 'Vision', 'Contact', 'Gallery']) {
      expect(within(panel).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
});
