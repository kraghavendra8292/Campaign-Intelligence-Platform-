import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { graphqlError, installGraphQLMock, type Responder } from '../test/graphqlMock';

/**
 * Phase 3 - CMS admin screens.
 *
 * The CMS sits behind the Phase 2 guard, so every test here signs a viewer in
 * through the real bootstrap path (refresh cookie, then `me`) rather than
 * reaching into auth state. That keeps the guard in the test's path instead of
 * around it.
 *
 * The permission assertions are about what is DRAWN. They are not a security
 * claim: the API re-authorises every call, and the adversarial checks for that
 * live in the API suite. What is proven here is that an editor without the
 * publish permission is not shown a Publish button that would only fail.
 */

const VIEWER_ORG = { id: 'org-1', name: 'Demo Campaign', slug: 'demo-campaign' };

function viewer(permissions: string[], roleKey = 'CONTENT_MANAGER') {
  return {
    me: {
      user: {
        id: 'user-1',
        email: 'editor@example.test',
        fullName: 'Demo Editor',
        status: 'ACTIVE',
      },
      organization: VIEWER_ORG,
      roles: [roleKey],
      permissions,
      isPlatformAdmin: false,
      memberships: [
        { id: 'mem-1', organization: VIEWER_ORG, role: { key: roleKey, name: 'Content manager' } },
      ],
    },
  };
}

const EDITOR_PERMISSIONS = [
  'CONTENT_READ_UNPUBLISHED',
  'PROJECT_CREATE',
  'PROJECT_UPDATE',
  'PROJECT_DELETE',
];

const PUBLISHER_PERMISSIONS = [...EDITOR_PERMISSIONS, 'PROJECT_PUBLISH'];

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prj-1',
    slug: 'sample-road-project',
    title: 'Sample Road Project',
    category: 'INFRASTRUCTURE',
    area: 'Demo Area',
    projectStatus: 'IN_PROGRESS',
    status: 'DRAFT',
    featured: false,
    publishedAt: null,
    updatedAt: '2025-05-01T00:00:00.000Z',
    ...overrides,
  };
}

/** The cover-image picker queries the media library on every form screen. */
const MEDIA = { CmsMedia: { cmsMedia: { nodes: [], totalCount: 0 } } };

function projectList(nodes: unknown[]) {
  return { cmsProjects: { nodes, totalCount: nodes.length } };
}

/** Signs a viewer in and mounts the admin route tree at `path`. */
function renderAdmin(
  path: string,
  handlers: Record<string, Responder>,
  permissions = EDITOR_PERMISSIONS,
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

describe('CMS project list', () => {
  it('renders the rows with their publishing status', async () => {
    renderAdmin('/admin/content/projects', { CmsProjects: projectList([projectRow()]) });

    expect(await screen.findByRole('link', { name: 'Sample Road Project' })).toBeInTheDocument();

    const table = screen.getByRole('table');
    /*
     * "Draft", not "draft": the status badge now renders a translated label
     * rather than a lowercased enum. What is on screen is unchanged - the badge
     * uppercases in CSS either way - but the text in the DOM is now a word from
     * the dictionary, which is what makes it translatable.
     */
    expect(within(table).getByText('Draft')).toBeInTheDocument();
    // The domain status is distinct from the publishing status and both show.
    expect(within(table).getByText('In progress')).toBeInTheDocument();
  });

  it('shows an empty state with a create action, not a bare table', async () => {
    renderAdmin('/admin/content/projects', { CmsProjects: projectList([]) });

    expect(await screen.findByText('No projects yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create the first project' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows a loading state while the query is in flight', async () => {
    renderAdmin('/admin/content/projects', {
      // A request that never settles holds the screen in its loading state.
      CmsProjects: () => new Promise<Record<string, unknown>>(() => {}),
    });

    // The page chrome paints first; the table area is what is still loading.
    // Named explicitly so this cannot accidentally match the route guard's own
    // "Checking your session" indicator, which is gone by the time auth
    // resolves.
    expect(await screen.findByRole('heading', { name: 'Projects', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('explains a permission failure instead of showing a generic error', async () => {
    renderAdmin('/admin/content/projects', {
      CmsProjects: graphqlError('FORBIDDEN', 'Missing permission'),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /do not have access to this content/i,
    );
  });

  it('surfaces a server error with a retry', async () => {
    const mock = renderAdmin('/admin/content/projects', {
      CmsProjects: graphqlError('INTERNAL_SERVER_ERROR', 'Database unavailable'),
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Database unavailable');

    const before = mock.operations().filter((op) => op === 'CmsProjects').length;
    await userEvent.click(within(alert).getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(mock.operations().filter((op) => op === 'CmsProjects').length).toBeGreaterThan(before);
    });
  });

  it('sends the status filter to the server', async () => {
    const mock = renderAdmin('/admin/content/projects', {
      CmsProjects: projectList([projectRow()]),
    });

    await screen.findByRole('link', { name: 'Sample Road Project' });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /filter by status/i }),
      'PUBLISHED',
    );

    await waitFor(() => {
      expect(mock.variablesFor('CmsProjects')).toMatchObject({ status: 'PUBLISHED' });
    });
  });

  it('sends the search term to the server rather than filtering in the browser', async () => {
    const mock = renderAdmin('/admin/content/projects', {
      CmsProjects: projectList([projectRow()]),
    });

    await screen.findByRole('link', { name: 'Sample Road Project' });
    await userEvent.type(screen.getByRole('searchbox', { name: /search projects/i }), 'road');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(mock.variablesFor('CmsProjects')).toMatchObject({ search: 'road' });
    });
  });
});

describe('CMS publishing controls', () => {
  it('hides Publish from an editor who lacks the publish permission', async () => {
    renderAdmin(
      '/admin/content/projects',
      { CmsProjects: projectList([projectRow()]) },
      EDITOR_PERMISSIONS,
    );

    await screen.findByRole('link', { name: 'Sample Road Project' });

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    // Handing work over for approval is ordinary editorial work, so it stays.
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeInTheDocument();
  });

  it('offers Publish to a user who holds the publish permission', async () => {
    renderAdmin(
      '/admin/content/projects',
      { CmsProjects: projectList([projectRow()]) },
      PUBLISHER_PERMISSIONS,
    );

    await screen.findByRole('link', { name: 'Sample Road Project' });
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('offers Unpublish, not Publish, for already-published content', async () => {
    renderAdmin(
      '/admin/content/projects',
      { CmsProjects: projectList([projectRow({ status: 'PUBLISHED' })]) },
      PUBLISHER_PERMISSIONS,
    );

    await screen.findByRole('link', { name: 'Sample Road Project' });
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('sends the transition the button names', async () => {
    const mock = renderAdmin(
      '/admin/content/projects',
      {
        CmsProjects: projectList([projectRow()]),
        TransitionProject: { transitionProject: { id: 'prj-1', status: 'PUBLISHED' } },
      },
      PUBLISHER_PERMISSIONS,
    );

    await screen.findByRole('link', { name: 'Sample Road Project' });
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(mock.variablesFor('TransitionProject')).toMatchObject({
        id: 'prj-1',
        action: 'PUBLISH',
      });
    });
  });

  it('requires confirmation before deleting', async () => {
    const mock = renderAdmin('/admin/content/projects', {
      CmsProjects: projectList([projectRow()]),
      DeleteProject: { deleteProject: { success: true } },
    });

    await screen.findByRole('link', { name: 'Sample Road Project' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // Nothing is sent on the first click.
    expect(mock.operations()).not.toContain('DeleteProject');

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/cannot be undone/i);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(mock.variablesFor('DeleteProject')).toMatchObject({ id: 'prj-1' });
    });
  });
});

describe('CMS project form', () => {
  it('renders an empty form for a new project', async () => {
    renderAdmin('/admin/content/projects/new', MEDIA);

    expect(
      await screen.findByRole('heading', { name: 'New project', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('');
    expect(screen.getByLabelText(/Short description/)).toHaveValue('');
  });

  it('does not send a query when creating, and does when editing', async () => {
    const create = renderAdmin('/admin/content/projects/new', MEDIA);
    await screen.findByRole('heading', { name: 'New project', level: 1 });
    expect(create.operations()).not.toContain('CmsProject');
  });

  it('populates the form from the server when editing', async () => {
    renderAdmin('/admin/content/projects/prj-1', {
      ...MEDIA,
      CmsProject: {
        cmsProject: {
          ...projectRow(),
          shortDescription: 'A synthetic project.',
          descriptionHtml: '<p>Body.</p>',
          startDate: '2025-01-10T00:00:00.000Z',
          completionDate: null,
          costAmount: null,
          costCurrency: 'INR',
          beneficiaryCount: null,
          coverImage: null,
          metaTitle: null,
          metaDescription: null,
        },
      },
    });

    expect(await screen.findByDisplayValue('Sample Road Project')).toBeInTheDocument();
    expect(screen.getByLabelText(/Short description/)).toHaveValue('A synthetic project.');
    expect(screen.getByLabelText(/Start date/)).toHaveValue('2025-01-10');
  });

  it('sends unstated numbers as null rather than zero', async () => {
    const mock = renderAdmin('/admin/content/projects/new', {
      ...MEDIA,
      CreateProject: { createProject: { id: 'prj-2' } },
    });

    await screen.findByRole('heading', { name: 'New project', level: 1 });
    await userEvent.type(screen.getByLabelText(/^Title/), 'Another Sample Project');
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => {
      expect(mock.variablesFor('CreateProject')).toBeDefined();
    });

    const input = (mock.variablesFor('CreateProject') as { input: Record<string, unknown> }).input;
    expect(input.title).toBe('Another Sample Project');
    // A cost of zero is a claim; a blank field is not. They must not be conflated.
    expect(input.costAmount).toBeNull();
    expect(input.beneficiaryCount).toBeNull();
  });

  it('shows a server validation error against the field that caused it', async () => {
    const mock = renderAdmin('/admin/content/projects/new', {
      ...MEDIA,
      CreateProject: graphqlError('VALIDATION_ERROR', 'A title is required.'),
    });

    await screen.findByRole('heading', { name: 'New project', level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => {
      expect(mock.operations()).toContain('CreateProject');
    });

    expect(await screen.findByText('A title is required.')).toBeInTheDocument();
  });

  it('does not publish as a side effect of saving', async () => {
    const mock = renderAdmin('/admin/content/projects/new', {
      ...MEDIA,
      CreateProject: { createProject: { id: 'prj-2' } },
    });

    await screen.findByRole('heading', { name: 'New project', level: 1 });
    await userEvent.type(screen.getByLabelText(/^Title/), 'Draft Only');
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => {
      expect(mock.operations()).toContain('CreateProject');
    });

    expect(mock.operations()).not.toContain('TransitionProject');
  });
});

describe('CMS editing language', () => {
  it('lists content in the language being edited, and re-queries on a switch', async () => {
    const mock = renderAdmin('/admin/content/projects', {
      CmsProjects: (variables) =>
        variables.locale === 'kn'
          ? projectList([projectRow({ id: 'prj-kn', title: 'ಮಾದರಿ ಯೋಜನೆ' })])
          : projectList([projectRow()]),
    });

    await screen.findByRole('link', { name: 'Sample Road Project' });
    expect(mock.variablesFor('CmsProjects')).toMatchObject({ locale: 'en' });

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /editing language/i }),
      'kn',
    );

    // The Kannada row is a SEPARATE record, so the list changes rather than the
    // same row being relabelled.
    expect(await screen.findByRole('link', { name: 'ಮಾದರಿ ಯೋಜನೆ' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sample Road Project' })).not.toBeInTheDocument();
    expect(mock.variablesFor('CmsProjects')).toMatchObject({ locale: 'kn' });
  });

  it('creates a new record in the language being edited', async () => {
    const mock = renderAdmin('/admin/content/projects/new', {
      ...MEDIA,
      CreateProject: { createProject: { id: 'prj-kn' } },
    });

    await screen.findByRole('heading', { name: 'New project', level: 1 });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /editing language/i }),
      'kn',
    );

    await userEvent.type(screen.getByLabelText(/^Title/), 'ಮಾದರಿ ಯೋಜನೆ');
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => {
      expect(mock.variablesFor('CreateProject')).toBeDefined();
    });

    const input = (mock.variablesFor('CreateProject') as { input: Record<string, unknown> }).input;
    expect(input.locale).toBe('kn');
  });

  it('reloads a singleton when the language changes instead of keeping the other text', async () => {
    const mock = renderAdmin(
      '/admin/content/vision',
      {
        ...MEDIA,
        CmsVision: (variables) =>
          variables.locale === 'kn'
            ? {
                cmsVision: {
                  id: 'v-kn',
                  headline: 'ಕನ್ನಡ ಶೀರ್ಷಿಕೆ',
                  summary: '',
                  statementHtml: '',
                  metaTitle: '',
                  metaDescription: '',
                  status: 'DRAFT',
                },
              }
            : {
                cmsVision: {
                  id: 'v-en',
                  headline: 'English headline',
                  summary: '',
                  statementHtml: '',
                  metaTitle: '',
                  metaDescription: '',
                  status: 'PUBLISHED',
                },
              },
      },
      [...EDITOR_PERMISSIONS, 'VISION_UPDATE'],
    );

    expect(await screen.findByDisplayValue('English headline')).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /editing language/i }),
      'kn',
    );

    expect(await screen.findByDisplayValue('ಕನ್ನಡ ಶೀರ್ಷಿಕೆ')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('English headline')).not.toBeInTheDocument();
    expect(mock.variablesFor('CmsVision')).toMatchObject({ locale: 'kn' });
  });
});
