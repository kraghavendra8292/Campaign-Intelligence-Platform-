import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { graphqlError, installGraphQLMock, type Responder } from '../test/graphqlMock';
import { SITE } from '../test/siteFixtures';

/**
 * Phase 5 - citizen feedback and the issue console.
 *
 * Two audiences, tested for two different failure modes.
 *
 * The PUBLIC form is tested for the things that would stop a real person
 * reporting a real problem: a lost form after a validation error, a required
 * field that should not be, a browser location prompt they did not ask for.
 *
 * The CONSOLE is tested for the thing that would harm the person who reported
 * it: a citizen's phone number rendering for somebody without the permission.
 */

const VIEWER_ORG = { id: 'org-1', name: 'Demo Campaign', slug: 'demo-campaign' };

function viewer(permissions: string[], roleKey = 'ISSUE_MANAGER') {
  return {
    me: {
      user: { id: 'user-1', email: 'staff@example.test', fullName: 'Demo Staff', status: 'ACTIVE' },
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

const MANAGER_PERMISSIONS = [
  'ISSUE_READ',
  'ISSUE_UPDATE',
  'ISSUE_ASSIGN',
  'ISSUE_STATUS_UPDATE',
  'ISSUE_PRIORITY_UPDATE',
  'ISSUE_MODERATE',
  'ISSUE_NOTE_READ',
  'ISSUE_NOTE_CREATE',
  'ISSUE_CONTACT_READ',
  'ISSUE_ATTACHMENT_READ',
  'ISSUE_ANALYTICS_READ',
];

/** Can see the backlog; cannot see the citizen, the notes or the files. */
const RESTRICTED_PERMISSIONS = ['ISSUE_READ'];

const CATEGORIES = [
  { key: 'ROADS', label: 'Roads' },
  { key: 'WATER', label: 'Water supply' },
  { key: 'DRAINAGE', label: 'Drainage' },
];

function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'iss-1',
    referenceNumber: 'ISS-2026-7F3K9XQ2',
    type: 'ISSUE',
    title: 'Blocked drain on the side lane',
    status: 'SUBMITTED',
    priority: 'MEDIUM',
    moderationStatus: 'PENDING_REVIEW',
    source: 'QR',
    ward: 'Ward 12',
    locality: 'Side Lane',
    area: 'North District',
    isAnonymous: false,
    contactProvided: true,
    contactVisible: true,
    contactName: 'Demo Resident',
    contactPhone: '+91 90000 00001',
    contactEmail: 'resident@example.test',
    submittedAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    attachmentCount: 1,
    noteCount: 2,
    category: { id: 'cat-1', key: 'DRAINAGE', label: 'Drainage' },
    assignedTo: null,
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...issueRow(),
    description: 'The drain has been blocked for several days and water is standing.',
    addressDescription: 'Behind the market',
    latitude: null,
    longitude: null,
    consentGiven: true,
    consentAt: '2026-02-01T10:00:00.000Z',
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-02-01T10:00:00.000Z',
    campaign: { id: 'camp-1', name: 'Ward 12 Awareness' },
    qrCode: { id: 'qr-1', code: 'RK-QR-7F3K9XQ2', name: '12th Main Poster' },
    ...overrides,
  };
}

const ANALYTICS = {
  range: { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z', days: 30 },
  totalInRange: 42,
  totalAllTime: 96,
  submittedToday: 3,
  openCount: 18,
  highPriorityOpen: 5,
  unassignedOpen: 7,
  awaitingModeration: 4,
  byStatus: [
    { key: 'SUBMITTED', label: 'Submitted', count: 12 },
    { key: 'IN_PROGRESS', label: 'In progress', count: 8 },
  ],
  byPriority: [{ key: 'HIGH', label: 'High', count: 5 }],
  byType: [{ key: 'ISSUE', label: 'Issue', count: 30 }],
  bySource: [
    { key: 'QR', label: 'QR code', count: 25 },
    { key: 'DIRECT_WEBSITE', label: 'Website', count: 17 },
  ],
  byCategory: [{ key: 'cat-1', label: 'Drainage', count: 14 }],
  byWard: [{ key: 'Ward 12', label: 'Ward 12', count: 22 }],
  trend: [
    { date: '2026-01-30T00:00:00.000Z', count: 4 },
    { date: '2026-01-31T00:00:00.000Z', count: 6 },
  ],
};

const NO_SESSION = graphqlError('UNAUTHENTICATED', 'no session');

/** Mounts a public route with the shell query stubbed. */
function renderPublic(path: string, handlers: Record<string, Responder>) {
  const mock = installGraphQLMock({ Refresh: NO_SESSION, Site: SITE, ...handlers });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return mock;
}

/** Signs a staff member in and mounts an admin route. */
function renderAdmin(
  path: string,
  handlers: Record<string, Responder>,
  permissions = MANAGER_PERMISSIONS,
) {
  const mock = installGraphQLMock({
    Refresh: { refreshToken: { accessToken: 'test-token', expiresIn: 900 } },
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

// ---------------------------------------------------------------------------
// Public form
// ---------------------------------------------------------------------------

describe('public feedback form', () => {
  it('renders every section with only four required fields', async () => {
    renderPublic('/feedback', {
      PublicIssueCategories: { publicIssueCategories: CATEGORIES },
    });

    expect(
      await screen.findByRole('heading', {
        name: /Share your feedback or report an issue/i,
        level: 1,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('group', { name: /What would you like to share/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Tell us about it/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Where is it/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Add a photo/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Your contact details/i })).toBeInTheDocument();

    // Location and contact are optional, and the form says so rather than
    // leaving somebody to guess which fields they can skip.
    expect(screen.getByText(/All location details are optional/i)).toBeInTheDocument();
  });

  it('offers all four submission types', async () => {
    renderPublic('/feedback', {
      PublicIssueCategories: { publicIssueCategories: CATEGORIES },
    });

    await screen.findByRole('group', { name: /What would you like to share/i });

    // The accessible name is the label plus its hint run together, so each
    // type is matched on its opening words rather than exactly.
    for (const label of [/^Feedback/, /^Report an issue/, /^Suggestion/, /^Complaint/]) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it('loads categories from the server rather than hard-coding them', async () => {
    const mock = renderPublic('/feedback', {
      PublicIssueCategories: { publicIssueCategories: CATEGORIES },
    });

    expect(await screen.findByRole('option', { name: 'Drainage' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Water supply' })).toBeInTheDocument();
    expect(mock.operations()).toContain('PublicIssueCategories');
  });

  it('is anonymous by default and hides the contact fields until asked', async () => {
    renderPublic('/feedback', { PublicIssueCategories: { publicIssueCategories: CATEGORIES } });

    const anonymous = await screen.findByRole('checkbox', {
      name: /Submit without giving my details/i,
    });
    expect(anonymous).toBeChecked();

    // Nothing to fill in, and nothing to consent to.
    expect(screen.queryByLabelText(/Phone number/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /I agree/i })).not.toBeInTheDocument();

    await userEvent.click(anonymous);

    expect(await screen.findByLabelText(/Phone number/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /I agree/i })).toBeInTheDocument();
  });

  it('submits an anonymous report and never sends contact fields', async () => {
    const mock = renderPublic('/feedback', {
      PublicIssueCategories: { publicIssueCategories: CATEGORIES },
      SubmitIssue: {
        submitIssue: {
          referenceNumber: 'ISS-2026-7F3K9XQ2',
          type: 'ISSUE',
          submittedAt: '2026-02-01T10:00:00.000Z',
          contactProvided: false,
        },
      },
    });

    await screen.findByRole('group', { name: /What would you like to share/i });

    await userEvent.type(screen.getByLabelText(/Short title/i), 'Blocked drain');
    await userEvent.type(
      screen.getByLabelText(/Describe it/i),
      'The drain behind the market has been blocked for several days.',
    );
    await userEvent.selectOptions(screen.getByLabelText(/What is this about/i), 'DRAINAGE');
    await userEvent.type(screen.getByLabelText(/^Ward/i), 'Ward 12');

    await userEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(mock.variablesFor('SubmitIssue')).toBeDefined();
    });

    const input = (mock.variablesFor('SubmitIssue') as { input: Record<string, unknown> }).input;
    expect(input.title).toBe('Blocked drain');
    expect(input.categoryKey).toBe('DRAINAGE');
    expect(input.ward).toBe('Ward 12');
    expect(input.isAnonymous).toBe(true);
    expect(input.contactName).toBeNull();
    expect(input.contactPhone).toBeNull();
    expect(input.contactEmail).toBeNull();
  });

  it('shows the reference number prominently on success', async () => {
    renderPublic('/feedback', {
      PublicIssueCategories: { publicIssueCategories: CATEGORIES },
      SubmitIssue: {
        submitIssue: {
          referenceNumber: 'ISS-2026-7F3K9XQ2',
          type: 'ISSUE',
          submittedAt: '2026-02-01T10:00:00.000Z',
          contactProvided: false,
        },
      },
    });

    await screen.findByRole('group', { name: /What would you like to share/i });
    await userEvent.type(screen.getByLabelText(/Short title/i), 'Blocked drain');
    await userEvent.type(screen.getByLabelText(/Describe it/i), 'A long enough description here.');
    await userEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    expect(await screen.findByText('ISS-2026-7F3K9XQ2')).toBeInTheDocument();
    expect(screen.getByText(/Thank you for sharing this/i)).toBeInTheDocument();
    expect(screen.getByText(/Please save this reference number/i)).toBeInTheDocument();
    // Anonymous, so the page says the team cannot reply rather than implying
    // somebody will be in touch.
    expect(screen.getByText(/cannot reply directly/i)).toBeInTheDocument();
  });

  it('keeps what the citizen typed when the server rejects a field', async () => {
    renderPublic('/feedback', {
      PublicIssueCategories: { publicIssueCategories: CATEGORIES },
      SubmitIssue: graphqlError('VALIDATION_ERROR', 'Please add a little more detail.'),
    });

    await screen.findByRole('group', { name: /What would you like to share/i });

    await userEvent.type(screen.getByLabelText(/Short title/i), 'A title worth keeping');
    await userEvent.type(screen.getByLabelText(/Describe it/i), 'Too short');
    await userEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    expect(await screen.findByText('Please add a little more detail.')).toBeInTheDocument();

    // Losing twenty minutes of typing to one validation error is how a citizen
    // gives up and never reports anything again.
    expect(screen.getByLabelText(/Short title/i)).toHaveValue('A title worth keeping');
    expect(screen.getByLabelText(/Describe it/i)).toHaveValue('Too short');
  });

  it('never asks the browser for a location without a deliberate tap', async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
    });

    renderPublic('/feedback', { PublicIssueCategories: { publicIssueCategories: CATEGORIES } });
    await screen.findByRole('group', { name: /Where is it/i });

    // Rendering the page must never trigger the permission prompt.
    expect(getCurrentPosition).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Use my current location/i }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('carries the QR code that brought the visitor, and only that', async () => {
    window.sessionStorage.setItem('rk.qr.referrer', 'RK-QR-7F3K9XQ2');

    const mock = renderPublic('/feedback', {
      PublicIssueCategories: { publicIssueCategories: CATEGORIES },
      SubmitIssue: {
        submitIssue: {
          referenceNumber: 'ISS-2026-AAAAAAAA',
          type: 'ISSUE',
          submittedAt: '2026-02-01T10:00:00.000Z',
          contactProvided: false,
        },
      },
    });

    await screen.findByRole('group', { name: /What would you like to share/i });
    await userEvent.type(screen.getByLabelText(/Short title/i), 'From a poster');
    await userEvent.type(screen.getByLabelText(/Describe it/i), 'A long enough description here.');
    await userEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(mock.variablesFor('SubmitIssue')).toBeDefined();
    });

    const input = (mock.variablesFor('SubmitIssue') as { input: Record<string, unknown> }).input;
    // Channel attribution only: which poster worked, never who scanned it.
    expect(input.qrCode).toBe('RK-QR-7F3K9XQ2');
  });
});

// ---------------------------------------------------------------------------
// Public tracking
// ---------------------------------------------------------------------------

describe('public tracking page', () => {
  it('shows only the status, and says why', async () => {
    // Phase 8 replaced the lookup with `publicIssueTimeline`, a strict superset
    // of the Phase 5 payload. Everything this test asserts about restraint is
    // unchanged: the page still shows six facts and explains why it stops there.
    renderPublic('/track', {
      PublicIssueTimeline: {
        publicIssueTimeline: {
          referenceNumber: 'ISS-2026-7F3K9XQ2',
          type: 'ISSUE',
          categoryLabel: 'Drainage',
          status: 'IN_PROGRESS',
          organizationName: 'Demo Constituency Office',
          submittedAt: '2026-02-01T10:00:00.000Z',
          updatedAt: '2026-02-05T10:00:00.000Z',
          resolvedAt: null,
          timeline: [],
          publicUpdates: [],
          followUpAvailable: false,
          existingFollowUp: null,
        },
      },
    });

    await screen.findByRole('heading', { name: /Check a submission/i, level: 1 });

    await userEvent.type(screen.getByLabelText(/Reference number/i), 'ISS-2026-7F3K9XQ2');
    await userEvent.click(screen.getByRole('button', { name: /^Check$/i }));

    // Translated into words a member of the public would use.
    expect(await screen.findByText('Being worked on')).toBeInTheDocument();
    expect(screen.getByText('Drainage')).toBeInTheDocument();

    // The restraint is explained, so it reads as care rather than breakage.
    expect(screen.getByText(/only the status is shown here/i)).toBeInTheDocument();
  });

  it('reports an unknown reference gently, without confirming anything', async () => {
    renderPublic('/track', { PublicIssueTimeline: { publicIssueTimeline: null } });

    await screen.findByRole('heading', { name: /Check a submission/i, level: 1 });
    await userEvent.type(screen.getByLabelText(/Reference number/i), 'ISS-2026-ZZZZZZZZ');
    await userEvent.click(screen.getByRole('button', { name: /^Check$/i }));

    expect(await screen.findByText(/could not find a submission/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Admin inbox
// ---------------------------------------------------------------------------

describe('admin issue inbox', () => {
  it('leads with the numbers that decide what to do next', async () => {
    renderAdmin('/admin/issues', {
      Issues: { issues: { nodes: [issueRow()], totalCount: 1, hasMore: false } },
      IssueAnalytics: { issueAnalytics: ANALYTICS },
      IssueCategories: { issueCategories: [] },
    });

    // Scoped to the stat cards: "Open" is also a row action, and "Unassigned"
    // also appears in the table.
    await screen.findByRole('link', { name: 'ISS-2026-7F3K9XQ2' });
    const labels = [...document.querySelectorAll('.stat-card__label')].map(
      (element) => element.textContent,
    );

    expect(labels).toContain('Open');
    expect(labels).toContain('High or urgent');
    expect(labels).toContain('Unassigned');
    expect(labels).toContain('Awaiting review');
  });

  it('renders submissions with reference, status and priority', async () => {
    renderAdmin('/admin/issues', {
      Issues: { issues: { nodes: [issueRow()], totalCount: 1, hasMore: false } },
      IssueAnalytics: { issueAnalytics: ANALYTICS },
      IssueCategories: { issueCategories: [] },
    });

    expect(await screen.findByRole('link', { name: 'ISS-2026-7F3K9XQ2' })).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('Blocked drain on the side lane')).toBeInTheDocument();
    expect(within(table).getByText('Medium')).toBeInTheDocument();
    expect(within(table).getByText('Ward 12')).toBeInTheDocument();

    // "Received" is both the status badge and a column header, so the badge is
    // located within its own row cell rather than by text alone.
    const row = within(table).getByRole('row', { name: /Blocked drain/ });
    expect(within(row).getByText('Received')).toBeInTheDocument();
    // A state somebody must act on, so it is named rather than left blank.
    expect(within(row).getByText('Unassigned')).toBeInTheDocument();
  });

  it('filters on the server, not in the browser', async () => {
    const mock = renderAdmin('/admin/issues', {
      Issues: { issues: { nodes: [issueRow()], totalCount: 1, hasMore: false } },
      IssueAnalytics: { issueAnalytics: ANALYTICS },
      IssueCategories: { issueCategories: [] },
    });

    await screen.findByRole('link', { name: 'ISS-2026-7F3K9XQ2' });

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /filter by status/i }),
      'IN_PROGRESS',
    );
    await waitFor(() => {
      expect(mock.variablesFor('Issues')).toMatchObject({ filter: { status: 'IN_PROGRESS' } });
    });

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /filter by priority/i }),
      'URGENT',
    );
    await waitFor(() => {
      expect(mock.variablesFor('Issues')).toMatchObject({ filter: { priority: 'URGENT' } });
    });

    await userEvent.type(screen.getByRole('searchbox', { name: /search submissions/i }), 'drain');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(mock.variablesFor('Issues')).toMatchObject({ filter: { search: 'drain' } });
    });
  });

  it('pages rather than loading everything', async () => {
    const mock = renderAdmin('/admin/issues', {
      Issues: { issues: { nodes: [issueRow()], totalCount: 60, hasMore: true } },
      IssueAnalytics: { issueAnalytics: ANALYTICS },
      IssueCategories: { issueCategories: [] },
    });

    await screen.findByRole('link', { name: 'ISS-2026-7F3K9XQ2' });
    expect(mock.variablesFor('Issues')).toMatchObject({ filter: { first: 25, offset: 0 } });

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(mock.variablesFor('Issues')).toMatchObject({ filter: { offset: 25 } });
    });
  });

  it('shows an empty state with a way out of the filters', async () => {
    renderAdmin('/admin/issues', {
      Issues: { issues: { nodes: [], totalCount: 0, hasMore: false } },
      IssueAnalytics: { issueAnalytics: ANALYTICS },
      IssueCategories: { issueCategories: [] },
    });

    expect(await screen.findByText(/No submissions match this view/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear filters/i })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Admin detail and citizen privacy
// ---------------------------------------------------------------------------

describe('admin issue detail', () => {
  const DETAIL_HANDLERS = {
    IssueDetail: {
      issue: detailRow(),
      issueHistory: [
        {
          id: 'h1',
          action: 'SUBMITTED',
          previousStatus: null,
          newStatus: 'SUBMITTED',
          previousPriority: null,
          newPriority: null,
          detail: null,
          createdAt: '2026-02-01T10:00:00.000Z',
          performedBy: null,
        },
        {
          id: 'h2',
          action: 'NOTE_ADDED',
          previousStatus: null,
          newStatus: null,
          previousPriority: null,
          newPriority: null,
          detail: null,
          createdAt: '2026-02-02T10:00:00.000Z',
          performedBy: { id: 'user-1', fullName: 'Demo Staff' },
        },
      ],
    },
    IssueNotes: {
      issueNotes: [
        {
          id: 'n1',
          note: 'CANDID-STAFF-ASSESSMENT about this report.',
          createdAt: '2026-02-02T10:00:00.000Z',
          author: { id: 'user-1', fullName: 'Demo Staff' },
        },
      ],
    },
    IssueAttachments: {
      issueAttachments: [
        {
          id: 'a1',
          originalName: 'drain.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 204800,
          createdAt: '2026-02-01T10:00:00.000Z',
        },
      ],
    },
    IssueAssignees: { issueAssignees: [{ id: 'user-2', fullName: 'Another Colleague' }] },
  };

  it('renders the report, its QR attribution and its timeline', async () => {
    renderAdmin('/admin/issues/iss-1', DETAIL_HANDLERS);

    expect(
      await screen.findByRole('heading', { name: /Blocked drain on the side lane/i, level: 1 }),
    ).toBeInTheDocument();

    expect(screen.getByText(/The drain has been blocked/i)).toBeInTheDocument();
    expect(screen.getByText('RK-QR-7F3K9XQ2')).toBeInTheDocument();
    expect(screen.getByText('Ward 12 Awareness')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Internal note added')).toBeInTheDocument();
  });

  it('does not display contact details until somebody deliberately asks', async () => {
    const mock = renderAdmin('/admin/issues/iss-1', {
      ...DETAIL_HANDLERS,
      RevealIssueContact: {
        revealIssueContact: {
          contactName: 'Demo Resident',
          contactPhone: '+91 90000 00001',
          contactEmail: 'resident@example.test',
        },
      },
    });

    await screen.findByRole('heading', { name: /Blocked drain on the side lane/i, level: 1 });

    // Opening the page must not put a citizen's phone number on screen, even
    // for somebody entitled to see it.
    expect(screen.queryByText('+91 90000 00001')).not.toBeInTheDocument();
    expect(screen.getByText(/recorded in the audit log/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Show contact details/i }));

    expect(await screen.findByText('+91 90000 00001')).toBeInTheDocument();
    expect(mock.operations()).toContain('RevealIssueContact');
  });

  it('hides notes, attachments and the reveal button from a restricted user', async () => {
    renderAdmin(
      '/admin/issues/iss-1',
      {
        IssueDetail: {
          issue: detailRow({
            contactVisible: false,
            contactName: null,
            contactPhone: null,
            contactEmail: null,
          }),
          issueHistory: [],
        },
        IssueNotes: graphqlError('FORBIDDEN', 'no'),
        IssueAttachments: graphqlError('FORBIDDEN', 'no'),
        IssueAssignees: graphqlError('FORBIDDEN', 'no'),
      },
      RESTRICTED_PERMISSIONS,
    );

    await screen.findByRole('heading', { name: /Blocked drain on the side lane/i, level: 1 });

    // The report is readable - that is what ISSUE_READ is for.
    expect(screen.getByText(/The drain has been blocked/i)).toBeInTheDocument();

    // The three separate disclosures are not.
    expect(screen.queryByText(/CANDID-STAFF-ASSESSMENT/)).not.toBeInTheDocument();
    expect(screen.queryByText('drain.jpg')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show contact details/i })).not.toBeInTheDocument();
    expect(screen.queryByText('+91 90000 00001')).not.toBeInTheDocument();

    // Nor can they change anything.
    expect(screen.queryByRole('button', { name: /Add note/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Set priority/i })).not.toBeInTheDocument();
  });

  it('offers only the statuses the workflow permits', async () => {
    renderAdmin('/admin/issues/iss-1', DETAIL_HANDLERS);
    await screen.findByRole('heading', { name: /Blocked drain on the side lane/i, level: 1 });

    // From SUBMITTED: under review, acknowledged, not taken forward.
    expect(screen.getByRole('button', { name: 'Under review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acknowledged' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not taken forward' })).toBeInTheDocument();

    // Skipping straight to Resolved or Closed is not something the UI can ask
    // for - the citizen is still waiting on an acknowledgement.
    expect(screen.queryByRole('button', { name: 'Resolved' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Closed' })).not.toBeInTheDocument();
  });

  it('sends the status transition the button names', async () => {
    const mock = renderAdmin('/admin/issues/iss-1', {
      ...DETAIL_HANDLERS,
      UpdateIssueStatus: { updateIssueStatus: { id: 'iss-1', status: 'UNDER_REVIEW' } },
    });

    await screen.findByRole('heading', { name: /Blocked drain on the side lane/i, level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Under review' }));

    await waitFor(() => {
      expect(mock.variablesFor('UpdateIssueStatus')).toMatchObject({
        id: 'iss-1',
        status: 'UNDER_REVIEW',
      });
    });
  });

  it('adds an internal note', async () => {
    const mock = renderAdmin('/admin/issues/iss-1', {
      ...DETAIL_HANDLERS,
      AddIssueNote: { addIssueInternalNote: { id: 'n2' } },
    });

    await screen.findByRole('heading', { name: /Blocked drain on the side lane/i, level: 1 });

    await userEvent.type(
      screen.getByLabelText(/Add an internal note/i),
      'Raised with the local officer.',
    );
    await userEvent.click(screen.getByRole('button', { name: /Add note/i }));

    await waitFor(() => {
      expect(mock.variablesFor('AddIssueNote')).toMatchObject({
        issueId: 'iss-1',
        note: 'Raised with the local officer.',
      });
    });
  });

  it('assigns to a colleague', async () => {
    const mock = renderAdmin('/admin/issues/iss-1', {
      ...DETAIL_HANDLERS,
      AssignIssue: {
        assignIssue: { id: 'iss-1', assignedTo: { id: 'user-2', fullName: 'Another Colleague' } },
      },
    });

    await screen.findByRole('heading', { name: /Blocked drain on the side lane/i, level: 1 });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Assign to a colleague/i }),
      'user-2',
    );

    await waitFor(() => {
      expect(mock.variablesFor('AssignIssue')).toMatchObject({ id: 'iss-1', userId: 'user-2' });
    });
  });

  it('says plainly that an anonymous submission cannot be replied to', async () => {
    renderAdmin('/admin/issues/iss-1', {
      ...DETAIL_HANDLERS,
      IssueDetail: {
        issue: detailRow({
          isAnonymous: true,
          contactProvided: false,
          contactName: null,
          contactPhone: null,
          contactEmail: null,
        }),
        issueHistory: [],
      },
    });

    await screen.findByRole('heading', { name: /Blocked drain on the side lane/i, level: 1 });
    expect(screen.getByText(/submitted anonymously/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show contact details/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Admin analytics
// ---------------------------------------------------------------------------

describe('admin issue analytics', () => {
  it('renders every aggregate breakdown', async () => {
    renderAdmin('/admin/issues/analytics', {
      IssueAnalytics: { issueAnalytics: ANALYTICS },
    });

    expect(await screen.findByText('Received in range')).toBeInTheDocument();
    expect(screen.getByText('By status')).toBeInTheDocument();
    expect(screen.getByText('By category')).toBeInTheDocument();
    expect(screen.getByText('By ward')).toBeInTheDocument();
    expect(screen.getByText('By source')).toBeInTheDocument();
    expect(screen.getByText('By type')).toBeInTheDocument();
    expect(screen.getByText('By priority')).toBeInTheDocument();
  });

  it('re-queries when the range changes', async () => {
    const mock = renderAdmin('/admin/issues/analytics', {
      IssueAnalytics: { issueAnalytics: ANALYTICS },
    });

    await screen.findByText('Received in range');
    expect(mock.variablesFor('IssueAnalytics')).toMatchObject({
      filter: { range: 'LAST_30_DAYS' },
    });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /date range/i }), 'TODAY');

    await waitFor(() => {
      expect(mock.variablesFor('IssueAnalytics')).toMatchObject({ filter: { range: 'TODAY' } });
    });
  });

  it('states in the interface that nothing political is recorded or inferred', async () => {
    renderAdmin('/admin/issues/analytics', {
      IssueAnalytics: { issueAnalytics: ANALYTICS },
    });

    await screen.findByText('Received in range');

    // A product-policy guarantee, stated where staff reading the numbers will
    // actually see it rather than only in a document nobody opens.
    const note = screen.getByText(/These figures count/i);
    expect(note.textContent).toMatch(
      /No political preference, affiliation or support is recorded, scored or inferred/i,
    );
    expect(note.textContent).toMatch(/says nothing about how that ward intends to vote/i);
  });

  it('names every metric as submissions, never as people', async () => {
    renderAdmin('/admin/issues/analytics', {
      IssueAnalytics: { issueAnalytics: ANALYTICS },
    });

    await screen.findByText('Received in range');

    const labels = [
      ...document.querySelectorAll('.stat-card__label'),
      ...document.querySelectorAll('.chart-card__title'),
    ].map((element) => element.textContent ?? '');

    expect(labels.length).toBeGreaterThan(8);
    for (const label of labels) {
      expect(label).not.toMatch(/\bpeople\b|\bcitizens\b|\bvoters\b|\bsupporters?\b/i);
    }
  });
});
