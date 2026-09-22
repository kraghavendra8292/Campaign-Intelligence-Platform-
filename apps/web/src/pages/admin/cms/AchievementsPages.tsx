import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CONTENT_CATEGORIES, VERIFICATION_STATUSES } from '@rk/types';
import { Button } from '@rk/ui';
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
import { formatDate } from '../../../lib/format';

/**
 * Achievement CMS screens.
 *
 * The one place the CMS distinguishes **verifying** from **publishing**.
 * Verification is a claim that staff checked the evidence, so the control is
 * separate, needs ACHIEVEMENT_VERIFY, and the form says plainly that editing a
 * verified achievement sends it back for re-checking.
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

export function CmsAchievementsPage() {
  const [status, setStatus] = useState('');
  const [pendingDelete, setPendingDelete] = useState<AchievementRow | null>(null);
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();

  const variables = useMemo(
    () => ({ first: 50, status: status || null, locale }),
    [status, locale],
  );
  const { state, refetch } = useCmsQuery<{
    cmsAchievements: { nodes: AchievementRow[] };
  }>(CMS_ACHIEVEMENTS, variables);

  const transition = useCmsMutation<unknown, { id: string; action: string }>(
    TRANSITION_ACHIEVEMENT,
  );
  const verify = useCmsMutation<unknown, { id: string; verification: string }>(VERIFY_ACHIEVEMENT);
  const remove = useCmsMutation<unknown, { id: string }>(DELETE_ACHIEVEMENT);

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
        title="Achievements"
        description="Completed work and outcomes. Verification is separate from publishing."
        localized
        actions={
          <IfPermitted permission="ACHIEVEMENT_CREATE">
            <Link to="/admin/content/achievements/new">
              <Button variant="primary">New achievement</Button>
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
        isEmpty={(data) => data.cmsAchievements.nodes.length === 0}
        emptyMessage="No achievements yet."
      >
        {(data) => (
          <DataTable
            caption="Achievements"
            rows={data.cmsAchievements.nodes}
            columns={[
              {
                key: 'title',
                header: 'Title',
                render: (row) => (
                  <Link className="cms-table__link" to={`/admin/content/achievements/${row.id}`}>
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
                key: 'verification',
                header: 'Verification',
                render: (row) => <StatusPill value={row.verification} />,
              },
              {
                key: 'date',
                header: 'Date',
                secondary: true,
                render: (row) => formatDate(row.achievedOn) ?? '—',
              },
            ]}
            actions={(row) => (
              <div className="cms-row-actions">
                <IfPermitted permission="ACHIEVEMENT_VERIFY">
                  {row.verification !== 'VERIFIED' ? (
                    <button
                      type="button"
                      className="cms-row-actions__link"
                      disabled={verify.state.submitting}
                      onClick={async () => {
                        const result = await verify.run({
                          id: row.id,
                          verification: 'VERIFIED',
                        });
                        if (result) {
                          success('Marked as verified.');
                          refetch();
                        } else {
                          failure(verify.state.error ?? 'Could not verify.');
                        }
                      }}
                    >
                      Mark verified
                    </button>
                  ) : null}
                </IfPermitted>

                <PublishControls
                  status={row.status}
                  publishPermission="ACHIEVEMENT_PUBLISH"
                  onTransition={(action) => void runTransition(row.id, action)}
                  busy={transition.state.submitting}
                />

                {row.status === 'PUBLISHED' ? (
                  <a
                    className="cms-row-actions__link"
                    href={`/achievements/${row.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View
                  </a>
                ) : null}

                <IfPermitted permission="ACHIEVEMENT_DELETE">
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
      <CmsPageHeader title={isNew ? 'New achievement' : 'Edit achievement'} localized={isNew} />

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
