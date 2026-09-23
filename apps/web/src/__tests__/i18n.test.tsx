import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { LOCALES } from '@rk/types';
import { translationGaps } from '../i18n/strings';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { graphqlError, installGraphQLMock } from '../test/graphqlMock';
import { HOMEPAGE, SITE } from '../test/siteFixtures';
import { webEnvSchema } from '../config/env';

/**
 * Translation completeness.
 *
 * This site is Kannada-first, so an untranslated key is a defect rather than a
 * graceful fallback: it renders as an English word in the middle of a Kannada
 * page, which is precisely how the interface used to look. Asserting it here
 * means a new string cannot be added in English alone without the suite saying
 * so, naming the key.
 */
describe('i18n', () => {
  for (const locale of LOCALES) {
    it(`has a translation for every UI string in "${locale}"`, () => {
      expect(translationGaps(locale).missing).toEqual([]);
    });

    it(`keeps every placeholder intact in "${locale}"`, () => {
      // A translation that loses {term} or {count} renders a sentence with a
      // hole in it - worse than an untranslated one, because it still looks
      // deliberate.
      expect(translationGaps(locale).placeholderMismatch).toEqual([]);
    });
  }
});

describe('Kannada-first default', () => {
  it('ships Kannada as the default language of the public site', () => {
    /*
     * Asserted against the SCHEMA, not the running config: the suite itself
     * sets VITE_DEFAULT_LOCALE=en (see vite.config.ts) so English assertions
     * elsewhere are explicit. What matters here is the default a deployment
     * gets when it sets nothing, and that is Kannada.
     */
    expect(webEnvSchema.parse({}).VITE_DEFAULT_LOCALE).toBe('kn');
  });

  it('renders the homepage chrome in Kannada, not just the navigation', async () => {
    installGraphQLMock({
      Site: SITE,
      Homepage: HOMEPAGE,
      Refresh: graphqlError('UNAUTHENTICATED', 'no session'),
    });

    render(
      <AuthProvider>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
      </AuthProvider>,
    );

    await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'kn');

    // The labels that used to sit in English on a Kannada page.
    expect(await screen.findByText('ಮುಖ್ಯ ವಿಷಯಕ್ಕೆ ಹೋಗಿ')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ನಮ್ಮ ಕಾರ್ಯಗಳು' })).toBeInTheDocument();
    // Scoped to the cards: several of these labels also appear in the
    // navigation, which is itself proof the translation reaches both.
    const quickActions = within(document.querySelector('.quick-actions') as HTMLElement);
    expect(quickActions.getByText('ಅಭಿವೃದ್ಧಿ ಯೋಜನೆಗಳು')).toBeInTheDocument();
    expect(quickActions.getByText('ಸಾಧನೆಗಳು')).toBeInTheDocument();
    expect(quickActions.getByText('ಸುದ್ದಿಗಳು')).toBeInTheDocument();
    expect(quickActions.getByText('ಕಾರ್ಯಕ್ರಮಗಳು')).toBeInTheDocument();
    expect(quickActions.getByText('ಸಮಸ್ಯೆ ವರದಿ ಮಾಡಿ')).toBeInTheDocument();

    // And the document says so, which is what selects Kannada type metrics and
    // tells a screen reader how to pronounce the page.
    await waitFor(() => expect(document.documentElement.lang).toBe('kn'));
  });
});
