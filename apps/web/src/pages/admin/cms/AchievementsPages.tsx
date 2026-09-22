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
import { CONTENT_CATEGORIES, CONTENT_STATUSES, VERIFICATION_STATUSES } from '@rk/types';
import { Button, Icon } from '@rk/ui';
import {
  useCmsMutation,
  useCmsQuery,
  useUnsavedChangesWarning,
} from '../../../features/cms/useCms';
import { useCmsLocale } from '../../../features/cms/CmsLocaleContext';
import {
  CMS_ACHIEVEMENT,
  CMS_ACHIEVEMENTS,
  CREATE_ACHIEVEMENT,
  DELETE_ACHIEVEMENT,
  TRANSITION_ACHIEVEMENT,
  UPDATE_ACHIEVEMENT,
  VERIFY_ACHIEVEMENT,
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
import { formatDate } from '../../../lib/format';
import { useAdminI18n } from '../../../features/admin/AdminI18nContext';
import type { AdminStringKey } from '../../../i18n/adminStrings';

/**
 * Achievement CMS screens.
 *
 * The one place the CMS distinguishes **verifying** from **publishing**.
 * Verification is a claim that staff checked the evidence, so the control is
 * separate, needs ACHIEVEMENT_VERIFY, and the form says plainly that editing a
 * verified achievement sends it back for re-checking.
 *
 * List uses the console list-pro pattern (KPI cards, toolbar, icon actions).
 */

interface AchievementRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  area: string | null;
  achievedOn: string | null;
  verification: string;
  status: string;
  featured: boolean;
  updatedAt: string;
}

type ColumnKey = 'status' | 'verification' | 'date' | 'area';

const COLUMN_OPTIONS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'verification', label: 'Verification' },
  { key: 'date', label: 'Date' },
  { key: 'area', label: 'Area' },
];

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  status: true,
  verification: true,
  date: true,
  area: false,
};

function statusLabel(value: string, t: (key: AdminStringKey) => string): string {
  const key = `status.${value}` as AdminStringKey;
  const translated = t(key);
  return translated === key ? value.replace(/_/g, ' ').toLowerCase() : translated;
}

export function CmsAchievementsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS);
  const [pendingDelete, setPendingDelete] = useState<AchievementRow | null>(null);
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();
  const { t } = useAdminI18n();

  const variables = useMemo(
    () => ({ first: 50, status: status || null, search: search || null, locale }),
    [status, search, locale],
  );

  const { state, refetch } = useCmsQuery<{
    cmsAchievements: { nodes: AchievementRow[]; totalCount: number };
  }>(CMS_ACHIEVEMENTS, variables);

  const transition = useCmsMutation<unknown, { id: string; action: string }>(
    TRANSITION_ACHIEVEMENT,
  );
  const verify = useCmsMutation<unknown, { id: string; verification: string }>(VERIFY_ACHIEVEMENT);
  const remove = useCmsMutation<unknown, { id: string }>(DELETE_ACHIEVEMENT);

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

  const runVerify = useCallback(
    async (id: string) => {
      const result = await verify.run({ id, verification: 'VERIFIED' });
      if (result) {
        success('Marked as verified.');
        refetch();
      } else {
        failure(verify.state.error ?? 'Could not verify.');
      }
    },
    [verify, refetch, success, failure],
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
          total: state.data.cmsAchievements.totalCount,
          published: state.data.cmsAchievements.nodes.filter((row) => row.status === 'PUBLISHED')
            .length,
          featured: state.data.cmsAchievements.nodes.filter((row) => row.featured).length,
          verified: state.data.cmsAchievements.nodes.filter((row) => row.verification === 'VERIFIED')
            .length,
        }
      : null;

  return (
    <div className="cms-page list-page">
      <CmsPageHeader
        title="Achievements"
        description="Completed work and outcomes. Verification is separate from publishing."
        localized
        backTo="/admin"
        backLabel="Back to dashboard"
        actions={
          <IfPermitted permission="ACHIEVEMENT_CREATE">
            <Link to="/admin/content/achievements/new">
              <Button variant="primary">New achievement</Button>
            </Link>
          </IfPermitted>
        }
      />

      {summary && state.status === 'success' && state.data.cmsAchievements.nodes.length > 0 ? (
        <ListKpiGrid label="Achievements summary">
          <ListKpiCard
            label="Total achievements"
            value={summary.total.toLocaleString()}
            hint={hasFilters ? 'Matching current filters' : 'In this editing language'}
          />
          <ListKpiCard
            label="Published"
            value={summary.published.toLocaleString()}
            hint={`${summary.featured.toLocaleString()} featured in this view`}
          />
          <ListKpiCard
            label="Verified"
            value={summary.verified.toLocaleString()}
            hint="Evidence checked in this view"
          />
        </ListKpiGrid>
      ) : null}

      <ListToolbar
        search={draftSearch}
        onSearchChange={(value) => {
          setDraftSearch(value);
          if (!value) setSearch('');
        }}
        searchLabel="Search achievements"
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
        isEmpty={(data) => data.cmsAchievements.nodes.length === 0}
        emptyMessage={
          hasFilters ? 'No achievements match these filters.' : 'No achievements yet.'
        }
        emptyAction={
          hasFilters ? (
            <Button type="button" variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : (
            <IfPermitted permission="ACHIEVEMENT_CREATE">
              <Link to="/admin/content/achievements/new">
                <Button variant="primary">Create the first achievement</Button>
              </Link>
            </IfPermitted>
          )
        }
      >
        {(data) => (
          <ListTableCard
            title="Achievements"
            count={data.cmsAchievements.totalCount}
            columns
            columnOptions={COLUMN_OPTIONS}
            visibleColumns={visibleColumns}
            onToggleColumn={(key) =>
              setVisibleColumns((current) => ({
                ...current,
                [key]: !current[key as ColumnKey],
              }))
            }
          >
            <table className="list-table">
              <caption className="visually-hidden">Achievements</caption>
              <thead>
                <tr>
                  <th scope="col" className="list-table__actions-col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                  <th scope="col">Title</th>
                  {visibleColumns.status ? <th scope="col">Status</th> : null}
                  {visibleColumns.verification ? <th scope="col">Verification</th> : null}
                  {visibleColumns.date ? (
                    <th scope="col" className="list-table__secondary">
                      Date
                    </th>
                  ) : null}
                  {visibleColumns.area ? (
                    <th scope="col" className="list-table__secondary">
                      Area
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {data.cmsAchievements.nodes.map((row) => (
                  <tr key={row.id}>
                    <td className="list-table__actions-col">
                      <AchievementRowActions
                        row={row}
                        busy={transition.state.submitting || verify.state.submitting}
                        onTransition={runTransition}
                        onVerify={runVerify}
                        onDelete={() => setPendingDelete(row)}
                      />
                    </td>
                    <td>
                      <div className="cms-table__primary-cell">
                        <Link
                          className="cms-table__link"
                          to={`/admin/content/achievements/${row.id}`}
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
                    {visibleColumns.verification ? (
                      <td>
                        <StatusPill value={row.verification} />
                      </td>
                    ) : null}
                    {visibleColumns.date ? (
                      <td className="list-table__secondary">
                        {formatDate(row.achievedOn) ?? '—'}
                      </td>
                    ) : null}
                    {visibleColumns.area ? (
                      <td className="list-table__secondary">{row.area ?? '—'}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </ListTableCard>
        )}
      </CmsBoundary>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this achievement?"
        message={`“${pendingDelete?.title ?? ''}” and its evidence will be permanently removed.`}
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

function AchievementRowActions({
  row,
  busy,
  onTransition,
  onVerify,
  onDelete,
}: {
  row: AchievementRow;
  busy: boolean;
  onTransition: (id: string, action: string) => void;
  onVerify: (id: string) => void;
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
      <IfPermitted permission="ACHIEVEMENT_UPDATE">
        <Link
          className="list-action-btn list-action-btn--edit"
          to={`/admin/content/achievements/${row.id}`}
          aria-label={`Edit ${row.title}`}
          title="Edit"
        >
          <Icon name="pencil" size={1} />
        </Link>
      </IfPermitted>

      {row.status === 'PUBLISHED' ? (
        <a
          className="list-action-btn list-action-btn--view"
          href={`/achievements/${row.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${row.title}`}
          title="View"
        >
          <Icon name="eye" size={1} />
        </a>
      ) : null}

      <IfPermitted permission="ACHIEVEMENT_PUBLISH">
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

      <IfPermitted permission="ACHIEVEMENT_DELETE">
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
            <IfPermitted permission="ACHIEVEMENT_VERIFY">
              {row.verification !== 'VERIFIED' ? (
                <MenuButton
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    onVerify(row.id);
                  }}
                >
                  Mark verified
                </MenuButton>
              ) : null}
            </IfPermitted>
            <IfPermitted permission="ACHIEVEMENT_PUBLISH">
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

export function CmsAchievementFormPage() {
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
    category: 'OTHER',
    area: '',
    achievedOn: '',
    coverImageId: null as string | null,
    featured: false,
    metaTitle: '',
    metaDescription: '',
  });
  const [verification, setVerification] = useState('UNVERIFIED');
  const [loaded, setLoaded] = useState(isNew);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  const { state, refetch } = useCmsQuery<{ cmsAchievement: Record<string, unknown> }>(
    CMS_ACHIEVEMENT,
    { id },
    { skip: isNew },
  );

  if (!loaded && state.status === 'success') {
    const item = state.data.cmsAchievement;
    setForm({
      title: String(item.title ?? ''),
      slug: String(item.slug ?? ''),
      summary: String(item.summary ?? ''),
      descriptionHtml: String(item.descriptionHtml ?? ''),
      category: String(item.category ?? 'OTHER'),
      area: String(item.area ?? ''),
      achievedOn: item.achievedOn ? String(item.achievedOn).slice(0, 10) : '',
      coverImageId: (item.coverImage as { id: string } | null)?.id ?? null,
      featured: Boolean(item.featured),
      metaTitle: String(item.metaTitle ?? ''),
      metaDescription: String(item.metaDescription ?? ''),
    });
    setVerification(String(item.verification ?? 'UNVERIFIED'));
    setLoaded(true);
  }

  const create = useCmsMutation<unknown, Record<string, unknown>>(CREATE_ACHIEVEMENT);
  const update = useCmsMutation<unknown, Record<string, unknown>>(UPDATE_ACHIEVEMENT);
  const verify = useCmsMutation<unknown, { id: string; verification: string }>(VERIFY_ACHIEVEMENT);
  const active = isNew ? create : update;

  const set = (key: keyof typeof form, value: string | boolean | null) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  return (
    <div className="cms-page">
      <CmsPageHeader
        title={isNew ? 'New achievement' : 'Edit achievement'}
        localized={isNew}
        backTo="/admin/content/achievements"
        backLabel="Back to achievements"
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
            category: form.category,
            area: form.area || null,
            achievedOn: form.achievedOn ? new Date(form.achievedOn).toISOString() : null,
            coverImageId: form.coverImageId,
            featured: form.featured,
            metaTitle: form.metaTitle || null,
            metaDescription: form.metaDescription || null,
          };

          const result = isNew ? await create.run({ input }) : await update.run({ id, input });

          if (result) {
            setDirty(false);
            success('Saved as a draft.');
            void navigate('/admin/content/achievements');
          } else {
            failure(active.state.error ?? 'Could not save.');
          }
        }}
      >
        <FormError message={active.state.error} />

        {!isNew && verification === 'VERIFIED' ? (
          <p className="cms-notice" role="status">
            This achievement is marked verified. Saving changes will send it back for
            re-verification, because the check no longer applies to the edited text.
          </p>
        ) : null}

        <CmsCard>
          <FormSection title="Achievement">
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
              id="area"
              label="Area"
              value={form.area}
              onChange={(value) => set('area', value)}
            />
            <TextField
              id="achievedOn"
              label="Date achieved"
              type="date"
              value={form.achievedOn}
              onChange={(value) => set('achievedOn', value)}
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

        {!isNew ? (
          <IfPermitted
            permission="ACHIEVEMENT_VERIFY"
            fallback={
              <CmsCard title="Verification">
                <p className="cms-field__hint">
                  Current status: <strong>{verification.toLowerCase()}</strong>. Only a user with
                  verification permission can change this.
                </p>
              </CmsCard>
            }
          >
            <CmsCard title="Verification">
              <p className="cms-field__hint">
                Marking an achievement verified records that you checked its supporting evidence. It
                is attributed to your account.
              </p>
              <SelectField
                id="verification"
                label="Verification status"
                value={verification}
                options={VERIFICATION_STATUSES.map((value) => ({
                  value,
                  label: value.replace('_', ' ').toLowerCase(),
                }))}
                onChange={(value) => setVerification(value)}
              />
              <Button
                type="button"
                variant="secondary"
                isLoading={verify.state.submitting}
                onClick={async () => {
                  const result = await verify.run({ id: id ?? '', verification });
                  if (result) {
                    success('Verification updated.');
                    refetch();
                  } else {
                    failure(verify.state.error ?? 'Could not update verification.');
                  }
                }}
              >
                Save verification
              </Button>
            </CmsCard>
          </IfPermitted>
        ) : null}

        <FormActions
          submitting={active.state.submitting}
          onCancel={() => void navigate('/admin/content/achievements')}
          saveLabel={isNew ? 'Create draft' : 'Save changes'}
        />
      </form>

      <ToastRegion toasts={toasts} />
    </div>
  );
}
