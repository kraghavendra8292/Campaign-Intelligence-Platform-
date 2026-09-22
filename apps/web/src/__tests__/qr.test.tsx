import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { graphqlError, installGraphQLMock, type Responder } from '../test/graphqlMock';

/**
 * Phase 4 - QR campaign console.
 *
 * Mounts the real route tree behind the real Phase 2 guard, so the guard is in
 * the test's path rather than around it.
 *
 * Two things get disproportionate attention because they are what would matter
 * most if they broke:
 *
 *  1. The wording. Every figure must say "scans", never "people" - the data
 *     cannot support the second, and a test is the only thing that stops a
 *     well-meaning copy edit from turning one into the other.
 *  2. Permission-shaped UI. A field coordinator must not be shown a Pause
 *     button that will only fail, and a viewer must not be shown analytics.
 */

const VIEWER_ORG = { id: 'org-1', name: 'Demo Campaign', slug: 'demo-campaign' };

function viewer(permissions: string[], roleKey = 'CAMPAIGN_ADMIN') {
  return {
    me: {
      user: { id: 'user-1', email: 'admin@example.test', fullName: 'Demo Admin', status: 'ACTIVE' },
      organization: VIEWER_ORG,
      roles: [roleKey],
      permissions,
      isPlatformAdmin: false,
      memberships: [
        { id: 'mem-1', organization: VIEWER_ORG, role: { key: roleKey, name: roleKey } },
      ],
    },
  };
}

const ADMIN_PERMISSIONS = [
  'QR_CAMPAIGN_READ',
  'QR_CAMPAIGN_CREATE',
  'QR_CAMPAIGN_UPDATE',
  'QR_CAMPAIGN_ARCHIVE',
  'QR_CODE_READ',
  'QR_CODE_CREATE',
  'QR_CODE_UPDATE',
  'QR_CODE_ARCHIVE',
  'QR_CODE_DOWNLOAD',
  'QR_ANALYTICS_READ',
  'ISSUE_READ',
];

const VIEWER_PERMISSIONS = ['QR_CAMPAIGN_READ', 'QR_CODE_READ'];

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    slug: 'ward-12-awareness',
    name: 'Ward 12 Awareness (DEMO)',
    description: 'Synthetic campaign used for rendering tests.',
    campaignType: 'POSTER',
    status: 'ACTIVE',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    qrCodeCount: 3,
    totalScans: 1248,
    issueCount: 42,
    openIssueCount: 11,
    conversionRatePct: 3.4,
    ...overrides,
  };
}

function codeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'qr-1',
    code: 'RK-QR-7F3K9XQ2',
    name: '12th Main Road Poster (DEMO)',
    description: null,
    destinationPath: '/work/road-development',
    status: 'ACTIVE',
    source: 'Poster',
    placement: 'Bus shelter',
    area: 'North District',
    ward: 'Ward 12',
    locality: null,
    latitude: null,
    longitude: null,
    utmSource: 'qr',
    utmMedium: 'poster',
    utmCampaign: 'ward-12-awareness',
    utmContent: 'poster-01',
    createdAt: '2026-01-02T00:00:00.000Z',
    activatedAt: '2026-01-02T00:00:00.000Z',
    deactivatedAt: null,
    totalScans: 482,
    campaign: {
      id: 'camp-1',
      name: 'Ward 12 Awareness (DEMO)',
      slug: 'ward-12-awareness',
      campaignType: 'POSTER',
      status: 'ACTIVE',
    },
    ...overrides,
  };
}

const QR_IMAGE = {
  scanUrl: 'http://localhost:4000/q/RK-QR-7F3K9XQ2',
  // A one-pixel PNG: enough for an <img> without embedding a real symbol.
  pngDataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25"><rect width="25" height="25" fill="#fff"/></svg>',
};

function analytics(overrides: Record<string, unknown> = {}) {
  return {
    range: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z', days: 30 },
    totalScans: 1248,
    automatedScans: 48,
    estimatedUniqueScans: 910,
    scansToday: 24,
    scansLast7Days: 210,
    scansLast30Days: 1248,
    averageScansPerDay: 41.6,
    activeQrCodes: 3,
    totalQrCodes: 4,
    topQrCodeId: 'qr-1',
    issuesFromQr: 42,
    openIssues: 11,
    conversionRatePct: 3.4,
    issuesByStatus: [
      { key: 'SUBMITTED', label: 'Submitted', count: 18 },
      { key: 'IN_PROGRESS', label: 'In progress', count: 12 },
    ],
    issuesByPriority: [
      { key: 'MEDIUM', label: 'Medium', count: 28 },
      { key: 'HIGH', label: 'High', count: 10 },
    ],
    trend: [
      { date: '2026-01-01T00:00:00.000Z', scans: 30 },
      { date: '2026-01-02T00:00:00.000Z', scans: 52 },
      { date: '2026-01-03T00:00:00.000Z', scans: 41 },
    ],
    byQrCode: [{ key: 'qr-1', label: '12th Main Road Poster (DEMO)', scans: 482 }],
    bySource: [
      { key: 'Poster', label: 'Poster', scans: 474 },
      { key: 'Pamphlet', label: 'Pamphlet', scans: 337 },
    ],
    byArea: [{ key: 'North District', label: 'North District', scans: 1248 }],
    byWard: [{ key: 'Ward 12', label: 'Ward 12', scans: 811 }],
    byDevice: [
      { key: 'MOBILE', label: 'Mobile', scans: 1136 },
      { key: 'DESKTOP', label: 'Desktop', scans: 64 },
    ],
    byDayOfWeek: [{ key: '1', label: 'Monday', scans: 180 }],
    byHourBucket: [{ key: 'H18_24', label: '18:00–24:00', scans: 520 }],
    ...overrides,
  };
}

/** Signs a viewer in and mounts the admin route tree at `path`. */
function renderAdmin(
  path: string,
  handlers: Record<string, Responder>,
  permissions = ADMIN_PERMISSIONS,
) {
  const mock = installGraphQLMock({
    Refresh: { refreshToken: { accessToken: 'test-access-token', expiresIn: 900 } },
    Me: viewer(permissions),
    ...handlers,
  });

  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );

  return mock;
}

describe('QR campaigns list', () => {
  it('renders campaigns with their code counts and scan totals', async () => {
    renderAdmin('/admin/qr-campaigns', {
      QrCampaigns: { qrCampaigns: { nodes: [campaignRow()], totalCount: 1 } },
    });

    expect(
      await screen.findByRole('link', { name: 'Ward 12 Awareness (DEMO)' }),
    ).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('1,248')).toBeInTheDocument();
    expect(within(table).getByText('3')).toBeInTheDocument();
    expect(within(table).getByText('42')).toBeInTheDocument();
    expect(within(table).getByText('3.4%')).toBeInTheDocument();
    expect(within(table).getByText('active')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Feedbacks' })).toBeInTheDocument();
  });

  it('shows a specific empty state, not a bare table', async () => {
    renderAdmin('/admin/qr-campaigns', {
      QrCampaigns: { qrCampaigns: { nodes: [], totalCount: 0 } },
    });

    expect(await screen.findByText('No QR campaigns have been created yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create the first campaign' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('explains a permission failure rather than showing a generic error', async () => {
    renderAdmin('/admin/qr-campaigns', {
      QrCampaigns: graphqlError('FORBIDDEN', 'Missing permission'),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not have access/i);
  });

  it('surfaces a server error with a working retry', async () => {
    const mock = renderAdmin('/admin/qr-campaigns', {
      QrCampaigns: graphqlError('INTERNAL_SERVER_ERROR', 'Database unavailable'),
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Database unavailable');

    const before = mock.operations().filter((op) => op === 'QrCampaigns').length;
    await userEvent.click(within(alert).getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(mock.operations().filter((op) => op === 'QrCampaigns').length).toBeGreaterThan(before);
    });
  });

  it('sends the status filter to the server rather than filtering in the browser', async () => {
    const mock = renderAdmin('/admin/qr-campaigns', {
      QrCampaigns: { qrCampaigns: { nodes: [campaignRow()], totalCount: 1 } },
    });

    await screen.findByRole('link', { name: 'Ward 12 Awareness (DEMO)' });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /filter by status/i }),
      'PAUSED',
    );

    await waitFor(() => {
      expect(mock.variablesFor('QrCampaigns')).toMatchObject({ status: 'PAUSED' });
    });
  });

  it('sends the lifecycle transition the button names', async () => {
    const mock = renderAdmin('/admin/qr-campaigns', {
      QrCampaigns: { qrCampaigns: { nodes: [campaignRow()], totalCount: 1 } },
      TransitionQrCampaign: { transitionQrCampaign: { id: 'camp-1', status: 'PAUSED' } },
    });

    await screen.findByRole('link', { name: 'Ward 12 Awareness (DEMO)' });
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(mock.variablesFor('TransitionQrCampaign')).toMatchObject({
        id: 'camp-1',
        action: 'PAUSE',
      });
    });
  });
});

describe('QR permission-shaped UI', () => {
  it('hides create, edit and lifecycle controls from a read-only viewer', async () => {
    renderAdmin(
      '/admin/qr-campaigns',
      { QrCampaigns: { qrCampaigns: { nodes: [campaignRow()], totalCount: 1 } } },
      VIEWER_PERMISSIONS,
    );

    await screen.findByRole('link', { name: 'Ward 12 Awareness (DEMO)' });

    expect(screen.queryByRole('link', { name: 'New campaign' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    // No analytics link either: seeing that a code exists and seeing how it
    // performed are different disclosures.
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
  });

  it('offers the full control set to a campaign administrator', async () => {
    renderAdmin('/admin/qr-campaigns', {
      QrCampaigns: { qrCampaigns: { nodes: [campaignRow()], totalCount: 1 } },
    });

    await screen.findByRole('link', { name: 'Ward 12 Awareness (DEMO)' });
    expect(screen.getByRole('link', { name: 'New campaign' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('explains a withheld QR asset instead of showing a broken image', async () => {
    renderAdmin(
      '/admin/qr-campaigns/camp-1/qr/qr-1',
      // The API returns null for `image` when the caller lacks the download
      // permission, rather than failing the whole query.
      {
        QrCodeDetail: { qrCode: { ...codeRow(), image: null } },
        QrAnalytics: graphqlError('FORBIDDEN', 'no'),
      },
      VIEWER_PERMISSIONS,
    );

    expect(
      await screen.findByText(/do not have permission to download QR assets/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('QR campaign detail', () => {
  it('renders the campaign, its codes and its headline figures', async () => {
    renderAdmin('/admin/qr-campaigns/camp-1', {
      QrCampaignDetail: {
        qrCampaign: campaignRow(),
        qrCodes: { nodes: [codeRow()], totalCount: 1 },
      },
      QrAnalytics: { qrAnalytics: analytics() },
      Issues: { issues: { nodes: [], totalCount: 0, hasMore: false } },
    });

    expect(
      await screen.findByRole('heading', { name: 'Ward 12 Awareness (DEMO)', level: 1 }),
    ).toBeInTheDocument();

    expect(screen.getByText('RK-QR-7F3K9XQ2')).toBeInTheDocument();
    expect(screen.getByText('/work/road-development')).toBeInTheDocument();
    expect(screen.getByText('Top performing QR')).toBeInTheDocument();
    expect(screen.getAllByText('12th Main Road Poster (DEMO)').length).toBeGreaterThan(0);
    expect(screen.getByText('Conversion')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Feedbacks' })).toBeInTheDocument();
  });

  it('shows an empty state when a campaign has no codes yet', async () => {
    renderAdmin('/admin/qr-campaigns/camp-1', {
      QrCampaignDetail: {
        qrCampaign: campaignRow({ qrCodeCount: 0, totalScans: 0, issueCount: 0, openIssueCount: 0, conversionRatePct: null }),
        qrCodes: { nodes: [], totalCount: 0 },
      },
      QrAnalytics: { qrAnalytics: analytics({ totalScans: 0, trend: [], issuesFromQr: 0, openIssues: 0, conversionRatePct: null }) },
      Issues: { issues: { nodes: [], totalCount: 0, hasMore: false } },
    });

    expect(
      await screen.findByText('No QR codes have been created for this campaign.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create the first QR code' })).toBeInTheDocument();
  });

  it('renders the campaign even when the viewer cannot see analytics', async () => {
    renderAdmin('/admin/qr-campaigns/camp-1', {
      QrCampaignDetail: {
        qrCampaign: campaignRow(),
        qrCodes: { nodes: [codeRow()], totalCount: 1 },
      },
      QrAnalytics: graphqlError('FORBIDDEN', 'Missing permission'),
      Issues: { issues: { nodes: [], totalCount: 0, hasMore: false } },
    });

    // The page is useful without the optional panel; it does not fail over it.
    expect(
      await screen.findByRole('heading', { name: 'Ward 12 Awareness (DEMO)', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Top performing QR')).not.toBeInTheDocument();
  });
});

describe('QR code detail and preview', () => {
  it('renders the symbol, identifier and download controls', async () => {
    renderAdmin('/admin/qr-campaigns/camp-1/qr/qr-1', {
      QrCodeDetail: { qrCode: { ...codeRow(), image: QR_IMAGE } },
      QrAnalytics: { qrAnalytics: analytics() },
    });

    expect(
      await screen.findByRole('heading', { name: '12th Main Road Poster (DEMO)', level: 1 }),
    ).toBeInTheDocument();

    expect(screen.getByRole('img', { name: /QR code RK-QR-7F3K9XQ2/ })).toBeInTheDocument();
    expect(screen.getByText('http://localhost:4000/q/RK-QR-7F3K9XQ2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download SVG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy URL' })).toBeInTheDocument();
  });

  it('states absent placement metadata rather than leaving it blank', async () => {
    renderAdmin('/admin/qr-campaigns/camp-1/qr/qr-1', {
      QrCodeDetail: {
        qrCode: { ...codeRow(), image: QR_IMAGE, ward: null, area: null, locality: null },
      },
      QrAnalytics: { qrAnalytics: analytics() },
    });

    await screen.findByRole('heading', { name: '12th Main Road Poster (DEMO)', level: 1 });
    expect(screen.getAllByText('Not stated').length).toBeGreaterThanOrEqual(3);
  });

  it('sends the transition the button names', async () => {
    const mock = renderAdmin('/admin/qr-campaigns/camp-1/qr/qr-1', {
      QrCodeDetail: { qrCode: { ...codeRow(), image: QR_IMAGE } },
      QrAnalytics: { qrAnalytics: analytics() },
      TransitionQrCode: { transitionQrCode: { id: 'qr-1', status: 'PAUSED' } },
    });

    await screen.findByRole('heading', { name: '12th Main Road Poster (DEMO)', level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(mock.variablesFor('TransitionQrCode')).toMatchObject({
        id: 'qr-1',
        action: 'PAUSE',
      });
    });
  });
});

describe('QR code form', () => {
  it('renders an empty form and composes a safe destination path', async () => {
    const mock = renderAdmin('/admin/qr-campaigns/camp-1/qr/new', {
      QrDestinations: { qrDestinationOptions: ['/', '/work', '/achievements', '/news'] },
      CreateQrCode: { createQrCode: { id: 'qr-2', code: 'RK-QR-ABCDEFGH' } },
    });

    expect(
      await screen.findByRole('heading', { name: 'New QR code', level: 1 }),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^QR name/), 'Ward 8 Pamphlet');
    await userEvent.selectOptions(screen.getByLabelText(/Public page/), '/work');
    await userEvent.type(screen.getByLabelText(/Specific item/), 'road-development');
    await userEvent.type(screen.getByLabelText(/^Source/), 'Pamphlet');

    await userEvent.click(screen.getByRole('button', { name: 'Create QR code' }));

    await waitFor(() => {
      expect(mock.variablesFor('CreateQrCode')).toBeDefined();
    });

    const variables = mock.variablesFor('CreateQrCode') as {
      campaignId: string;
      input: Record<string, unknown>;
    };
    expect(variables.campaignId).toBe('camp-1');
    expect(variables.input.destinationPath).toBe('/work/road-development');
    expect(variables.input.source).toBe('Pamphlet');
    // A blank coordinate stays null. Coercing it to 0 would place every
    // un-located poster in the Gulf of Guinea.
    expect(variables.input.latitude).toBeNull();
    expect(variables.input.longitude).toBeNull();
  });

  it('shows a server validation error against the field that caused it', async () => {
    const mock = renderAdmin('/admin/qr-campaigns/camp-1/qr/new', {
      QrDestinations: { qrDestinationOptions: ['/work'] },
      CreateQrCode: graphqlError(
        'VALIDATION_ERROR',
        'That page does not exist on the public website.',
      ),
    });

    await screen.findByRole('heading', { name: 'New QR code', level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Create QR code' }));

    await waitFor(() => {
      expect(mock.operations()).toContain('CreateQrCode');
    });

    expect(
      await screen.findByText('That page does not exist on the public website.'),
    ).toBeInTheDocument();
  });
});

describe('QR analytics', () => {
  it('renders every aggregate breakdown', async () => {
    renderAdmin('/admin/qr-analytics', {
      QrOverview: {
        qrAnalytics: analytics(),
        qrCampaignComparison: {
          range: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z', days: 30 },
          campaigns: [
            {
              id: 'camp-1',
              name: 'Ward 12 Awareness (DEMO)',
              campaignType: 'POSTER',
              status: 'ACTIVE',
              scans: 1248,
            },
            {
              id: 'camp-2',
              name: 'Water Drive (DEMO)',
              campaignType: 'PAMPHLET',
              status: 'ACTIVE',
              scans: 843,
            },
          ],
        },
      },
    });

    expect(await screen.findByText('Total scans')).toBeInTheDocument();
    expect(screen.getByText('Scans by source')).toBeInTheDocument();
    expect(screen.getByText('Scans by ward')).toBeInTheDocument();
    expect(screen.getByText('Scans by device')).toBeInTheDocument();
    expect(screen.getByText('Scans by day of week')).toBeInTheDocument();
    expect(screen.getByText('Scans by time of day')).toBeInTheDocument();
    expect(screen.getByText('Campaign comparison')).toBeInTheDocument();
  });

  it('says "scans" everywhere and never "people"', async () => {
    renderAdmin('/admin/qr-analytics', {
      QrOverview: {
        qrAnalytics: analytics(),
        qrCampaignComparison: { range: analytics().range, campaigns: [] },
      },
    });

    await screen.findByText('Total scans');

    // The load-bearing assertion of this file. A scan is an event; a person is
    // not measurable from one, and no METRIC may imply otherwise.
    //
    // Scoped to labels and headings rather than to all page text, because the
    // one legitimate use of the word is the disclaimer - which is asserted
    // separately below and must not be what makes this pass.
    const metricLabels = [
      ...document.querySelectorAll('.stat-card__label'),
      ...document.querySelectorAll('.chart-card__title'),
      ...document.querySelectorAll('.ranked-bars__label'),
    ].map((element) => element.textContent ?? '');

    expect(metricLabels.length).toBeGreaterThan(8);
    for (const label of metricLabels) {
      expect(label).not.toMatch(/\bpeople\b|\bpersons?\b|\bcitizens\b|\bvoters\b/i);
    }

    // And the figures are named as what they actually are.
    expect(metricLabels.filter((label) => /scans?/i.test(label)).length).toBeGreaterThan(3);

    // The disclaimer states the limitation outright, in the interface itself.
    expect(screen.getByText(/All figures count/i).textContent).toMatch(/scan events.*not people/is);
  });

  it('states in the interface that no political profiling is performed', async () => {
    renderAdmin('/admin/qr-analytics', {
      QrOverview: {
        qrAnalytics: analytics(),
        qrCampaignComparison: { range: analytics().range, campaigns: [] },
      },
    });

    await screen.findByText('Total scans');

    // A product-policy guarantee stated where somebody using the dashboard
    // will actually see it, not only in a document they will not read.
    expect(screen.getByText(/All figures count/i).textContent).toMatch(
      /no political preference, affiliation or supporter status is recorded or inferred/i,
    );
  });

  it('reports an unavailable unique estimate as a dash, never as zero', async () => {
    renderAdmin('/admin/qr-analytics', {
      QrOverview: {
        qrAnalytics: analytics({ estimatedUniqueScans: null }),
        qrCampaignComparison: { range: analytics().range, campaigns: [] },
      },
    });

    await screen.findByText('Estimated unique visits');
    expect(screen.getByText('Not available for this period')).toBeInTheDocument();
  });

  it('re-queries when the date range changes', async () => {
    const mock = renderAdmin('/admin/qr-analytics', {
      QrOverview: {
        qrAnalytics: analytics(),
        qrCampaignComparison: { range: analytics().range, campaigns: [] },
      },
    });

    await screen.findByText('Total scans');
    expect(mock.variablesFor('QrOverview')).toMatchObject({
      filter: { range: 'LAST_30_DAYS' },
    });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /date range/i }), 'TODAY');

    await waitFor(() => {
      expect(mock.variablesFor('QrOverview')).toMatchObject({ filter: { range: 'TODAY' } });
    });
  });

  it('re-queries when automated traffic is excluded', async () => {
    const mock = renderAdmin('/admin/qr-analytics', {
      QrOverview: {
        qrAnalytics: analytics(),
        qrCampaignComparison: { range: analytics().range, campaigns: [] },
      },
    });

    await screen.findByText('Total scans');
    await userEvent.click(screen.getByRole('checkbox', { name: /exclude automated/i }));

    await waitFor(() => {
      expect(mock.variablesFor('QrOverview')).toMatchObject({
        filter: { excludeAutomated: true },
      });
    });
  });

  it('shows an empty chart message rather than a blank area', async () => {
    renderAdmin('/admin/qr-analytics', {
      QrOverview: {
        qrAnalytics: analytics({
          totalScans: 0,
          trend: [],
          bySource: [],
          byWard: [],
          byArea: [],
          byDevice: [],
          byQrCode: [],
          byDayOfWeek: [],
          byHourBucket: [],
        }),
        qrCampaignComparison: { range: analytics().range, campaigns: [] },
      },
    });

    expect((await screen.findAllByText('No scan data available yet.')).length).toBeGreaterThan(0);
  });
});
