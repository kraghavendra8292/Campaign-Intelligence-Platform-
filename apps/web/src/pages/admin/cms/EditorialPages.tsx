import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CONTENT_CATEGORIES, CONTENT_STATUSES, type Permission } from '@rk/types';
import { Button, Icon } from '@rk/ui';
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
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import {
  ListKpiCard,
  ListKpiGrid,
  ListSelectFilter,
  ListTableCard,
  ListToolbar,
  LIST_SEARCH_DEBOUNCE_MS,
} from '../../../components/cms/ListPro';
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
import { StatusPill } from './shared';
import { formatDate, formatDateTime } from '../../../lib/format';
import { useAdminI18n } from '../../../features/admin/AdminI18nContext';
import type { AdminStringKey } from '../../../i18n/adminStrings';

/** News and event CMS screens. Same lifecycle as projects; list uses list-pro. */

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

type ColumnKey = 'status' | 'extra' | 'updated';

function statusLabel(value: string, t: (key: AdminStringKey) => string): string {
  const key = `status.${value}` as AdminStringKey;
  const translated = t(key);
  return translated === key ? value.replace(/_/g, ' ').toLowerCase() : translated;
}

/** Shared list scaffolding for the two editorial types. */
function EditorialList({
  title,
  description,
  newPath,
  editPath,
  publicPath,
  createPermission,
  updatePermission,
  publishPermission,
  deletePermission,
  query,
  dataKey,
  transitionMutation,
  deleteMutation,
  searchLabel,
  createFirstLabel,
  extraColumn,
}: {
  title: string;
  description: string;
  newPath: string;
  editPath: (id: string) => string;
  publicPath: (slug: string) => string;
  createPermission: 'NEWS_CREATE' | 'EVENT_CREATE';
  updatePermission: 'NEWS_UPDATE' | 'EVENT_UPDATE';
  publishPermission: 'NEWS_PUBLISH' | 'EVENT_PUBLISH';
  deletePermission: 'NEWS_DELETE' | 'EVENT_DELETE';
  query: string;
  dataKey: 'cmsNews' | 'cmsEvents';
  transitionMutation: string;
  deleteMutation: string;
  searchLabel: string;
  createFirstLabel: string;
  extraColumn?: { header: string; render: (row: Row) => string };
}) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();
  const { t } = useAdminI18n();

  const columnOptions = useMemo(() => {
    const options: Array<{ key: ColumnKey; label: string }> = [
      { key: 'status', label: 'Status' },
    ];
    if (extraColumn) options.push({ key: 'extra', label: extraColumn.header });
    options.push({ key: 'updated', label: 'Updated' });
    return options;
  }, [extraColumn]);

  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({
    status: true,
    extra: Boolean(extraColumn),
    updated: true,
  });

  const variables = useMemo(
    () => ({ first: 50, status: status || null, search: search || null, locale }),
    [status, search, locale],
  );
  const { state, refetch } = useCmsQuery<Record<string, { nodes: Row[]; totalCount: number }>>(
    query,
    variables,
  );

  const transition = useCmsMutation<unknown, { id: string; action: string }>(transitionMutation);
  const remove = useCmsMutation<unknown, { id: string }>(deleteMutation);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(draftSearch.trim());
    }, LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [draftSearch]);

  useEffect(() => {
    if (state.status !== 'loading') setRefreshing(false);
  }, [state.status]);

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

  const hasFilters = Boolean(status || search);
  const filtersBusy = state.status === 'loading';

  const clearFilters = useCallback(() => {
    setStatus('');
    setSearch('');
    setDraftSearch('');
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
  }, [refetch]);

  const summary =
    state.status === 'success'
      ? {
          total: state.data[dataKey]?.totalCount ?? 0,
          published: (state.data[dataKey]?.nodes ?? []).filter((row) => row.status === 'PUBLISHED')
            .length,
          featured: (state.data[dataKey]?.nodes ?? []).filter((row) => row.featured).length,
        }
      : null;

  const nodes = state.status === 'success' ? (state.data[dataKey]?.nodes ?? []) : [];

  return (
    <div className="cms-page list-page">
      <CmsPageHeader
        title={title}
        description={description}
        localized
        backTo="/admin"
        backLabel="Back to dashboard"
        actions={
          <IfPermitted permission={createPermission}>
            <Link to={newPath}>
              <Button variant="primary">New</Button>
            </Link>
          </IfPermitted>
        }
      />

      {summary && nodes.length > 0 ? (
        <ListKpiGrid label={`${title} summary`}>
          <ListKpiCard
            label={`Total ${title.toLowerCase()}`}
            value={summary.total.toLocaleString()}
            hint={hasFilters ? 'Matching current filters' : 'In this editing language'}
          />
          <ListKpiCard
            label="Published"
            value={summary.published.toLocaleString()}
            hint={`${summary.featured.toLocaleString()} featured in this view`}
          />
        </ListKpiGrid>
      ) : null}

      <ListToolbar
        search={draftSearch}
        onSearchChange={(value) => {
          setDraftSearch(value);
          if (!value) setSearch('');
        }}
        searchLabel={searchLabel}
        filter={
          <ListSelectFilter
            label={t('filter.byStatus')}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">{t('filter.allStatuses')}</option>
            {CONTENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value, t)}
              </option>
            ))}
          </ListSelectFilter>
        }
        onRefresh={handleRefresh}
        refreshing={refreshing}
        busy={filtersBusy}
        hasFilters={hasFilters}
        onClear={clearFilters}
      />

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => (data[dataKey]?.nodes.length ?? 0) === 0}
        emptyMessage={
          hasFilters
            ? `No ${title.toLowerCase()} match these filters.`
            : `No ${title.toLowerCase()} yet.`
        }
        emptyAction={
          hasFilters ? (
            <Button type="button" variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : (
            <IfPermitted permission={createPermission}>
              <Link to={newPath}>
                <Button variant="primary">{createFirstLabel}</Button>
              </Link>
            </IfPermitted>
          )
        }
      >
        {(data) => {
          const list = data[dataKey];
          const rows = list?.nodes ?? [];
          const totalCount = list?.totalCount ?? rows.length;

          return (
            <ListTableCard
              title={title}
              count={totalCount}
              columns
              columnOptions={columnOptions}
              visibleColumns={visibleColumns}
              onToggleColumn={(key) =>
                setVisibleColumns((current) => ({
                  ...current,
                  [key]: !current[key as ColumnKey],
                }))
              }
            >
              <table className="list-table">
                <caption className="visually-hidden">{title}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="list-table__actions-col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                    <th scope="col">Title</th>
                    {visibleColumns.status ? <th scope="col">Status</th> : null}
                    {extraColumn && visibleColumns.extra ? (
                      <th scope="col" className="list-table__secondary">
                        {extraColumn.header}
                      </th>
                    ) : null}
                    {visibleColumns.updated ? (
                      <th scope="col" className="list-table__secondary list-table__metric-head">
                        Updated
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="list-table__actions-col">
                        <EditorialRowActions
                          row={row}
                          editPath={editPath}
                          publicPath={publicPath}
                          updatePermission={updatePermission}
                          publishPermission={publishPermission}
                          deletePermission={deletePermission}
                          busy={transition.state.submitting}
                          onTransition={runTransition}
                          onDelete={() => setPendingDelete(row)}
                        />
                      </td>
                      <td>
                        <div className="cms-table__primary-cell">
                          <Link className="cms-table__link" to={editPath(row.id)}>
                            {row.title}
                          </Link>
                          {row.featured ? (
                            <span className="cms-table__subtle">Featured</span>
                          ) : null}
                        </div>
                      </td>
                      {visibleColumns.status ? (
                        <td>
                          <StatusPill value={row.status} />
                        </td>
                      ) : null}
                      {extraColumn && visibleColumns.extra ? (
                        <td className="list-table__secondary">{extraColumn.render(row)}</td>
                      ) : null}
                      {visibleColumns.updated ? (
                        <td className="list-table__secondary list-table__metric">
                          {formatDate(row.updatedAt) ?? '—'}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ListTableCard>
          );
        }}
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

function EditorialRowActions({
  row,
  editPath,
  publicPath,
  updatePermission,
  publishPermission,
  deletePermission,
  busy,
  onTransition,
  onDelete,
}: {
  row: Row;
  editPath: (id: string) => string;
  publicPath: (slug: string) => string;
  updatePermission: Permission;
  publishPermission: Permission;
  deletePermission: Permission;
  busy: boolean;
  onTransition: (id: string, action: string) => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { t } = useAdminI18n();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="list-row-actions" ref={menuRef}>
      <IfPermitted permission={updatePermission}>
        <Link
          className="list-action-btn list-action-btn--edit"
          to={editPath(row.id)}
          aria-label={`Edit ${row.title}`}
          title="Edit"
        >
          <Icon name="pencil" size={1} />
        </Link>
      </IfPermitted>

      {row.status === 'PUBLISHED' ? (
        <a
          className="list-action-btn list-action-btn--view"
          href={publicPath(row.slug)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${row.title}`}
          title="View"
        >
          <Icon name="eye" size={1} />
        </a>
      ) : null}

      <IfPermitted permission={publishPermission}>
        {row.status !== 'PUBLISHED' && row.status !== 'ARCHIVED' ? (
          <button
            type="button"
            className="list-action-btn list-action-btn--activate"
            aria-label="Publish"
            title="Publish"
            disabled={busy}
            onClick={() => onTransition(row.id, 'PUBLISH')}
          >
            <Icon name="play" size={1} />
          </button>
        ) : null}
        {row.status === 'PUBLISHED' ? (
          <button
            type="button"
            className="list-action-btn list-action-btn--pause"
            aria-label="Unpublish"
            title="Unpublish"
            disabled={busy}
            onClick={() => onTransition(row.id, 'UNPUBLISH')}
          >
            <Icon name="pause" size={1} />
          </button>
        ) : null}
      </IfPermitted>

      <IfPermitted permission={deletePermission}>
        <button
          type="button"
          className="list-action-btn list-action-btn--danger"
          aria-label="Delete"
          title="Delete"
          onClick={onDelete}
        >
          <Icon name="trash" size={1} />
        </button>
      </IfPermitted>

      <div className={`cms-actions-menu${open ? ' cms-actions-menu--open' : ''}`}>
        <button
          type="button"
          className="list-action-btn list-action-btn--more"
          aria-label={`More actions for ${row.title}`}
          aria-haspopup="menu"
          aria-expanded={open}
          title="More"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="moreVertical" size={1.05} />
        </button>
        {open ? (
          <div className="cms-actions-menu__panel" role="menu">
            {row.status === 'DRAFT' ? (
              <MenuButton
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onTransition(row.id, 'SUBMIT_FOR_REVIEW');
                }}
              >
                {t('action.submitForReview')}
              </MenuButton>
            ) : null}
            <IfPermitted permission={publishPermission}>
              {row.status !== 'ARCHIVED' ? (
                <MenuButton
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    onTransition(row.id, 'ARCHIVE');
                  }}
                >
                  {t('action.archive')}
                </MenuButton>
              ) : null}
            </IfPermitted>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="cms-actions-menu__item"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
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
      updatePermission="NEWS_UPDATE"
      publishPermission="NEWS_PUBLISH"
      deletePermission="NEWS_DELETE"
      query={CMS_NEWS}
      dataKey="cmsNews"
      transitionMutation={TRANSITION_NEWS}
      deleteMutation={DELETE_NEWS}
      searchLabel="Search news"
      createFirstLabel="Create the first update"
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
      updatePermission="EVENT_UPDATE"
      publishPermission="EVENT_PUBLISH"
      deletePermission="EVENT_DELETE"
      query={CMS_EVENTS}
      dataKey="cmsEvents"
      transitionMutation={TRANSITION_EVENT}
      deleteMutation={DELETE_EVENT}
      searchLabel="Search events"
      createFirstLabel="Create the first event"
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
      <CmsPageHeader
        title={isNew ? 'New update' : 'Edit update'}
        localized={isNew}
        backTo="/admin/content/news"
        backLabel="Back to news"
      />

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
      <CmsPageHeader
        title={isNew ? 'New event' : 'Edit event'}
        localized={isNew}
        backTo="/admin/content/events"
        backLabel="Back to events"
      />

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
