import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { LOCALES } from '@rk/types';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { adminTranslationGaps } from '../i18n/adminStrings';

/**
 * Bilingual campaign console.
 *
 * The console keeps its own interface language, separate from the public site's
 * and defaulting to English. These assert the three properties that make that
 * real rather than decorative: the dictionary is complete, the choice survives
 * navigation and reload, and switching it leaves the public site alone.
 */

const VIEWER = {
  user: { id: 'u1', email: 'admin@example.test', fullName: 'Admin', status: 'ACTIVE' },
  organization: { id: 'org1', name: 'Demo Org', slug: 'demo-org' },
  roles: ['CAMPAIGN_ADMIN'],
  permissions: ['USER_READ', 'PROFILE_READ'],
  isPlatformAdmin: false,
  memberships: [],
};

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

async function renderConsole(at = '/admin') {
  stubSignedIn();
  const router = createMemoryRouter(routes, { initialEntries: [at] });
  const view = render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  await screen.findByRole('navigation', { name: /Campaign console|ಪ್ರಚಾರ ಕನ್ಸೋಲ್/ });
  return view;
}

function languageSelect() {
  return screen.getByRole('combobox', { name: /interface language|ಇಂಟರ್‌ಫೇಸ್ ಭಾಷೆ/i });
}

function sidebar() {
  return document.getElementById('admin-sidebar') as HTMLElement;
}

describe('console dictionary', () => {
  for (const locale of LOCALES) {
    it(`has a translation for every console string in "${locale}"`, () => {
      expect(adminTranslationGaps(locale).missing).toEqual([]);
    });

    it(`keeps every placeholder intact in "${locale}"`, () => {
      expect(adminTranslationGaps(locale).placeholderMismatch).toEqual([]);
    });
  }
});

describe('console interface language', () => {
  it('opens in English, which is the console default', async () => {
    await renderConsole();

    expect(screen.getByRole('heading', { name: 'Campaign console', level: 1 })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(languageSelect()).toHaveValue('en');
  });

  it('switches the whole shell to Kannada', async () => {
    await renderConsole();

    await userEvent.selectOptions(languageSelect(), 'kn');

    // Topbar, navigation groups and navigation items - not just one label.
    expect(
      await screen.findByRole('heading', { name: 'ಪ್ರಚಾರ ಕನ್ಸೋಲ್', level: 1 }),
    ).toBeInTheDocument();
    expect(within(sidebar()).getByRole('heading', { name: 'ಅವಲೋಕನ' })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('link', { name: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್' })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('link', { name: 'ಯೋಜನೆಗಳು' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ಸೈನ್ ಔಟ್' })).toBeInTheDocument();
  });

  it('tells assistive technology which language the console is in', async () => {
    await renderConsole();
    expect(document.documentElement.lang).toBe('en');

    await userEvent.selectOptions(languageSelect(), 'kn');
    await waitFor(() => expect(document.documentElement.lang).toBe('kn'));
  });

  it('keeps the choice when moving between console pages', async () => {
    await renderConsole();
    await userEvent.selectOptions(languageSelect(), 'kn');
    await screen.findByRole('heading', { name: 'ಪ್ರಚಾರ ಕನ್ಸೋಲ್', level: 1 });

    await userEvent.click(within(sidebar()).getByRole('link', { name: 'ಯೋಜನೆಗಳು' }));

    // The language must not reset on a route change.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'ಪ್ರಚಾರ ಕನ್ಸೋಲ್', level: 1 })).toBeInTheDocument(),
    );
    expect(languageSelect()).toHaveValue('kn');
  });

  it('remembers the choice across a reload', async () => {
    const first = await renderConsole();
    await userEvent.selectOptions(languageSelect(), 'kn');
    await screen.findByRole('heading', { name: 'ಪ್ರಚಾರ ಕನ್ಸೋಲ್', level: 1 });
    first.unmount();

    // A fresh mount is what a reload looks like to the provider.
    await renderConsole();
    expect(languageSelect()).toHaveValue('kn');
  });

  it('leaves the public site out of it', async () => {
    await renderConsole();
    await userEvent.selectOptions(languageSelect(), 'kn');
    await screen.findByRole('heading', { name: 'ಪ್ರಚಾರ ಕನ್ಸೋಲ್', level: 1 });

    /*
     * The two are separate products with separate defaults. An administrator
     * reading the console in one language must not silently re-language the
     * public website, so they keep separate keys.
     */
    expect(window.localStorage.getItem('rk.admin.locale')).toBe('kn');
    expect(window.localStorage.getItem('rk.locale')).toBeNull();
  });
});
