import { useState, type FormEvent } from 'react';
import { Button } from '@rk/ui';
import {
  useCmsMutation,
  useCmsQuery,
  useUnsavedChangesWarning,
} from '../../../features/cms/useCms';
import { useCmsLocale } from '../../../features/cms/CmsLocaleContext';
import {
  CMS_CANDIDATE_PROFILE,
  CMS_CONTACT,
  CMS_VISION,
  SET_SOCIAL_LINKS,
  TRANSITION_SINGLETON,
  UPDATE_CANDIDATE_PROFILE,
  UPDATE_CONTACT,
  UPDATE_VISION,
} from '../../../features/cms/cmsQueries';
import {
  CmsBoundary,
  CmsCard,
  CmsPageHeader,
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import {
  FormActions,
  FormError,
  FormSection,
  TextAreaField,
  TextField,
} from '../../../components/cms/fields';
import { RichTextEditor } from '../../../components/cms/RichTextEditor';
import { MediaPicker } from '../../../components/cms/MediaPicker';
import { StatusPill } from './shared';

/**
 * Singleton site content: candidate profile, vision and contact details.
 *
 * There is exactly one of each per tenant per language, so these are edit
 * forms rather than list-and-create screens - an editor always has something
 * to open, and never has to decide whether they are creating or updating.
 *
 * Publishing is a separate control here too: saving the profile does not put
 * it on the public site.
 */

/** Publish / unpublish control shared by the three singletons. */
function SingletonPublishing({
  entity,
  status,
  onChanged,
}: {
  entity: 'CANDIDATE_PROFILE' | 'VISION' | 'CONTACT';
  status: string | null;
  onChanged: () => void;
}) {
  const { locale } = useCmsLocale();
  const transition = useCmsMutation<unknown, { entity: string; action: string; locale: string }>(
    TRANSITION_SINGLETON,
  );
  const { toasts, success, failure } = useToasts();

  const run = async (action: string) => {
    // The locale is sent explicitly: each language has its own row with its own
    // publishing status, and the API defaults to English when it is omitted -
    // which would silently publish the wrong one.
    const result = await transition.run({ entity, action, locale });
    if (result) {
      success(action === 'PUBLISH' ? 'Published.' : 'Updated.');
      onChanged();
    } else {
      failure(transition.state.error ?? 'Could not update.');
    }
  };

  return (
    <CmsCard title="Publishing">
      <p className="cms-field__hint">
        Current status: {status ? <StatusPill value={status} /> : 'not saved yet'}
      </p>

      <div className="cms-form-actions__primary">
        {status !== 'PUBLISHED' ? (
          <Button
            type="button"
            variant="primary"
            isLoading={transition.state.submitting}
            onClick={() => void run('PUBLISH')}
          >
            Publish
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            isLoading={transition.state.submitting}
            onClick={() => void run('UNPUBLISH')}
          >
            Unpublish
          </Button>
        )}
      </div>

      <ToastRegion toasts={toasts} />
    </CmsCard>
  );
}

// ---------------------------------------------------------------------------
// Candidate profile
// ---------------------------------------------------------------------------

export function CmsCandidatePage() {
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();
  // Which language the form was populated from. A singleton has one row per
  // locale, so switching language must reload rather than keep the other
  // language's text in the fields.
  const [loadedLocale, setLoadedLocale] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    displayName: '',
    designation: '',
    shortBio: '',
    fullBioHtml: '',
    experienceHtml: '',
    publicServiceHtml: '',
    profileImageId: null as string | null,
    coverImageId: null as string | null,
    metaTitle: '',
    metaDescription: '',
  });

  useUnsavedChangesWarning(dirty);

  const { state, refetch } = useCmsQuery<{
    cmsCandidateProfile: Record<string, unknown> | null;
  }>(CMS_CANDIDATE_PROFILE, { locale });

  if (loadedLocale !== locale && state.status === 'success') {
    const profile = state.data.cmsCandidateProfile;
    if (profile) {
      setForm({
        fullName: String(profile.fullName ?? ''),
        displayName: String(profile.displayName ?? ''),
        designation: String(profile.designation ?? ''),
        shortBio: String(profile.shortBio ?? ''),
        fullBioHtml: String(profile.fullBioHtml ?? ''),
        experienceHtml: String(profile.experienceHtml ?? ''),
        publicServiceHtml: String(profile.publicServiceHtml ?? ''),
        profileImageId: (profile.profileImage as { id: string } | null)?.id ?? null,
        coverImageId: (profile.coverImage as { id: string } | null)?.id ?? null,
        metaTitle: String(profile.metaTitle ?? ''),
        metaDescription: String(profile.metaDescription ?? ''),
      });
      setStatus(String(profile.status ?? 'DRAFT'));
    }
    setLoadedLocale(locale);
  }

  const update = useCmsMutation<unknown, Record<string, unknown>>(UPDATE_CANDIDATE_PROFILE);

  const set = (key: keyof typeof form, value: string | null) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  return (
    <div className="cms-page">
      <CmsPageHeader
        title="Candidate profile"
        description="The About page and homepage introduction on the public site."
        localized
      />

      <CmsBoundary state={state} refetch={refetch}>
        {() => (
          <form
            className="cms-form"
            noValidate
            onSubmit={async (event: FormEvent) => {
              event.preventDefault();

              const result = await update.run({
                input: {
                  locale,
                  fullName: form.fullName,
                  displayName: form.displayName || null,
                  designation: form.designation || null,
                  shortBio: form.shortBio || null,
                  fullBioHtml: form.fullBioHtml || null,
                  experienceHtml: form.experienceHtml || null,
                  publicServiceHtml: form.publicServiceHtml || null,
                  profileImageId: form.profileImageId,
                  coverImageId: form.coverImageId,
                  metaTitle: form.metaTitle || null,
                  metaDescription: form.metaDescription || null,
                },
              });

              if (result) {
                setDirty(false);
                success('Profile saved.');
                refetch();
              } else {
                failure(update.state.error ?? 'Could not save.');
              }
            }}
          >
            <FormError message={update.state.error} />

            <CmsCard>
              <FormSection title="Identity">
                <TextField
                  id="fullName"
                  label="Full name"
                  required
                  value={form.fullName}
                  errors={update.state.fieldErrors}
                  onChange={(value) => set('fullName', value)}
                />
                <TextField
                  id="displayName"
                  label="Display name"
                  hint="Shown on the site if different from the full name."
                  value={form.displayName}
                  onChange={(value) => set('displayName', value)}
                />
                <TextField
                  id="designation"
                  label="Designation"
                  value={form.designation}
                  onChange={(value) => set('designation', value)}
                />
                <TextAreaField
                  id="shortBio"
                  label="Short biography"
                  hint="Used on the homepage and in search results."
                  maxLength={600}
                  value={form.shortBio}
                  onChange={(value) => set('shortBio', value)}
                />
              </FormSection>
            </CmsCard>

            <CmsCard>
              <FormSection title="Biography">
                <RichTextEditor
                  id="fullBioHtml"
                  label="Full biography"
                  value={form.fullBioHtml}
                  onChange={(value) => set('fullBioHtml', value)}
                />
                <RichTextEditor
                  id="experienceHtml"
                  label="Experience"
                  value={form.experienceHtml}
                  onChange={(value) => set('experienceHtml', value)}
                />
                <RichTextEditor
                  id="publicServiceHtml"
                  label="Public service"
                  value={form.publicServiceHtml}
                  onChange={(value) => set('publicServiceHtml', value)}
                />
              </FormSection>
            </CmsCard>

            <CmsCard>
              <FormSection title="Photographs">
                <MediaPicker
                  label="Profile photo"
                  selectedId={form.profileImageId}
                  onSelect={(mediaId) => set('profileImageId', mediaId)}
                />
                <MediaPicker
                  label="Cover image"
                  selectedId={form.coverImageId}
                  onSelect={(mediaId) => set('coverImageId', mediaId)}
                />
              </FormSection>
            </CmsCard>

            <FormActions
              submitting={update.state.submitting}
              onCancel={() => refetch()}
              saveLabel="Save profile"
            />

            <IfPermitted permission="CANDIDATE_PROFILE_UPDATE">
              <SingletonPublishing
                entity="CANDIDATE_PROFILE"
                status={status}
                onChanged={() => {
                  // Force a repopulate so the new publishing status is picked up.
                  setLoadedLocale(null);
                  refetch();
                }}
              />
            </IfPermitted>
          </form>
        )}
      </CmsBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vision
// ---------------------------------------------------------------------------

export function CmsVisionPage() {
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();
  // Which language the form was populated from. A singleton has one row per
  // locale, so switching language must reload rather than keep the other
  // language's text in the fields.
  const [loadedLocale, setLoadedLocale] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState({
    headline: '',
    summary: '',
    statementHtml: '',
    metaTitle: '',
    metaDescription: '',
  });

  useUnsavedChangesWarning(dirty);

  const { state, refetch } = useCmsQuery<{ cmsVision: Record<string, unknown> | null }>(
    CMS_VISION,
    { locale },
  );

  if (loadedLocale !== locale && state.status === 'success') {
    const vision = state.data.cmsVision;
    if (vision) {
      setForm({
        headline: String(vision.headline ?? ''),
        summary: String(vision.summary ?? ''),
        statementHtml: String(vision.statementHtml ?? ''),
        metaTitle: String(vision.metaTitle ?? ''),
        metaDescription: String(vision.metaDescription ?? ''),
      });
      setStatus(String(vision.status ?? 'DRAFT'));
    }
    setLoadedLocale(locale);
  }

  const update = useCmsMutation<unknown, Record<string, unknown>>(UPDATE_VISION);

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  return (
    <div className="cms-page">
      <CmsPageHeader
        title="Vision"
        description="The vision statement shown on the public site."
        localized
      />

      <CmsBoundary state={state} refetch={refetch}>
        {() => (
          <form
            className="cms-form"
            noValidate
            onSubmit={async (event: FormEvent) => {
              event.preventDefault();

              const result = await update.run({
                input: {
                  locale,
                  headline: form.headline,
                  summary: form.summary || null,
                  statementHtml: form.statementHtml || null,
                  metaTitle: form.metaTitle || null,
                  metaDescription: form.metaDescription || null,
                },
              });

              if (result) {
                setDirty(false);
                success('Vision saved.');
                refetch();
              } else {
                failure(update.state.error ?? 'Could not save.');
              }
            }}
          >
            <FormError message={update.state.error} />

            <CmsCard>
              <FormSection title="Vision">
                <TextField
                  id="headline"
                  label="Headline"
                  required
                  hint="Appears as the main heading on the vision page."
                  value={form.headline}
                  errors={update.state.fieldErrors}
                  onChange={(value) => set('headline', value)}
                />
                <TextAreaField
                  id="summary"
                  label="Summary"
                  maxLength={600}
                  value={form.summary}
                  onChange={(value) => set('summary', value)}
                />
                <RichTextEditor
                  id="statementHtml"
                  label="Statement"
                  value={form.statementHtml}
                  onChange={(value) => set('statementHtml', value)}
                />
              </FormSection>
            </CmsCard>

            <FormActions
              submitting={update.state.submitting}
              onCancel={() => refetch()}
              saveLabel="Save vision"
            />

            <IfPermitted permission="VISION_UPDATE">
              <SingletonPublishing
                entity="VISION"
                status={status}
                onChanged={() => {
                  // Force a repopulate so the new publishing status is picked up.
                  setLoadedLocale(null);
                  refetch();
                }}
              />
            </IfPermitted>
          </form>
        )}
      </CmsBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

interface SocialLinkRow {
  id?: string;
  platform: string;
  label: string;
  url: string;
  isActive: boolean;
}

export function CmsContactPage() {
  const { toasts, success, failure } = useToasts();
  const { locale } = useCmsLocale();
  // Which language the form was populated from. A singleton has one row per
  // locale, so switching language must reload rather than keep the other
  // language's text in the fields.
  const [loadedLocale, setLoadedLocale] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [links, setLinks] = useState<SocialLinkRow[]>([]);

  const [form, setForm] = useState({
    officeName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    phone: '',
    alternatePhone: '',
    email: '',
    officeHours: '',
    mapEmbedUrl: '',
  });

  useUnsavedChangesWarning(dirty);

  const { state, refetch } = useCmsQuery<{
    cmsContactInformation: {
      contact: Record<string, unknown> | null;
      socialLinks: Array<Record<string, unknown>>;
    };
  }>(CMS_CONTACT, { locale });

  if (loadedLocale !== locale && state.status === 'success') {
    const { contact, socialLinks } = state.data.cmsContactInformation;

    if (contact) {
      setForm({
        officeName: String(contact.officeName ?? ''),
        addressLine1: String(contact.addressLine1 ?? ''),
        addressLine2: String(contact.addressLine2 ?? ''),
        city: String(contact.city ?? ''),
        state: String(contact.state ?? ''),
        postalCode: String(contact.postalCode ?? ''),
        phone: String(contact.phone ?? ''),
        alternatePhone: String(contact.alternatePhone ?? ''),
        email: String(contact.email ?? ''),
        officeHours: String(contact.officeHours ?? ''),
        mapEmbedUrl: String(contact.mapEmbedUrl ?? ''),
      });
      setStatus(String(contact.status ?? 'DRAFT'));
    }

    setLinks(
      socialLinks.map((link) => ({
        platform: String(link.platform ?? ''),
        label: String(link.label ?? ''),
        url: String(link.url ?? ''),
        isActive: Boolean(link.isActive),
      })),
    );
    setLoadedLocale(locale);
  }

  const update = useCmsMutation<unknown, Record<string, unknown>>(UPDATE_CONTACT);
  const saveLinks = useCmsMutation<unknown, { links: SocialLinkRow[] }>(SET_SOCIAL_LINKS);

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  return (
    <div className="cms-page">
      <CmsPageHeader
        title="Contact information"
        description="Office details and social links shown on the public contact page."
        localized
      />

      <CmsBoundary state={state} refetch={refetch}>
        {() => (
          <form
            className="cms-form"
            noValidate
            onSubmit={async (event: FormEvent) => {
              event.preventDefault();

              const result = await update.run({ input: { locale, ...toNullable(form) } });

              if (result) {
                setDirty(false);
                success('Contact details saved.');
                refetch();
              } else {
                failure(update.state.error ?? 'Could not save.');
              }
            }}
          >
            <FormError message={update.state.error} />

            <CmsCard>
              <FormSection title="Office">
                <TextField
                  id="officeName"
                  label="Office name"
                  value={form.officeName}
                  onChange={(value) => set('officeName', value)}
                />
                <TextField
                  id="addressLine1"
                  label="Address line 1"
                  value={form.addressLine1}
                  onChange={(value) => set('addressLine1', value)}
                />
                <TextField
                  id="addressLine2"
                  label="Address line 2"
                  value={form.addressLine2}
                  onChange={(value) => set('addressLine2', value)}
                />
                <TextField
                  id="city"
                  label="City"
                  value={form.city}
                  onChange={(value) => set('city', value)}
                />
                <TextField
                  id="state"
                  label="State"
                  value={form.state}
                  onChange={(value) => set('state', value)}
                />
                <TextField
                  id="postalCode"
                  label="Postal code"
                  value={form.postalCode}
                  onChange={(value) => set('postalCode', value)}
                />
              </FormSection>
            </CmsCard>

            <CmsCard>
              <FormSection title="Reaching the office">
                <TextField
                  id="phone"
                  label="Phone"
                  value={form.phone}
                  onChange={(value) => set('phone', value)}
                />
                <TextField
                  id="alternatePhone"
                  label="Alternate phone"
                  value={form.alternatePhone}
                  onChange={(value) => set('alternatePhone', value)}
                />
                <TextField
                  id="email"
                  label="Email"
                  type="email"
                  value={form.email}
                  errors={update.state.fieldErrors}
                  onChange={(value) => set('email', value)}
                />
                <TextField
                  id="officeHours"
                  label="Office hours"
                  value={form.officeHours}
                  onChange={(value) => set('officeHours', value)}
                />
                <TextField
                  id="mapEmbedUrl"
                  label="Map embed URL"
                  hint="Must be a complete https:// URL."
                  value={form.mapEmbedUrl}
                  errors={update.state.fieldErrors}
                  onChange={(value) => set('mapEmbedUrl', value)}
                />
              </FormSection>
            </CmsCard>

            <FormActions
              submitting={update.state.submitting}
              onCancel={() => refetch()}
              saveLabel="Save contact details"
            />

            <CmsCard title="Social links">
              <p className="cms-field__hint">
                Each link must be a complete https:// URL. Links are shown in the footer and on the
                contact page.
              </p>

              {links.map((link, index) => (
                <div key={index} className="cms-link-row">
                  <TextField
                    id={`platform-${index}`}
                    label="Platform"
                    value={link.platform}
                    onChange={(value) =>
                      setLinks((all) =>
                        all.map((item, i) => (i === index ? { ...item, platform: value } : item)),
                      )
                    }
                  />
                  <TextField
                    id={`url-${index}`}
                    label="URL"
                    value={link.url}
                    onChange={(value) =>
                      setLinks((all) =>
                        all.map((item, i) => (i === index ? { ...item, url: value } : item)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setLinks((all) => all.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}

              <div className="cms-form-actions__primary">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setLinks((all) => [
                      ...all,
                      { platform: '', label: '', url: '', isActive: true },
                    ])
                  }
                >
                  Add link
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  isLoading={saveLinks.state.submitting}
                  onClick={async () => {
                    const result = await saveLinks.run({
                      links: links.filter((link) => link.platform && link.url),
                    });
                    if (result) success('Social links saved.');
                    else failure(saveLinks.state.error ?? 'Could not save links.');
                  }}
                >
                  Save links
                </Button>
              </div>
            </CmsCard>

            <IfPermitted permission="CONTACT_UPDATE">
              <SingletonPublishing
                entity="CONTACT"
                status={status}
                onChanged={() => {
                  // Force a repopulate so the new publishing status is picked up.
                  setLoadedLocale(null);
                  refetch();
                }}
              />
            </IfPermitted>
          </form>
        )}
      </CmsBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

/** Blank strings become null so the column holds NULL rather than ''. */
function toNullable(form: Record<string, string>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value || null]));
}
