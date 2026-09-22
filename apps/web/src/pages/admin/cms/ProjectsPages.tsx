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
import { CONTENT_CATEGORIES, CONTENT_STATUSES, PROJECT_STATUSES } from '@rk/types';
import { Button, Icon } from '@rk/ui';
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
  SET_PROJECT_MEDIA,
  TRANSITION_PROJECT,
  UPDATE_PROJECT,
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
import {
  ProjectMediaGallery,
  type ProjectMediaItem,
} from '../../../components/cms/ProjectMediaGallery';
import { StatusPill } from './shared';
import { formatDate } from '../../../lib/format';
import { useAdminI18n } from '../../../features/admin/AdminI18nContext';
import type { AdminStringKey } from '../../../i18n/adminStrings';

/**
 * Project CMS screens.
 *
 * List uses the console list-pro pattern (KPI cards, toolbar, icon actions).
 * The form is the full admin editor: text, cover, gallery / before / after
 * images, and the figures the public work page needs.
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

const SEARCH_DEBOUNCE_MS = 300;

type ColumnKey = 'status' | 'progress' | 'area' | 'category' | 'updated';

const COLUMN_OPTIONS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'progress', label: 'Progress' },
  { key: 'area', label: 'Area' },
  { key: 'category', label: 'Category' },
  { key: 'updated', label: 'Updated' },
];

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  status: true,
  progress: true,
  area: true,
  category: false,
  updated: true,
};

function statusLabel(value: string, t: (key: AdminStringKey) => string): string {
  const key = `status.${value}` as AdminStringKey;
  const translated = t(key);
  return translated === key ? value.replace(/_/g, ' ').toLowerCase() : translated;
}

export function CmsProjectsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS);
  const [pendingDelete, setPendingDelete] = useState<ProjectRow | null>(null);
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();
  const { t } = useAdminI18n();
  const columnsRef = useRef<HTMLDivElement>(null);

  const variables = useMemo(
    () => ({ first: 50, status: status || null, search: search || null, locale }),
    [status, search, locale],
  );

  const { state, refetch } = useCmsQuery<{
    cmsProjects: { nodes: ProjectRow[]; totalCount: number };
  }>(CMS_PROJECTS, variables);

  const transition = useCmsMutation<unknown, { id: string; action: string }>(TRANSITION_PROJECT);
  const remove = useCmsMutation<unknown, { id: string }>(DELETE_PROJECT);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(draftSearch.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [draftSearch]);

  useEffect(() => {
    if (state.status !== 'loading') setRefreshing(false);
  }, [state.status]);

  useEffect(() => {
    if (!columnsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && columnsRef.current && !columnsRef.current.contains(target)) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [columnsOpen]);

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
          total: state.data.cmsProjects.totalCount,
          published: state.data.cmsProjects.nodes.filter((row) => row.status === 'PUBLISHED')
            .length,
          featured: state.data.cmsProjects.nodes.filter((row) => row.featured).length,
          inProgress: state.data.cmsProjects.nodes.filter(
            (row) => row.projectStatus === 'IN_PROGRESS',
          ).length,
        }
      : null;

  return (
    <div className="cms-page list-page">
      <CmsPageHeader
        title="Projects"
        description="Development projects shown under Our Work on the public site. Edit any row to change text, figures, and images."
        localized
        backTo="/admin"
        backLabel="Back to dashboard"
        actions={
          <IfPermitted permission="PROJECT_CREATE">
            <Link to="/admin/content/projects/new">
              <Button variant="primary">New project</Button>
            </Link>
          </IfPermitted>
        }
      />

      {summary && state.status === 'success' && state.data.cmsProjects.nodes.length > 0 ? (
        <div className="list-kpi-grid" role="group" aria-label="Projects summary">
          <article className="list-kpi-card">
            <p className="list-kpi-card__label">Total projects</p>
            <p className="list-kpi-card__value">{summary.total.toLocaleString()}</p>
            <p className="list-kpi-card__hint">
              {hasFilters ? 'Matching current filters' : 'In this editing language'}
            </p>
          </article>
          <article className="list-kpi-card">
            <p className="list-kpi-card__label">Published</p>
            <p className="list-kpi-card__value">{summary.published.toLocaleString()}</p>
            <p className="list-kpi-card__hint">
              {summary.featured.toLocaleString()} featured in this view
            </p>
          </article>
          <article className="list-kpi-card">
            <p className="list-kpi-card__label">In progress</p>
            <p className="list-kpi-card__value">{summary.inProgress.toLocaleString()}</p>
            <p className="list-kpi-card__hint">Work underway in this view</p>
          </article>
        </div>
      ) : null}

      <div className="list-toolbar">
        <div className="list-toolbar__left">
          <label className="cms-search-field cms-search-field--toolbar">
            <Icon name="search" size={1} className="cms-search-field__icon" />
            <span className="visually-hidden">Search projects</span>
            <input
              className="cms-search-field__input"
              type="search"
              value={draftSearch}
              placeholder="Search"
              autoComplete="off"
              onChange={(event) => setDraftSearch(event.target.value)}
            />
            {draftSearch ? (
              <button
                type="button"
                className="cms-search-field__clear"
                aria-label="Clear search"
                onClick={() => {
                  setDraftSearch('');
                  setSearch('');
                }}
              >
                <Icon name="close" size={0.9} />
              </button>
            ) : null}
          </label>

          <label className="list-toolbar__select">
            <span className="visually-hidden">{t('filter.byStatus')}</span>
            <select
              className="list-toolbar__select-control"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">{t('filter.allStatuses')}</option>
              {CONTENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value, t)}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={0.9} className="list-toolbar__select-icon" />
          </label>

          <button
            type="button"
            className={`cms-icon-btn${refreshing ? ' cms-icon-btn--busy' : ''}`}
            aria-label="Refresh projects"
            title="Refresh"
            disabled={filtersBusy}
            onClick={handleRefresh}
          >
            <Icon name="refresh" size={1.05} />
          </button>

          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>

        <div className="list-toolbar__right">
          <button
            type="button"
            className={`cms-icon-btn cms-icon-btn--square${refreshing ? ' cms-icon-btn--busy' : ''}`}
            aria-label="Refresh list"
            title="Refresh"
            disabled={filtersBusy}
            onClick={handleRefresh}
          >
            <Icon name="refresh" size={1.15} />
          </button>
        </div>
      </div>

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.cmsProjects.nodes.length === 0}
        emptyMessage={
          hasFilters
            ? 'No projects match these filters.'
            : 'No projects yet.'
        }
        emptyAction={
          hasFilters ? (
            <Button type="button" variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : (
            <IfPermitted permission="PROJECT_CREATE">
              <Link to="/admin/content/projects/new">
                <Button variant="primary">Create the first project</Button>
              </Link>
            </IfPermitted>
          )
        }
      >
        {(data) => (
          <section className="list-table-card">
            <header className="list-table-card__header">
              <h2 className="list-table-card__title">
                Projects
                <span className="list-table-card__count">
                  ({data.cmsProjects.totalCount.toLocaleString()}{' '}
                  {data.cmsProjects.totalCount === 1 ? 'row' : 'rows'})
                </span>
              </h2>

              <div className="list-table-card__tools" ref={columnsRef}>
                <button
                  type="button"
                  className="list-columns-btn"
                  aria-haspopup="menu"
                  aria-expanded={columnsOpen}
                  onClick={() => setColumnsOpen((value) => !value)}
                >
                  <Icon name="columns" size={1} />
                  Columns
                </button>
                {columnsOpen ? (
                  <div className="list-columns-menu" role="menu">
                    {COLUMN_OPTIONS.map((column) => (
                      <label key={column.key} className="list-columns-menu__item">
                        <input
                          type="checkbox"
                          checked={visibleColumns[column.key]}
                          onChange={() =>
                            setVisibleColumns((current) => ({
                              ...current,
                              [column.key]: !current[column.key],
                            }))
                          }
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </header>

            <div className="list-table-scroll">
              <table className="list-table">
                <caption className="visually-hidden">Projects</caption>
                <thead>
                  <tr>
                    <th scope="col" className="list-table__actions-col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                    <th scope="col">Title</th>
                    {visibleColumns.status ? <th scope="col">Status</th> : null}
                    {visibleColumns.progress ? <th scope="col">Progress</th> : null}
                    {visibleColumns.area ? (
                      <th scope="col" className="list-table__secondary">
                        Area
                      </th>
                    ) : null}
                    {visibleColumns.category ? (
                      <th scope="col" className="list-table__secondary">
                        Category
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
                  {data.cmsProjects.nodes.map((row) => (
                    <tr key={row.id}>
                      <td className="list-table__actions-col">
                        <ProjectRowActions
                          row={row}
                          busy={transition.state.submitting}
                          onTransition={runTransition}
                          onDelete={() => setPendingDelete(row)}
                        />
                      </td>
                      <td>
                        <div className="cms-table__primary-cell">
                          <Link
                            className="cms-table__link"
                            to={`/admin/content/projects/${row.id}`}
                          >
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
                      {visibleColumns.progress ? (
                        <td>
                          <StatusPill value={row.projectStatus} />
                        </td>
                      ) : null}
                      {visibleColumns.area ? (
                        <td className="list-table__secondary">{row.area ?? '—'}</td>
                      ) : null}
                      {visibleColumns.category ? (
                        <td className="list-table__secondary">
                          {row.category.replace(/_/g, ' ').toLowerCase()}
                        </td>
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
            </div>
          </section>
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

function ProjectRowActions({
  row,
  busy,
  onTransition,
  onDelete,
}: {
  row: ProjectRow;
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
      <IfPermitted permission="PROJECT_UPDATE">
        <Link
          className="list-action-btn list-action-btn--edit"
          to={`/admin/content/projects/${row.id}`}
          aria-label={`Edit ${row.title}`}
          title="Edit"
        >
          <Icon name="pencil" size={1} />
        </Link>
      </IfPermitted>

      {row.status === 'PUBLISHED' ? (
        <a
          className="list-action-btn list-action-btn--view"
          href={`/work/${row.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${row.title}`}
          title="View"
        >
          <Icon name="eye" size={1} />
        </a>
      ) : null}

      <IfPermitted permission="PROJECT_PUBLISH">
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

      <IfPermitted permission="PROJECT_DELETE">
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
            <IfPermitted permission="PROJECT_PUBLISH">
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

interface ProjectForm {
  title: string;
  slug: string;
  shortDescription: string;
  descriptionHtml: string;
  category: string;
  area: string;
  locationName: string;
  latitude: string;
  longitude: string;
  projectStatus: string;
  startDate: string;
  completionDate: string;
  costAmount: string;
  costCurrency: string;
  beneficiaryCount: string;
  coverImageId: string | null;
  featured: boolean;
  displayOrder: string;
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
  latitude: '',
  longitude: '',
  projectStatus: 'PLANNED',
  startDate: '',
  completionDate: '',
  costAmount: '',
  costCurrency: 'INR',
  beneficiaryCount: '',
  coverImageId: null,
  featured: false,
  displayOrder: '0',
  metaTitle: '',
  metaDescription: '',
};

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function toCoordInput(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export function CmsProjectFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();

  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [mediaItems, setMediaItems] = useState<ProjectMediaItem[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  const { state } = useCmsQuery<{ cmsProject: Record<string, unknown> }>(
    CMS_PROJECT,
    { id },
    { skip: isNew },
  );

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
      latitude: toCoordInput(project.latitude),
      longitude: toCoordInput(project.longitude),
      projectStatus: String(project.projectStatus ?? 'PLANNED'),
      startDate: toDateInput(project.startDate as string | null),
      completionDate: toDateInput(project.completionDate as string | null),
      costAmount: project.costAmount === null ? '' : String(project.costAmount ?? ''),
      costCurrency: String(project.costCurrency ?? 'INR'),
      beneficiaryCount:
        project.beneficiaryCount === null ? '' : String(project.beneficiaryCount ?? ''),
      coverImageId: (project.coverImage as { id: string } | null)?.id ?? null,
      featured: Boolean(project.featured),
      displayOrder: String(project.displayOrder ?? 0),
      metaTitle: String(project.metaTitle ?? ''),
      metaDescription: String(project.metaDescription ?? ''),
    });

    const media = Array.isArray(project.media) ? project.media : [];
    setMediaItems(
      media.map((entry, index) => {
        const row = entry as {
          id?: string;
          role: ProjectMediaItem['role'];
          caption?: string | null;
          image?: { id: string; altText?: string | null };
        };
        return {
          key: row.id ?? `loaded-${index}`,
          mediaId: row.image?.id ?? '',
          role: row.role,
          caption: row.caption ?? '',
          altText: row.image?.altText ?? null,
        };
      }).filter((item) => item.mediaId),
    );
    setLoaded(true);
  }

  const create = useCmsMutation<{ createProject: { id: string } }, Record<string, unknown>>(
    CREATE_PROJECT,
  );
  const update = useCmsMutation<{ updateProject: { id: string } }, Record<string, unknown>>(
    UPDATE_PROJECT,
  );
  const setMedia = useCmsMutation<unknown, { id: string; media: unknown[] }>(SET_PROJECT_MEDIA);

  const active = isNew ? create : update;
  const submitting = active.state.submitting || setMedia.state.submitting;

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const handleMediaChange = (next: ProjectMediaItem[]) => {
    setMediaItems(next);
    setDirty(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const input = {
      locale,
      title: form.title,
      slug: form.slug || null,
      shortDescription: form.shortDescription || null,
      descriptionHtml: form.descriptionHtml || null,
      category: form.category,
      area: form.area || null,
      locationName: form.locationName || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      projectStatus: form.projectStatus,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      completionDate: form.completionDate ? new Date(form.completionDate).toISOString() : null,
      costAmount: form.costAmount ? Number(form.costAmount) : null,
      costCurrency: form.costCurrency || null,
      beneficiaryCount: form.beneficiaryCount ? Number(form.beneficiaryCount) : null,
      coverImageId: form.coverImageId,
      featured: form.featured,
      displayOrder: form.displayOrder ? Number(form.displayOrder) : 0,
      metaTitle: form.metaTitle || null,
      metaDescription: form.metaDescription || null,
    };

    const result = isNew ? await create.run({ input }) : await update.run({ id, input });

    if (!result) {
      failure(active.state.error ?? 'Could not save.');
      return;
    }

    const projectId = isNew
      ? (result as { createProject: { id: string } }).createProject.id
      : (id as string);

    const mediaPayload = mediaItems.map((item) => ({
      mediaId: item.mediaId,
      role: item.role,
      caption: item.caption || null,
    }));

    const mediaResult = await setMedia.run({ id: projectId, media: mediaPayload });
    if (!mediaResult) {
      failure(setMedia.state.error ?? 'Project saved, but images could not be updated.');
      return;
    }

    setDirty(false);
    success('Saved as a draft. Use Publish to make it public.');
    void navigate('/admin/content/projects');
  };

  return (
    <div className="cms-page">
      <CmsPageHeader
        title={isNew ? 'New project' : 'Edit project'}
        description={
          isNew
            ? 'Create a draft. You can add gallery and before/after photos after the basics are in place.'
            : 'Update text, figures, cover, and gallery images. Clearing a field removes it from the public page.'
        }
        localized
        backTo="/admin/content/projects"
        backLabel="Back to projects"
      />

      <form className="cms-form" onSubmit={handleSubmit} noValidate>
        <FormError message={active.state.error ?? setMedia.state.error} />

        <CmsCard>
          <FormSection title="Basics">
            <TextField
              id="title"
              label="Title"
              required
              hint="Required. Shown as the project headline on the public site."
              value={form.title}
              errors={active.state.fieldErrors}
              onChange={(value) => set('title', value)}
            />
            <TextField
              id="slug"
              label="Web address"
              hint="Leave blank to generate one from the title. Changing it updates the public URL."
              value={form.slug}
              errors={active.state.fieldErrors}
              onChange={(value) => set('slug', value)}
            />
            <TextAreaField
              id="shortDescription"
              label="Short description"
              hint="Shown on cards and in search results. Clear the field to remove it."
              maxLength={600}
              value={form.shortDescription}
              errors={active.state.fieldErrors}
              onChange={(value) => set('shortDescription', value)}
            />
            <RichTextEditor
              id="descriptionHtml"
              label="Full description"
              hint="Formatting is limited to safe markup. Clear the editor to remove the long description."
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
                label: value.replace(/_/g, ' ').toLowerCase(),
              }))}
              onChange={(value) => set('category', value)}
            />
            <SelectField
              id="projectStatus"
              label="Progress"
              hint="Where the work stands on the ground (separate from draft/publish)."
              value={form.projectStatus}
              options={PROJECT_STATUSES.map((value) => ({
                value,
                label: value.replace(/_/g, ' ').toLowerCase(),
              }))}
              onChange={(value) => set('projectStatus', value)}
            />
            <TextField
              id="area"
              label="Area"
              hint="Ward, constituency, or region. Clear to hide."
              value={form.area}
              onChange={(value) => set('area', value)}
            />
            <TextField
              id="locationName"
              label="Location"
              hint="Place name shown to the public. Clear to hide."
              value={form.locationName}
              onChange={(value) => set('locationName', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Dates, cost and map">
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
            <SelectField
              id="costCurrency"
              label="Currency"
              value={form.costCurrency}
              options={[
                { value: 'INR', label: 'INR' },
                { value: 'USD', label: 'USD' },
              ]}
              onChange={(value) => set('costCurrency', value)}
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
            <TextField
              id="latitude"
              label="Latitude"
              type="number"
              hint="Optional map pin. Clear both coordinates to remove it."
              value={form.latitude}
              onChange={(value) => set('latitude', value)}
            />
            <TextField
              id="longitude"
              label="Longitude"
              type="number"
              value={form.longitude}
              onChange={(value) => set('longitude', value)}
            />
            <TextField
              id="displayOrder"
              label="Display order"
              type="number"
              hint="Lower numbers appear first in lists. Default is 0."
              value={form.displayOrder}
              onChange={(value) => set('displayOrder', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Cover image">
            <MediaPicker
              label="Cover image"
              selectedId={form.coverImageId}
              onSelect={(mediaId) => set('coverImageId', mediaId)}
            />
            <p className="cms-field__hint">
              The main photo on cards and the project page. Use Remove to clear it.
            </p>
            <CheckboxField
              id="featured"
              label="Feature on the homepage"
              checked={form.featured}
              onChange={(value) => set('featured', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Gallery and before / after">
            <p className="cms-field__hint">
              Add or remove photos for the public gallery. Changes are saved with the project.
            </p>
            <ProjectMediaGallery items={mediaItems} onChange={handleMediaChange} />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Search engine listing">
            <TextField
              id="metaTitle"
              label="Meta title"
              hint="Defaults to the project title. Clear to use the default."
              value={form.metaTitle}
              onChange={(value) => set('metaTitle', value)}
            />
            <TextAreaField
              id="metaDescription"
              label="Meta description"
              hint="Defaults to the short description. Clear to use the default."
              maxLength={400}
              value={form.metaDescription}
              onChange={(value) => set('metaDescription', value)}
            />
          </FormSection>
        </CmsCard>

        <FormActions
          submitting={submitting}
          onCancel={() => void navigate('/admin/content/projects')}
          saveLabel={isNew ? 'Create draft' : 'Save changes'}
        />
      </form>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

export { CONTENT_STATUSES };
