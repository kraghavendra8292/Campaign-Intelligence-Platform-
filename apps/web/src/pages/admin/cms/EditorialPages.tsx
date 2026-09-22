import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CONTENT_CATEGORIES } from '@rk/types';
import { Button } from '@rk/ui';
import {
  useCmsMutation,
  useCmsQuery,
  useUnsavedChangesWarning,
} from '../../../features/cms/useCms';
import { useCmsLocale } from '../../../features/cms/CmsLocaleContext';
import {
  CANCEL_EVENT,
  CMS_EVENT,
  CMS_EVENTS,
  CMS_NEWS,
  CMS_NEWS_ARTICLE,
  CREATE_EVENT,
  CREATE_NEWS,
  DELETE_EVENT,
  DELETE_NEWS,
  TRANSITION_EVENT,
  TRANSITION_NEWS,
  UPDATE_EVENT,
  UPDATE_NEWS,
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
import { PublishControls, StatusFilter, StatusPill } from './shared';
import { formatDate, formatDateTime } from '../../../lib/format';

/** News and event CMS screens. Same lifecycle as projects. */

interface Row {
  id: string;
  slug: string;
  title: string;
  status: string;
  featured: boolean;
  updatedAt: string;
  publishedAt?: string | null;
  startsAt?: string;
  locationName?: string | null;
  eventStatus?: string;
}

/** Shared list scaffolding for the two editorial types. */
function EditorialList({
  title,
  description,
  newPath,
  editPath,
  publicPath,
  createPermission,
  publishPermission,
  deletePermission,
  query,
  dataKey,
  transitionMutation,
  deleteMutation,
  extraColumn,
}: {
  title: string;
  description: string;
  newPath: string;
  editPath: (id: string) => string;
  publicPath: (slug: string) => string;
  createPermission: 'NEWS_CREATE' | 'EVENT_CREATE';
  publishPermission: 'NEWS_PUBLISH' | 'EVENT_PUBLISH';
  deletePermission: 'NEWS_DELETE' | 'EVENT_DELETE';
  query: string;
  dataKey: 'cmsNews' | 'cmsEvents';
  transitionMutation: string;
  deleteMutation: string;
  extraColumn?: { header: string; render: (row: Row) => string };
}) {
  const [status, setStatus] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();

  const variables = useMemo(
    () => ({ first: 50, status: status || null, locale }),
    [status, locale],
  );
  const { state, refetch } = useCmsQuery<Record<string, { nodes: Row[]; totalCount: number }>>(
    query,
    variables,
  );

  const transition = useCmsMutation<unknown, { id: string; action: string }>(transitionMutation);
  const remove = useCmsMutation<unknown, { id: string }>(deleteMutation);

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
        title={title}
        description={description}
        localized
        actions={
          <IfPermitted permission={createPermission}>
            <Link to={newPath}>
              <Button variant="primary">New</Button>
            </Link>
          </IfPermitted>
        }
      />

      <div className="cms-filters">
        <StatusFilter value={status} onChange={setStatus} />
      </div>

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => (data[dataKey]?.nodes.length ?? 0) === 0}
        emptyMessage={`No ${title.toLowerCase()} yet.`}
      >
        {(data) => (
          <DataTable
            caption={title}
            rows={data[dataKey]?.nodes ?? []}
            columns={[
              {
                key: 'title',
                header: 'Title',
                render: (row) => (
                  <Link className="cms-table__link" to={editPath(row.id)}>
                    {row.title}
                  </Link>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusPill value={row.status} />,
              },
              ...(extraColumn
                ? [
                    {
                      key: 'extra',
                      header: extraColumn.header,
                      secondary: true,
                      render: (row: Row) => extraColumn.render(row),
                    },
                  ]
                : []),
              {
                key: 'updated',
                header: 'Updated',
                secondary: true,
                render: (row: Row) => formatDate(row.updatedAt) ?? '—',
              },
            ]}
            actions={(row) => (
              <div className="cms-row-actions">
                <PublishControls
                  status={row.status}
                  publishPermission={publishPermission}
                  onTransition={(action) => void runTransition(row.id, action)}
                  busy={transition.state.submitting}
                />
                {row.status === 'PUBLISHED' ? (
                  <a
                    className="cms-row-actions__link"
                    href={publicPath(row.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View
                  </a>
                ) : null}
                <IfPermitted permission={deletePermission}>
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
        title="Delete this item?"
        message={`“${pendingDelete?.title ?? ''}” will be permanently removed. This cannot be undone.`}
        busy={remove.state.submitting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const result = await remove.run({ id: pendingDelete.id });
          setPendingDelete(null);
          if (result) {
            success('Deleted.');
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

export function CmsNewsPage() {
  return (
    <EditorialList
      title="News"
      description="Announcements and updates shown on the public site."
      newPath="/admin/content/news/new"
      editPath={(id) => `/admin/content/news/${id}`}
      publicPath={(slug) => `/news/${slug}`}
      createPermission="NEWS_CREATE"
      publishPermission="NEWS_PUBLISH"
      deletePermission="NEWS_DELETE"
      query={CMS_NEWS}
      dataKey="cmsNews"
      transitionMutation={TRANSITION_NEWS}
      deleteMutation={DELETE_NEWS}
    />
  );
}

export function CmsEventsPage() {
  return (
    <EditorialList
      title="Events"
      description="Public events listed on the site. No attendance tracking."
      newPath="/admin/content/events/new"
      editPath={(id) => `/admin/content/events/${id}`}
      publicPath={(slug) => `/events/${slug}`}
      createPermission="EVENT_CREATE"
      publishPermission="EVENT_PUBLISH"
      deletePermission="EVENT_DELETE"
      query={CMS_EVENTS}
      dataKey="cmsEvents"
      transitionMutation={TRANSITION_EVENT}
      deleteMutation={DELETE_EVENT}
      extraColumn={{
        header: 'Starts',
        render: (row) => formatDateTime(row.startsAt ?? null) ?? '—',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// News form
// ---------------------------------------------------------------------------

export function CmsNewsFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();

  const [form, setForm] = useState({
    title: '',
    slug: '',
    summary: '',
    contentHtml: '',
    category: 'OTHER',
    tags: '',
    authorName: '',
    coverImageId: null as string | null,
    featured: false,
    metaTitle: '',
    metaDescription: '',
  });
  const [loaded, setLoaded] = useState(isNew);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  const { state } = useCmsQuery<{ cmsNewsArticle: Record<string, unknown> }>(
    CMS_NEWS_ARTICLE,
    { id },
    { skip: isNew },
  );

  if (!loaded && state.status === 'success') {
    const article = state.data.cmsNewsArticle;
    setForm({
      title: String(article.title ?? ''),
      slug: String(article.slug ?? ''),
      summary: String(article.summary ?? ''),
      contentHtml: String(article.contentHtml ?? ''),
      category: String(article.category ?? 'OTHER'),
      tags: Array.isArray(article.tags) ? (article.tags as string[]).join(', ') : '',
      authorName: String(article.authorName ?? ''),
      coverImageId: (article.coverImage as { id: string } | null)?.id ?? null,
      featured: Boolean(article.featured),
      metaTitle: String(article.metaTitle ?? ''),
      metaDescription: String(article.metaDescription ?? ''),
    });
    setLoaded(true);
  }

  const create = useCmsMutation<unknown, Record<string, unknown>>(CREATE_NEWS);
  const update = useCmsMutation<unknown, Record<string, unknown>>(UPDATE_NEWS);
  const active = isNew ? create : update;

  const set = (key: keyof typeof form, value: string | boolean | null) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  return (
    <div className="cms-page">
      <CmsPageHeader title={isNew ? 'New update' : 'Edit update'} localized={isNew} />

      <form
        className="cms-form"
        noValidate
        onSubmit={async (event: FormEvent) => {
          event.preventDefault();

          const input = {
            // A translation is a sibling row: create it in the language being edited.
            locale,
            title: form.title,
            slug: form.slug || null,
            summary: form.summary || null,
            contentHtml: form.contentHtml || null,
            category: form.category,
            tags: form.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
            authorName: form.authorName || null,
            coverImageId: form.coverImageId,
            featured: form.featured,
            metaTitle: form.metaTitle || null,
            metaDescription: form.metaDescription || null,
          };

          const result = isNew ? await create.run({ input }) : await update.run({ id, input });

          if (result) {
            setDirty(false);
            success('Saved as a draft.');
            void navigate('/admin/content/news');
          } else {
            failure(active.state.error ?? 'Could not save.');
          }
        }}
      >
        <FormError message={active.state.error} />

        <CmsCard>
          <FormSection title="Article">
            <TextField
              id="title"
              label="Headline"
              required
              value={form.title}
              errors={active.state.fieldErrors}
              onChange={(value) => set('title', value)}
            />
            <TextField
              id="slug"
              label="Web address"
              hint="Leave blank to generate from the headline."
              value={form.slug}
              onChange={(value) => set('slug', value)}
            />
            <TextAreaField
              id="summary"
              label="Summary"
              maxLength={600}
              value={form.summary}
              onChange={(value) => set('summary', value)}
            />
            <RichTextEditor
              id="contentHtml"
              label="Content"
              value={form.contentHtml}
              onChange={(value) => set('contentHtml', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Details">
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
            <TextField
              id="tags"
              label="Tags"
              hint="Comma separated."
              value={form.tags}
              onChange={(value) => set('tags', value)}
            />
            <TextField
              id="authorName"
              label="Byline"
              value={form.authorName}
              onChange={(value) => set('authorName', value)}
            />
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

        <FormActions
          submitting={active.state.submitting}
          onCancel={() => void navigate('/admin/content/news')}
          saveLabel={isNew ? 'Create draft' : 'Save changes'}
        />
      </form>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event form
// ---------------------------------------------------------------------------

/** Converts an ISO timestamp to the value `<input type="datetime-local">` wants. */
function toLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CmsEventFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();

  const [form, setForm] = useState({
    title: '',
    slug: '',
    summary: '',
    descriptionHtml: '',
    startsAt: '',
    endsAt: '',
    locationName: '',
    address: '',
    organizer: '',
    coverImageId: null as string | null,
    featured: false,
  });
  const [loaded, setLoaded] = useState(isNew);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  const { state } = useCmsQuery<{ cmsEvent: Record<string, unknown> }>(
    CMS_EVENT,
    { id },
    { skip: isNew },
  );

  if (!loaded && state.status === 'success') {
    const event = state.data.cmsEvent;
    setForm({
      title: String(event.title ?? ''),
      slug: String(event.slug ?? ''),
      summary: String(event.summary ?? ''),
      descriptionHtml: String(event.descriptionHtml ?? ''),
      startsAt: toLocalInput(event.startsAt as string),
      endsAt: toLocalInput(event.endsAt as string | null),
      locationName: String(event.locationName ?? ''),
      address: String(event.address ?? ''),
      organizer: String(event.organizer ?? ''),
      coverImageId: (event.coverImage as { id: string } | null)?.id ?? null,
      featured: Boolean(event.featured),
    });
    setLoaded(true);
  }

  const create = useCmsMutation<unknown, Record<string, unknown>>(CREATE_EVENT);
  const update = useCmsMutation<unknown, Record<string, unknown>>(UPDATE_EVENT);
  const cancel = useCmsMutation<unknown, { id: string }>(CANCEL_EVENT);
  const active = isNew ? create : update;

  const set = (key: keyof typeof form, value: string | boolean | null) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  return (
    <div className="cms-page">
      <CmsPageHeader title={isNew ? 'New event' : 'Edit event'} localized={isNew} />

      <form
        className="cms-form"
        noValidate
        onSubmit={async (event: FormEvent) => {
          event.preventDefault();

          const input = {
            // A translation is a sibling row: create it in the language being edited.
            locale,
            title: form.title,
            slug: form.slug || null,
            summary: form.summary || null,
            descriptionHtml: form.descriptionHtml || null,
            startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
            endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
            locationName: form.locationName || null,
            address: form.address || null,
            organizer: form.organizer || null,
            coverImageId: form.coverImageId,
            featured: form.featured,
          };

          const result = isNew ? await create.run({ input }) : await update.run({ id, input });

          if (result) {
            setDirty(false);
            success('Saved as a draft.');
            void navigate('/admin/content/events');
          } else {
            failure(active.state.error ?? 'Could not save.');
          }
        }}
      >
        <FormError message={active.state.error} />

        <CmsCard>
          <FormSection title="Event">
            <TextField
              id="title"
              label="Title"
              required
              value={form.title}
              errors={active.state.fieldErrors}
              onChange={(value) => set('title', value)}
            />
            <TextAreaField
              id="summary"
              label="Summary"
              maxLength={600}
              value={form.summary}
              onChange={(value) => set('summary', value)}
            />
            <RichTextEditor
              id="descriptionHtml"
              label="Description"
              value={form.descriptionHtml}
              onChange={(value) => set('descriptionHtml', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="When and where">
            <TextField
              id="startsAt"
              label="Starts"
              type="datetime-local"
              required
              value={form.startsAt}
              errors={active.state.fieldErrors}
              onChange={(value) => set('startsAt', value)}
            />
            <TextField
              id="endsAt"
              label="Ends"
              type="datetime-local"
              value={form.endsAt}
              errors={active.state.fieldErrors}
              onChange={(value) => set('endsAt', value)}
            />
            <TextField
              id="locationName"
              label="Location"
              value={form.locationName}
              onChange={(value) => set('locationName', value)}
            />
            <TextField
              id="address"
              label="Address"
              value={form.address}
              onChange={(value) => set('address', value)}
            />
            <TextField
              id="organizer"
              label="Organiser"
              value={form.organizer}
              onChange={(value) => set('organizer', value)}
            />
            <MediaPicker
              label="Cover image"
              selectedId={form.coverImageId}
              onSelect={(mediaId) => set('coverImageId', mediaId)}
            />
          </FormSection>
        </CmsCard>

        <FormActions
          submitting={active.state.submitting}
          onCancel={() => void navigate('/admin/content/events')}
          saveLabel={isNew ? 'Create draft' : 'Save changes'}
          extra={
            !isNew ? (
              <IfPermitted permission="EVENT_UPDATE">
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={cancel.state.submitting}
                  onClick={async () => {
                    const result = await cancel.run({ id: id ?? '' });
                    if (result) success('Event marked as cancelled.');
                    else failure('Could not cancel the event.');
                  }}
                >
                  Mark as cancelled
                </Button>
              </IfPermitted>
            ) : null
          }
        />
      </form>

      <ToastRegion toasts={toasts} />
    </div>
  );
}
