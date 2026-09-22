import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CONTENT_CATEGORIES, CONTENT_STATUSES, PROJECT_STATUSES } from '@rk/types';
import { Button } from '@rk/ui';
import {
  useCmsMutation,
  useCmsQuery,
  useUnsavedChangesWarning,
} from '../../../features/cms/useCms';
import { useCmsLocale } from '../../../features/cms/CmsLocaleContext';
import {
  CMS_PROJECT,
  CMS_PROJECTS,
  CREATE_PROJECT,
  DELETE_PROJECT,
  TRANSITION_PROJECT,
  UPDATE_PROJECT,
} from '../../../features/cms/cmsQueries';
import {
  CmsBoundary,
  CmsCard,
  CmsPageHeader,
  ConfirmDialog,
  DataTable,
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import {
  CheckboxField,
  FormActions,
  FormError,
  FormSection,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../components/cms/fields';
import { RichTextEditor } from '../../../components/cms/RichTextEditor';
import { MediaPicker } from '../../../components/cms/MediaPicker';
import { StatusPill, StatusFilter, PublishControls } from './shared';
import { formatDate } from '../../../lib/format';

/**
 * Project CMS screens.
 *
 * The reference implementation for every content type: a filterable list and a
 * form whose "save" never changes visibility. Publishing is a separate control
 * that only appears for users holding the publish permission.
 */

interface ProjectRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  area: string | null;
  projectStatus: string;
  status: string;
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

export function CmsProjectsPage() {
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ProjectRow | null>(null);
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();

  const variables = useMemo(
    () => ({ first: 50, status: status || null, search: search || null, locale }),
    [status, search, locale],
  );

  const { state, refetch } = useCmsQuery<{
    cmsProjects: { nodes: ProjectRow[]; totalCount: number };
  }>(CMS_PROJECTS, variables);

  const transition = useCmsMutation<unknown, { id: string; action: string }>(TRANSITION_PROJECT);
  const remove = useCmsMutation<unknown, { id: string }>(DELETE_PROJECT);

  const runTransition = useCallback(
    async (id: string, action: string) => {
      const result = await transition.run({ id, action });
      if (result) {
        success(action === 'PUBLISH' ? 'Published.' : 'Updated.');
        refetch();
      } else {
        failure(transition.state.error ?? 'Could not update.');
      }
    },
    [transition, refetch, success, failure],
  );

  return (
    <div className="cms-page">
      <CmsPageHeader
        title="Projects"
        description="Development projects shown under Our Work on the public site."
        localized
        actions={
          <IfPermitted permission="PROJECT_CREATE">
            <Link to="/admin/content/projects/new">
              <Button variant="primary">New project</Button>
            </Link>
          </IfPermitted>
        }
      />

      <div className="cms-filters">
        <StatusFilter value={status} onChange={setStatus} />
        <form
          role="search"
          className="cms-filters__search"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setSearch(draftSearch.trim());
          }}
        >
          <input
            className="rk-input rk-input--sm"
            type="search"
            value={draftSearch}
            aria-label="Search projects"
            placeholder="Search by title"
            onChange={(event) => setDraftSearch(event.target.value)}
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
      </div>

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.cmsProjects.nodes.length === 0}
        emptyMessage="No projects yet."
        emptyAction={
          <IfPermitted permission="PROJECT_CREATE">
            <Link to="/admin/content/projects/new">
              <Button variant="primary">Create the first project</Button>
            </Link>
          </IfPermitted>
        }
      >
        {(data) => (
          <DataTable
            caption="Projects"
            rows={data.cmsProjects.nodes}
            columns={[
              {
                key: 'title',
                header: 'Title',
                render: (row) => (
                  <Link className="cms-table__link" to={`/admin/content/projects/${row.id}`}>
                    {row.title}
                  </Link>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusPill value={row.status} />,
              },
              {
                key: 'projectStatus',
                header: 'Progress',
                secondary: true,
                render: (row) => <StatusPill value={row.projectStatus} />,
              },
              {
                key: 'area',
                header: 'Area',
                secondary: true,
                render: (row) => row.area ?? '—',
              },
              {
                key: 'updated',
                header: 'Updated',
                secondary: true,
                render: (row) => formatDate(row.updatedAt) ?? '—',
              },
            ]}
            actions={(row) => (
              <div className="cms-row-actions">
                <PublishControls
                  status={row.status}
                  publishPermission="PROJECT_PUBLISH"
                  onTransition={(action) => void runTransition(row.id, action)}
                  busy={transition.state.submitting}
                />
                {row.status === 'PUBLISHED' ? (
                  <a
                    className="cms-row-actions__link"
                    href={`/work/${row.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View
                  </a>
                ) : null}
                <IfPermitted permission="PROJECT_DELETE">
                  <button
                    type="button"
                    className="cms-row-actions__danger"
                    onClick={() => setPendingDelete(row)}
                  >
                    Delete
                  </button>
                </IfPermitted>
              </div>
            )}
          />
        )}
      </CmsBoundary>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this project?"
        message={`“${pendingDelete?.title ?? ''}” will be permanently removed. This cannot be undone.`}
        busy={remove.state.submitting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const result = await remove.run({ id: pendingDelete.id });
          setPendingDelete(null);

          if (result) {
            success('Project deleted.');
            refetch();
          } else {
            failure(remove.state.error ?? 'Could not delete.');
          }
        }}
      />

      <ToastRegion toasts={toasts} />
    </div>
  );
}

interface ProjectForm {
  title: string;
  slug: string;
  shortDescription: string;
  descriptionHtml: string;
  category: string;
  area: string;
  locationName: string;
  projectStatus: string;
  startDate: string;
  completionDate: string;
  costAmount: string;
  costCurrency: string;
  beneficiaryCount: string;
  coverImageId: string | null;
  featured: boolean;
  metaTitle: string;
  metaDescription: string;
}

const EMPTY_FORM: ProjectForm = {
  title: '',
  slug: '',
  shortDescription: '',
  descriptionHtml: '',
  category: 'OTHER',
  area: '',
  locationName: '',
  projectStatus: 'PLANNED',
  startDate: '',
  completionDate: '',
  costAmount: '',
  costCurrency: 'INR',
  beneficiaryCount: '',
  coverImageId: null,
  featured: false,
  metaTitle: '',
  metaDescription: '',
};

/** Trims a datetime to the `yyyy-mm-dd` an `<input type="date">` expects. */
function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function CmsProjectFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();

  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(isNew);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  const { state } = useCmsQuery<{ cmsProject: Record<string, unknown> }>(
    CMS_PROJECT,
    { id },
    { skip: isNew },
  );

  // Populate once from the server; later renders must not clobber edits.
  if (!loaded && state.status === 'success') {
    const project = state.data.cmsProject as Record<string, unknown>;
    setForm({
      title: String(project.title ?? ''),
      slug: String(project.slug ?? ''),
      shortDescription: String(project.shortDescription ?? ''),
      descriptionHtml: String(project.descriptionHtml ?? ''),
      category: String(project.category ?? 'OTHER'),
      area: String(project.area ?? ''),
      locationName: String(project.locationName ?? ''),
      projectStatus: String(project.projectStatus ?? 'PLANNED'),
      startDate: toDateInput(project.startDate as string | null),
      completionDate: toDateInput(project.completionDate as string | null),
      costAmount: project.costAmount === null ? '' : String(project.costAmount ?? ''),
      costCurrency: String(project.costCurrency ?? 'INR'),
      beneficiaryCount:
        project.beneficiaryCount === null ? '' : String(project.beneficiaryCount ?? ''),
      coverImageId: (project.coverImage as { id: string } | null)?.id ?? null,
      featured: Boolean(project.featured),
      metaTitle: String(project.metaTitle ?? ''),
      metaDescription: String(project.metaDescription ?? ''),
    });
    setLoaded(true);
  }

  const create = useCmsMutation<{ createProject: { id: string } }, Record<string, unknown>>(
    CREATE_PROJECT,
  );
  const update = useCmsMutation<{ updateProject: { id: string } }, Record<string, unknown>>(
    UPDATE_PROJECT,
  );

  const active = isNew ? create : update;

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    // Empty numeric fields are sent as null, never coerced to 0: "not stated"
    // and "zero" are different claims about a public project.
    const input = {
      // A translation is a sibling row, so a new record is created in whichever
      // language the CMS is currently editing.
      locale,
      title: form.title,
      slug: form.slug || null,
      shortDescription: form.shortDescription || null,
      descriptionHtml: form.descriptionHtml || null,
      category: form.category,
      area: form.area || null,
      locationName: form.locationName || null,
      projectStatus: form.projectStatus,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      completionDate: form.completionDate ? new Date(form.completionDate).toISOString() : null,
      costAmount: form.costAmount ? Number(form.costAmount) : null,
      costCurrency: form.costCurrency || null,
      beneficiaryCount: form.beneficiaryCount ? Number(form.beneficiaryCount) : null,
      coverImageId: form.coverImageId,
      featured: form.featured,
      metaTitle: form.metaTitle || null,
      metaDescription: form.metaDescription || null,
    };

    const result = isNew ? await create.run({ input }) : await update.run({ id, input });

    if (result) {
      setDirty(false);
      success('Saved as a draft. Use Publish to make it public.');
      void navigate('/admin/content/projects');
    } else {
      failure(active.state.error ?? 'Could not save.');
    }
  };

  return (
    <div className="cms-page">
      <CmsPageHeader title={isNew ? 'New project' : 'Edit project'} localized={isNew} />

      <form className="cms-form" onSubmit={handleSubmit} noValidate>
        <FormError message={active.state.error} />

        <CmsCard>
          <FormSection title="Basics">
            <TextField
              id="title"
              label="Title"
              required
              value={form.title}
              errors={active.state.fieldErrors}
              onChange={(value) => set('title', value)}
            />
            <TextField
              id="slug"
              label="Web address"
              hint="Leave blank to generate one from the title."
              value={form.slug}
              errors={active.state.fieldErrors}
              onChange={(value) => set('slug', value)}
            />
            <TextAreaField
              id="shortDescription"
              label="Short description"
              hint="Shown on cards and in search results."
              maxLength={600}
              value={form.shortDescription}
              errors={active.state.fieldErrors}
              onChange={(value) => set('shortDescription', value)}
            />
            <RichTextEditor
              id="descriptionHtml"
              label="Full description"
              hint="Formatting is limited to safe markup."
              value={form.descriptionHtml}
              onChange={(value) => set('descriptionHtml', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Classification">
            <SelectField
              id="category"
              label="Category"
              value={form.category}
              options={CONTENT_CATEGORIES.map((value) => ({
                value,
                label: value.replace('_', ' ').toLowerCase(),
              }))}
              onChange={(value) => set('category', value)}
            />
            <SelectField
              id="projectStatus"
              label="Progress"
              value={form.projectStatus}
              options={PROJECT_STATUSES.map((value) => ({
                value,
                label: value.replace('_', ' ').toLowerCase(),
              }))}
              onChange={(value) => set('projectStatus', value)}
            />
            <TextField
              id="area"
              label="Area"
              value={form.area}
              onChange={(value) => set('area', value)}
            />
            <TextField
              id="locationName"
              label="Location"
              value={form.locationName}
              onChange={(value) => set('locationName', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Dates and figures">
            <TextField
              id="startDate"
              label="Start date"
              type="date"
              value={form.startDate}
              errors={active.state.fieldErrors}
              onChange={(value) => set('startDate', value)}
            />
            <TextField
              id="completionDate"
              label="Completion date"
              type="date"
              value={form.completionDate}
              errors={active.state.fieldErrors}
              onChange={(value) => set('completionDate', value)}
            />
            <TextField
              id="costAmount"
              label="Cost"
              type="number"
              hint="Leave blank if not stated. The public page will say so rather than showing a figure."
              value={form.costAmount}
              errors={active.state.fieldErrors}
              onChange={(value) => set('costAmount', value)}
            />
            <TextField
              id="beneficiaryCount"
              label="Beneficiaries"
              type="number"
              hint="Leave blank if not measured."
              value={form.beneficiaryCount}
              errors={active.state.fieldErrors}
              onChange={(value) => set('beneficiaryCount', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Media and visibility">
            <MediaPicker
              label="Cover image"
              selectedId={form.coverImageId}
              onSelect={(mediaId) => set('coverImageId', mediaId)}
            />
            <CheckboxField
              id="featured"
              label="Feature on the homepage"
              checked={form.featured}
              onChange={(value) => set('featured', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Search engine listing">
            <TextField
              id="metaTitle"
              label="Meta title"
              hint="Defaults to the project title."
              value={form.metaTitle}
              onChange={(value) => set('metaTitle', value)}
            />
            <TextAreaField
              id="metaDescription"
              label="Meta description"
              hint="Defaults to the short description."
              maxLength={400}
              value={form.metaDescription}
              onChange={(value) => set('metaDescription', value)}
            />
          </FormSection>
        </CmsCard>

        <FormActions
          submitting={active.state.submitting}
          onCancel={() => void navigate('/admin/content/projects')}
          saveLabel={isNew ? 'Create draft' : 'Save changes'}
        />
      </form>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

export { CONTENT_STATUSES };
