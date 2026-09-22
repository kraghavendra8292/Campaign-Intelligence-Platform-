import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { installGraphQLMock, graphqlError, type Responder } from '../test/graphqlMock';

/**
 * Campaign dashboard.
 *
 * The point of these is DATA ACCURACY, not layout: every figure on screen has
 * to be the figure the API returned. A dashboard that looks right while showing
 * the wrong number is worse than one that looks unfinished, so each assertion
 * pins a rendered value to the stubbed response that produced it.
 */

const VIEWER = {
  user: { id: 'u1', email: 'admin@example.test', fullName: 'Admin', status: 'ACTIVE' },
  organization: { id: 'org1', name: 'Demo Org', slug: 'demo-org' },
  roles: ['CAMPAIGN_ADMIN'],
  permissions: [],
  isPlatformAdmin: false,
  memberships: [],
};

const PERIOD = { from: '2026-08-15T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z', days: 30 };

const OVERVIEW = {
  analyticsOverview: {
    period: PERIOD,
    previousPeriod: PERIOD,
    generatedAt: '2026-09-14T10:30:00.000Z',
    totalInRange: 137,
    previousTotal: 110,
    changePct: 24.5,
    totalAllTime: 1042,
    openCount: 58,
    resolvedInRange: 71,
    previousResolvedInRange: 60,
    resolvedChangePct: 18.3,
    closedInRange: 8,
    highPriorityOpen: 6,
    unassignedOpen: 12,
    awaitingModeration: 4,
    resolutionRatePct: 51.8,
    averageResolutionDays: 5.2,
    previousAverageResolutionDays: 6.1,
    averageResolutionChangePct: -14.7,
    medianResolutionDays: 4,
    resolvedSampleCount: 71,
    oldestOpenIssue: null,
  },
  analyticsInsights: [
    {
      kind: 'RISING_CATEGORY',
      headline: 'Water reports are rising',
      detail: 'Water submissions are up on the previous period.',
      currentValue: 40,
      previousValue: 22,
      changePct: 81.8,
      severity: 'WARNING',
      categoryKey: 'water',
    },
  ],
};

const TREND = {
  analyticsTrend: {
    granularity: 'DAY',
    previousTotal: 110,
    points: [
      { date: '2026-09-12T00:00:00.000Z', count: 5 },
      { date: '2026-09-13T00:00:00.000Z', count: 9 },
    ],
  },
};

const BREAKDOWN = {
  analyticsByStatus: [
    bucket('NEW', 'New', 40),
    bucket('IN_PROGRESS', 'In progress', 18),
    bucket('RESOLVED', 'Resolved', 71),
  ],
  analyticsByCategory: [bucket('roads', 'Roads', 52), bucket('water', 'Water', 40)],
  analyticsByPriority: [bucket('HIGH', 'High', 6)],
};

const ISSUES = {
  issues: {
    totalCount: 137,
    hasMore: true,
    nodes: [
      {
        id: 'issue-1',
        referenceNumber: 'ISS-2026-AB12CD34',
        title: 'Street light not working',
        status: 'NEW',
        priority: 'MEDIUM',
        ward: 'Ward 12',
        submittedAt: '2026-09-13T08:00:00.000Z',
        category: { id: 'c1', key: 'electricity', label: 'Electricity' },
      },
    ],
  },
};

const CONTENT = {
  cmsProjects: {
    totalCount: 23,
    nodes: [
      {
        id: 'p1',
        title: 'New Road Construction',
        status: 'PUBLISHED',
        projectStatus: 'COMPLETED',
        area: 'Ward 12',
        updatedAt: '2026-09-10T00:00:00.000Z',
      },
    ],
  },
  cmsNews: { totalCount: 9, nodes: [] },
  cmsEvents: { totalCount: 0, nodes: [] },
};

/**
 * The live KPI row, re-queried on every use.
 *
 * The loading skeleton renders under the same class, so a container captured
 * before the data arrives is detached by the time the figures appear.
 */
function kpiRow() {
  return within(document.querySelector('.kpi-grid') as HTMLElement);
}

function bucket(key: string, label: string, count: number) {
  return {
    key,
    id: null,
    label,
    count,
    sharePct: null,
    previousCount: 0,
    changePct: null,
    openCount: null,
    resolvedCount: null,
  };
}

function mockConsole(overrides: Record<string, Responder> = {}) {
  return installGraphQLMock({
    Refresh: { refreshToken: { accessToken: 'token', expiresIn: 900 } },
    Me: { me: VIEWER },
    AnalyticsOverview: OVERVIEW,
    AnalyticsTrend: TREND,
    AnalyticsBreakdown: BREAKDOWN,
    Issues: ISSUES,
    DashboardContent: CONTENT,
    ...overrides,
  });
}

async function renderDashboard(overrides: Record<string, Responder> = {}) {
  const mock = mockConsole(overrides);
  render(
    <AuthProvider>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin'] })} />
    </AuthProvider>,
  );
  await screen.findByRole('heading', { name: 'Campaign dashboard', level: 1 });
  return mock;
}

describe('campaign dashboard - real figures', () => {
  it('shows the values the API returned, not recomputed ones', async () => {
    await renderDashboard();

    /*
     * Scoped to the KPI row. Several of these figures legitimately appear more
     * than once - 71 is both the resolved KPI and the Resolved status bucket -
     * which is itself a sign the two are reading the same source.
     */
    // KPI values animate from zero, so wait for the settled figure.
    await waitFor(() => expect(kpiRow().getByText('137')).toBeInTheDocument());
    expect(kpiRow().getByText('58')).toBeInTheDocument(); // open
    expect(kpiRow().getByText('71')).toBeInTheDocument(); // resolved in range
    expect(kpiRow().getByText('52%')).toBeInTheDocument(); // rounded resolution rate
    expect(kpiRow().getByText(/1,042/)).toBeInTheDocument(); // all-time total
  });

  it('states the direction of change against the previous period', async () => {
    await renderDashboard();

    expect(await screen.findByText('+24.5%')).toBeInTheDocument();
    expect(screen.getByText('+18.3%')).toBeInTheDocument();
  });

  it('says a rate is undefined rather than printing zero', async () => {
    await renderDashboard({
      AnalyticsOverview: {
        ...OVERVIEW,
        analyticsOverview: {
          ...OVERVIEW.analyticsOverview,
          resolutionRatePct: null,
          changePct: null,
        },
      },
    });

    // An em dash for the rate, and an explicit note for the missing comparison.
    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.getAllByText('No comparison available').length).toBeGreaterThan(0);
  });

  it('lists real submissions and links to the existing issue route', async () => {
    await renderDashboard();

    const link = await screen.findByRole('link', { name: /ISS-2026-AB12CD34/ });
    expect(link).toHaveAttribute('href', '/admin/issues/issue-1');
    expect(within(link).getByText('Street light not working')).toBeInTheDocument();
    expect(within(link).getByText('Ward 12')).toBeInTheDocument();
  });

  it('renders only insights the API actually produced', async () => {
    await renderDashboard();

    expect(await screen.findByText('Water reports are rising')).toBeInTheDocument();
  });

  it('says so when there are no insights, rather than inventing one', async () => {
    await renderDashboard({
      AnalyticsOverview: { ...OVERVIEW, analyticsInsights: [] },
    });

    expect(await screen.findByText(/Insights appear once enough submissions/i)).toBeInTheDocument();
  });

  it('shows real content counts, including a genuine zero', async () => {
    await renderDashboard();

    const counts = () =>
      Array.from(document.querySelectorAll('.dash-content__count')).map((el) => el.textContent);

    // Projects 23, news 9, events a genuine 0 - shown as a count, not hidden.
    await waitFor(() => expect(counts()).toEqual(['23', '9', '0']));
  });
});

describe('campaign dashboard - resilience', () => {
  it('keeps working when one section fails, and offers a retry', async () => {
    await renderDashboard({
      AnalyticsBreakdown: graphqlError('INTERNAL_SERVER_ERROR', 'Breakdown unavailable'),
    });

    // The failed widget reports itself...
    await waitFor(() =>
      expect(screen.getAllByText('Breakdown unavailable').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0);

    // ...while everything else still shows its data.
    await waitFor(() => expect(kpiRow().getByText('137')).toBeInTheDocument());
    expect(screen.getByText('Street light not working')).toBeInTheDocument();
  });

  it('does not offer a retry for a permission failure', async () => {
    await renderDashboard({
      Issues: graphqlError('FORBIDDEN', 'no access'),
    });

    const widget = () =>
      within(screen.getByText('Recent submissions').closest('.dash-widget') as HTMLElement);

    /*
     * Awaited: the widget's HEADER renders as soon as the page does, while its
     * error body only appears once the query rejects. Asserting on the header's
     * presence alone would race the response.
     */
    await waitFor(() => expect(widget().getByText(/do not have access/i)).toBeInTheDocument());

    // Retrying a permission error just fails again; the widget says why instead.
    expect(widget().queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('re-queries every section when refresh is pressed', async () => {
    const mock = await renderDashboard();
    await waitFor(() => expect(kpiRow().getByText('137')).toBeInTheDocument());

    const before = mock.operations().filter((op) => op === 'AnalyticsOverview').length;
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(mock.operations().filter((op) => op === 'AnalyticsOverview').length).toBeGreaterThan(
        before,
      );
    });
  });

  it('sends the chosen period to the server, not just to the UI', async () => {
    const mock = await renderDashboard();
    await waitFor(() => expect(kpiRow().getByText('137')).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /period/i }), 'LAST_7_DAYS');

    await waitFor(() => {
      expect(mock.variablesFor('AnalyticsOverview')).toMatchObject({
        filter: { range: 'LAST_7_DAYS' },
      });
    });
  });
});
