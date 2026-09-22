import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QR_CAMPAIGN_TYPES } from '@rk/types';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import { useUnsavedChangesWarning } from '../../../features/cms/useCms';
import {
  CREATE_QR_CAMPAIGN,
  QR_CAMPAIGN,
  UPDATE_QR_CAMPAIGN,
  type QrCampaignRow,
} from '../../../features/qr/qrQueries';
import { CmsCard, CmsPageHeader, ToastRegion, useToasts } from '../../../components/cms/CmsShell';
import {
  FormActions,
  FormError,
  FormSection,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../components/cms/fields';

/**
 * Create and edit a QR campaign.
 *
 * A new campaign is always created as a DRAFT: activation is a separate act
 * behind a separate permission, so nobody can create-and-activate in one step.
 * The form says so rather than leaving the reader to discover it.
 */

interface CampaignForm {
  name: string;
  slug: string;
  description: string;
  campaignType: string;
  startDate: string;
  endDate: string;
}

const EMPTY: CampaignForm = {
  name: '',
  slug: '',
  description: '',
  campaignType: 'POSTER',
  startDate: '',
  endDate: '',
};

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function QrCampaignFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { toasts, success, failure } = useToasts();

  const [form, setForm] = useState<CampaignForm>(EMPTY);
  const [loaded, setLoaded] = useState(isNew);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  const { state } = useAdminQuery<{ qrCampaign: QrCampaignRow }>(
    QR_CAMPAIGN,
    { id },
    { skip: isNew },
  );

  // Populated once from the server; later renders must not clobber edits.
  if (!loaded && state.status === 'success') {
    const campaign = state.data.qrCampaign;
    setForm({
      name: campaign.name,
      slug: campaign.slug,
      description: campaign.description ?? '',
      campaignType: campaign.campaignType,
      startDate: toDateInput(campaign.startDate),
      endDate: toDateInput(campaign.endDate),
    });
    setLoaded(true);
  }

  const create = useAdminMutation<{ createQrCampaign: { id: string } }, Record<string, unknown>>(
    CREATE_QR_CAMPAIGN,
  );
  const update = useAdminMutation<{ updateQrCampaign: { id: string } }, Record<string, unknown>>(
    UPDATE_QR_CAMPAIGN,
  );

  const active = isNew ? create : update;

  const set = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    const input = {
      name: form.name,
      slug: form.slug || null,
      description: form.description || null,
      campaignType: form.campaignType,
      // Sent as instants so the API validates them the same way it validates
      // every other date; blank stays null rather than becoming an epoch.
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
    };

    const result = isNew ? await create.run({ input }) : await update.run({ id, input });

    if (result) {
      setDirty(false);
      success(isNew ? 'Campaign created as a draft.' : 'Campaign saved.');
      const nextId = isNew
        ? (result as { createQrCampaign: { id: string } }).createQrCampaign.id
        : id;
      void navigate(`/admin/qr-campaigns/${nextId}`);
    } else {
      failure(active.state.error ?? 'Could not save this campaign.');
    }
  }

  return (
    <div className="cms-page">
      <CmsPageHeader
        title={isNew ? 'New QR campaign' : 'Edit QR campaign'}
        description={
          isNew
            ? 'Created as a draft. Activate it once its QR codes are ready to print.'
            : undefined
        }
      />

      <form className="cms-form" onSubmit={handleSubmit} noValidate>
        <FormError message={active.state.error} />

        <CmsCard>
          <FormSection title="Campaign">
            <TextField
              id="name"
              label="Campaign name"
              required
              hint="What the team calls this outreach push, e.g. “Ward 12 Development Awareness”."
              value={form.name}
              errors={active.state.fieldErrors}
              onChange={(value) => set('name', value)}
            />
            <TextField
              id="slug"
              label="Short address"
              hint="Leave blank to generate one from the name. Used in tracking parameters."
              value={form.slug}
              errors={active.state.fieldErrors}
              onChange={(value) => set('slug', value)}
            />
            <TextAreaField
              id="description"
              label="Description"
              maxLength={1000}
              value={form.description}
              errors={active.state.fieldErrors}
              onChange={(value) => set('description', value)}
            />
            <SelectField
              id="campaignType"
              label="Campaign type"
              value={form.campaignType}
              options={QR_CAMPAIGN_TYPES.map((value) => ({
                value,
                label: value.replace(/_/g, ' ').toLowerCase(),
              }))}
              onChange={(value) => set('campaignType', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Schedule">
            <TextField
              id="startDate"
              label="Start date"
              type="date"
              hint="Descriptive only. Dates do not switch QR codes on or off - a poster outlives its campaign window."
              value={form.startDate}
              errors={active.state.fieldErrors}
              onChange={(value) => set('startDate', value)}
            />
            <TextField
              id="endDate"
              label="End date"
              type="date"
              value={form.endDate}
              errors={active.state.fieldErrors}
              onChange={(value) => set('endDate', value)}
            />
          </FormSection>
        </CmsCard>

        <FormActions
          submitting={active.state.submitting}
          onCancel={() => void navigate('/admin/qr-campaigns')}
          saveLabel={isNew ? 'Create campaign' : 'Save changes'}
        />
      </form>

      <ToastRegion toasts={toasts} />
    </div>
  );
}
