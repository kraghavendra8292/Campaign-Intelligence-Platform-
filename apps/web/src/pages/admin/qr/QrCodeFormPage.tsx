import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import { useUnsavedChangesWarning } from '../../../features/cms/useCms';
import {
  CREATE_QR_CODE,
  QR_CODE_DETAIL,
  QR_DESTINATIONS,
  UPDATE_QR_CODE,
  type QrCodeRow,
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
 * Create and edit a QR code.
 *
 * The destination is the field that matters most, so it gets the most help: a
 * picker of the public site's top-level pages plus an optional page address,
 * combined and validated by the server. An editor should not have to know that
 * "/work/road-project" is legal and "https://elsewhere.example" is not.
 *
 * The destination allow-list comes from the API rather than being hard-coded
 * here, so the picker cannot drift out of sync with what the server accepts.
 */

interface CodeForm {
  name: string;
  description: string;
  destinationRoot: string;
  destinationSlug: string;
  source: string;
  placement: string;
  area: string;
  ward: string;
  locality: string;
  latitude: string;
  longitude: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
}

const EMPTY: CodeForm = {
  name: '',
  description: '',
  destinationRoot: '/work',
  destinationSlug: '',
  source: '',
  placement: '',
  area: '',
  ward: '',
  locality: '',
  latitude: '',
  longitude: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  utmContent: '',
};

/** Splits a stored path back into the picker's two parts. */
function splitDestination(path: string): { root: string; slug: string } {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return { root: '/', slug: '' };
  return { root: `/${segments[0]}`, slug: segments[1] ?? '' };
}

function joinDestination(root: string, slug: string): string {
  const trimmed = slug.trim();
  if (root === '/') return '/';
  return trimmed ? `${root}/${trimmed}` : root;
}

/** Detail pages live one level under these; the others are single pages. */
const ROOTS_WITH_DETAIL = new Set(['/work', '/achievements', '/news', '/events']);

export function QrCodeFormPage() {
  const { campaignId = '', qrId } = useParams();
  const navigate = useNavigate();
  const isNew = !qrId;
  const { toasts, success, failure } = useToasts();

  const [form, setForm] = useState<CodeForm>(EMPTY);
  const [loaded, setLoaded] = useState(isNew);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  const destinations = useAdminQuery<{ qrDestinationOptions: string[] }>(QR_DESTINATIONS);

  const { state } = useAdminQuery<{ qrCode: QrCodeRow }>(
    QR_CODE_DETAIL,
    { id: qrId },
    { skip: isNew },
  );

  if (!loaded && state.status === 'success') {
    const code = state.data.qrCode;
    const destination = splitDestination(code.destinationPath);
    setForm({
      name: code.name,
      description: code.description ?? '',
      destinationRoot: destination.root,
      destinationSlug: destination.slug,
      source: code.source ?? '',
      placement: code.placement ?? '',
      area: code.area ?? '',
      ward: code.ward ?? '',
      locality: code.locality ?? '',
      latitude: code.latitude === null ? '' : String(code.latitude),
      longitude: code.longitude === null ? '' : String(code.longitude),
      utmSource: code.utmSource ?? '',
      utmMedium: code.utmMedium ?? '',
      utmCampaign: code.utmCampaign ?? '',
      utmContent: code.utmContent ?? '',
    });
    setLoaded(true);
  }

  const create = useAdminMutation<{ createQrCode: { id: string } }, Record<string, unknown>>(
    CREATE_QR_CODE,
  );
  const update = useAdminMutation<{ updateQrCode: { id: string } }, Record<string, unknown>>(
    UPDATE_QR_CODE,
  );

  const active = isNew ? create : update;

  const set = <K extends keyof CodeForm>(key: K, value: CodeForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const destinationPath = joinDestination(form.destinationRoot, form.destinationSlug);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    const input = {
      name: form.name,
      description: form.description || null,
      destinationPath,
      source: form.source || null,
      placement: form.placement || null,
      area: form.area || null,
      ward: form.ward || null,
      locality: form.locality || null,
      // Blank coordinates stay null rather than becoming 0,0 - which is a real
      // place in the Gulf of Guinea, and would put every un-located poster there.
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      utmSource: form.utmSource || null,
      utmMedium: form.utmMedium || null,
      utmCampaign: form.utmCampaign || null,
      utmContent: form.utmContent || null,
    };

    const result = isNew
      ? await create.run({ campaignId, input })
      : await update.run({ id: qrId, input });

    if (result) {
      setDirty(false);
      success(isNew ? 'QR code created and activated.' : 'QR code saved.');
      const nextId = isNew ? (result as { createQrCode: { id: string } }).createQrCode.id : qrId;
      void navigate(`/admin/qr-campaigns/${campaignId}/qr/${nextId}`);
    } else {
      failure(active.state.error ?? 'Could not save this QR code.');
    }
  }

  const roots =
    destinations.state.status === 'success'
      ? destinations.state.data.qrDestinationOptions
      : ['/work'];

  return (
    <div className="cms-page">
      <CmsPageHeader
        title={isNew ? 'New QR code' : 'Edit QR code'}
        description={
          isNew
            ? 'A new code is active immediately, so it works the moment it is printed.'
            : undefined
        }
        backTo={
          isNew
            ? `/admin/qr-campaigns/${campaignId}`
            : `/admin/qr-campaigns/${campaignId}/qr/${qrId}`
        }
        backLabel={isNew ? 'Back to campaign' : 'Back to QR code'}
      />

      <form className="cms-form" onSubmit={handleSubmit} noValidate>
        <FormError message={active.state.error} />

        <CmsCard>
          <FormSection title="Basics">
            <TextField
              id="name"
              label="QR name"
              required
              hint="What this specific code is, e.g. “12th Main Road Poster”."
              value={form.name}
              errors={active.state.fieldErrors}
              onChange={(value) => set('name', value)}
            />
            <TextAreaField
              id="description"
              label="Description"
              maxLength={1000}
              value={form.description}
              errors={active.state.fieldErrors}
              onChange={(value) => set('description', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Destination">
            <SelectField
              id="destinationRoot"
              label="Public page"
              value={form.destinationRoot}
              options={roots.map((root) => ({ value: root, label: root }))}
              onChange={(value) => set('destinationRoot', value)}
            />
            {ROOTS_WITH_DETAIL.has(form.destinationRoot) ? (
              <TextField
                id="destinationSlug"
                label="Specific item (optional)"
                hint="The web address of one item, e.g. “road-development”. Leave blank for the listing page."
                value={form.destinationSlug}
                errors={active.state.fieldErrors}
                onChange={(value) => set('destinationSlug', value)}
              />
            ) : null}
            <p className="cms-field__hint">
              Scans will be sent to <code className="mono">{destinationPath}</code> on the public
              website. Only pages on this website can be used.
            </p>
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Placement and attribution">
            <TextField
              id="source"
              label="Source"
              hint="The channel this code represents: Poster, Pamphlet, Event, Office. Analytics groups by this."
              value={form.source}
              errors={active.state.fieldErrors}
              onChange={(value) => set('source', value)}
            />
            <TextField
              id="placement"
              label="Placement"
              hint="Where the printed code physically is."
              value={form.placement}
              errors={active.state.fieldErrors}
              onChange={(value) => set('placement', value)}
            />
            <TextField
              id="ward"
              label="Ward"
              value={form.ward}
              errors={active.state.fieldErrors}
              onChange={(value) => set('ward', value)}
            />
            <TextField
              id="area"
              label="Area"
              value={form.area}
              errors={active.state.fieldErrors}
              onChange={(value) => set('area', value)}
            />
            <TextField
              id="locality"
              label="Village or locality"
              value={form.locality}
              errors={active.state.fieldErrors}
              onChange={(value) => set('locality', value)}
            />
            <TextField
              id="latitude"
              label="Latitude"
              type="number"
              hint="Optional. Where the printed code is placed - never where anyone scanning it is."
              value={form.latitude}
              errors={active.state.fieldErrors}
              onChange={(value) => set('latitude', value)}
            />
            <TextField
              id="longitude"
              label="Longitude"
              type="number"
              value={form.longitude}
              errors={active.state.fieldErrors}
              onChange={(value) => set('longitude', value)}
            />
          </FormSection>
        </CmsCard>

        <CmsCard>
          <FormSection title="Tracking parameters">
            <p className="cms-field__hint">
              Added to the destination address so the channel is visible downstream. Leave blank and
              sensible values are generated from the campaign.
            </p>
            <TextField
              id="utmSource"
              label="utm_source"
              value={form.utmSource}
              errors={active.state.fieldErrors}
              onChange={(value) => set('utmSource', value)}
            />
            <TextField
              id="utmMedium"
              label="utm_medium"
              value={form.utmMedium}
              errors={active.state.fieldErrors}
              onChange={(value) => set('utmMedium', value)}
            />
            <TextField
              id="utmCampaign"
              label="utm_campaign"
              value={form.utmCampaign}
              errors={active.state.fieldErrors}
              onChange={(value) => set('utmCampaign', value)}
            />
            <TextField
              id="utmContent"
              label="utm_content"
              value={form.utmContent}
              errors={active.state.fieldErrors}
              onChange={(value) => set('utmContent', value)}
            />
          </FormSection>
        </CmsCard>

        <FormActions
          submitting={active.state.submitting}
          onCancel={() => void navigate(`/admin/qr-campaigns/${campaignId}`)}
          saveLabel={isNew ? 'Create QR code' : 'Save changes'}
        />
      </form>

      <ToastRegion toasts={toasts} />
    </div>
  );
}
