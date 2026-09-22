import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { graphqlError, installGraphQLMock, type Responder } from '../test/graphqlMock';
import {
  SITE,
  WORK_CARD,
  TRANSPARENCY,
  TRANSPARENCY_EMPTY,
  WORK_DETAIL,
  WORK_DETAIL_WITH_EVIDENCE,
  worksPage,
} from '../test/siteFixtures';

/**
 * Phase 9 - verified work, evidence and public transparency.
 *
 * What these protect is the READING of the page rather than its plumbing. The
 * server can be perfectly correct and the product still mislead somebody, if a
 * proposed road looks like a finished one on a phone or a badge implies an
 * audit nobody performed. So the assertions are about what a visitor is
 * actually told:
 *
 *   1. An unverified claim carries NO badge - absence is the honest rendering.
 *   2. A verified badge never claims outside authority.
 *   3. Proposed and ongoing work are never labelled completed.
 *   4. Evidence is grouped as before / during / after only where somebody
 *      classified it that way.
 *   5. A figure nobody published renders as "not stated", never as zero.
 */

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

function mockSite(handlers: Record<string, Responder>) {
  return installGraphQLMock({
    Site: SITE,
    Refresh: graphqlError('UNAUTHENTICATED', 'no session'),
    ...handlers,
  });
}

describe('public works listing', () => {
  it('shows no verification badge on an unverified claim', async () => {
    mockSite({ PublicWorks: worksPage() });
    renderAt('/work');

    await screen.findByText('Sample Road Project');

    // The fixture is UNVERIFIED. A grey "not verified" chip on every card would
    // make the page look audited with most of the audit saying "no".
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });

  it('shows a verification badge only where staff recorded one', async () => {
    mockSite({
      PublicWorks: worksPage([{ ...WORK_CARD, verification: 'VERIFIED' }]),
    });
    renderAt('/work');

    await screen.findByText('Sample Road Project');
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('never claims outside authority in the badge', async () => {
    mockSite({
      PublicWorks: worksPage([{ ...WORK_CARD, verification: 'VERIFIED' }]),
    });
    renderAt('/work');

    await screen.findByText('Verified');

    const body = document.body.textContent ?? '';
    // The platform has no standing to make any of these claims: a reviewer is
    // campaign staff reading documents the campaign supplied.
    expect(body).not.toMatch(/government verified/i);
    expect(body).not.toMatch(/officially confirmed/i);
    expect(body).not.toMatch(/independently audited/i);

    // What it does say, on the badge itself.
    expect(screen.getByTitle(/checked against supporting evidence/i)).toBeInTheDocument();
  });

  it('labels proposed work as proposed, never as completed', async () => {
    mockSite({
      PublicWorks: worksPage([
        {
          ...WORK_CARD,
          workStatus: 'PROPOSED',
          title: 'Planned footbridge',
        },
      ]),
    });
    renderAt('/work');

    await screen.findByText('Planned footbridge');

    // Scoped to the BADGE, not the filter chips - both carry these words, and
    // an unscoped match would pass even if the card were mislabelled.
    expect(screen.getByTitle('Planned. Work has not started.')).toHaveTextContent('Proposed');
    expect(screen.queryByTitle('Work is reported as finished.')).not.toBeInTheDocument();
  });

  it('filters by work status through the server, not in the browser', async () => {
    const mock = mockSite({ PublicWorks: worksPage() });
    renderAt('/work');

    await screen.findByText('Sample Road Project');

    const chips = screen.getByRole('group', { name: /status/i });
    await userEvent.click(within(chips).getByRole('button', { name: 'Proposed' }));

    await waitFor(() => {
      expect(mock.variablesFor('PublicWorks')).toMatchObject({
        filter: { workStatus: 'PROPOSED' },
      });
    });
  });

  it('sends the verified-only filter to the server', async () => {
    const mock = mockSite({ PublicWorks: worksPage() });
    renderAt('/work');

    await screen.findByText('Sample Road Project');
    await userEvent.click(screen.getByRole('checkbox', { name: /verified only/i }));

    await waitFor(() => {
      expect(mock.variablesFor('PublicWorks')).toMatchObject({
        filter: { verifiedOnly: true },
      });
    });
  });
});

describe('public work detail', () => {
  it('groups evidence into documents and a before sequence', async () => {
    mockSite({ PublicWork: WORK_DETAIL_WITH_EVIDENCE });
    renderAt('/work/sample-road-project');

    await screen.findByRole('heading', { level: 1, name: 'Sample Road Project' });

    expect(screen.getByText('Municipal completion certificate')).toBeInTheDocument();
    expect(screen.getByText('Completion certificate')).toBeInTheDocument();
    // The photograph is grouped under "Before" because it was classified
    // BEFORE_PHOTO - never because of its position in the list.
    expect(screen.getByRole('heading', { name: 'Before' })).toBeInTheDocument();
  });

  it('publishes document provenance so a reader can check it independently', async () => {
    mockSite({ PublicWork: WORK_DETAIL_WITH_EVIDENCE });
    renderAt('/work/sample-road-project');

    await screen.findByText('Municipal completion certificate');

    expect(screen.getByText('MC/2026/118')).toBeInTheDocument();
    expect(screen.getByText('City Municipal Corporation')).toBeInTheDocument();
  });

  it('opens documents in a new tab rather than embedding them', async () => {
    mockSite({ PublicWork: WORK_DETAIL_WITH_EVIDENCE });
    renderAt('/work/sample-road-project');

    const link = await screen.findByRole('link', { name: /certificate\.pdf/i });
    expect(link).toHaveAttribute('target', '_blank');
    // A PDF rendered inside the site's own origin is a script-execution surface
    // the site does not need.
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('says so when a work has no published evidence', async () => {
    mockSite({ PublicWork: WORK_DETAIL });
    renderAt('/work/sample-road-project');

    await screen.findByRole('heading', { level: 1, name: 'Sample Road Project' });
    // Silence would read as "we did not look"; this says "nothing published".
    expect(screen.getByText(/no supporting records have been published/i)).toBeInTheDocument();
  });
});

describe('public transparency page', () => {
  it('shows proposed and ongoing counts beside the verified count', async () => {
    mockSite({ Transparency: TRANSPARENCY });
    renderAt('/transparency');

    await screen.findByRole('heading', { level: 1, name: 'Transparency' });

    // A page that showed only the flattering number would be a leaflet with a
    // database behind it.
    expect(screen.getByText('Verified works')).toBeInTheDocument();
    expect(screen.getByText('Ongoing works')).toBeInTheDocument();
    expect(screen.getByText('Proposed works')).toBeInTheDocument();
  });

  it('renders evidence coverage from the database figure', async () => {
    mockSite({ Transparency: TRANSPARENCY });
    renderAt('/transparency');

    await screen.findByRole('heading', { level: 1, name: 'Transparency' });
    expect(screen.getByText('71%')).toBeInTheDocument();
    expect(screen.getByText(/5 of 7 published works/i)).toBeInTheDocument();
  });

  it('renders an em dash, never 0%, when nothing is published', async () => {
    mockSite({ Transparency: TRANSPARENCY_EMPTY });
    renderAt('/transparency');

    await screen.findByRole('heading', { level: 1, name: 'Transparency' });

    // A percentage with an empty denominator is not zero, it is nothing.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('states that verification is internal, not an external audit', async () => {
    mockSite({ Transparency: TRANSPARENCY });
    renderAt('/transparency');

    await screen.findByRole('heading', { level: 1, name: 'Transparency' });
    expect(screen.getByText(/not an external or government audit/i)).toBeInTheDocument();
  });

  it('shows a usable error state rather than a blank page', async () => {
    mockSite({ Transparency: graphqlError('INTERNAL', 'Something went wrong') });
    renderAt('/transparency');

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
