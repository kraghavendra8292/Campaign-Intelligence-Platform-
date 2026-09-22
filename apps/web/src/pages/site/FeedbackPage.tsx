import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ISSUE_LIMITS, SUBMISSION_TYPES, type SubmissionType } from '@rk/types';
import { Button } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import { usePublicQuery } from '../../features/site/usePublicQuery';
import { useSeo } from '../../features/site/useSeo';
import {
  readQrReferrer,
  uploadAttachment,
  useIssueSubmission,
  type UploadedAttachment,
} from '../../features/site/useIssueSubmission';
import type { StringKey } from '../../i18n/strings';

/**
 * The public feedback and issue form.
 *
 * Designed for the person it is actually for: somebody on a phone, standing
 * next to a broken drain, who has never used this site before and has no
 * account. Every decision below follows from that.
 *
 *  - SEVEN SHORT SECTIONS rather than one long form, so the page never looks
 *    like paperwork.
 *  - ONLY FOUR REQUIRED FIELDS. Location, photos and contact details are all
 *    optional, and the form says so rather than making people guess.
 *  - ANONYMOUS BY DEFAULT. Giving a name is an opt-in, and the consent tick
 *    appears only once there is something to consent to.
 *  - ENTERED DATA SURVIVES A VALIDATION ERROR. Nothing is cleared; the server's
 *    message is shown beside the field that caused it.
 *  - GEOLOCATION IS NEVER REQUESTED AUTOMATICALLY. The browser prompt appears
 *    only after a deliberate tap on "Use my current location".
 */

const CATEGORIES_QUERY = /* GraphQL */ `
  query PublicIssueCategories($input: PublicSiteInput) {
    publicIssueCategories(input: $input) {
      key
      label
    }
  }
`;

interface CategoryOption {
  key: string;
  label: string;
}

interface FormState {
  type: SubmissionType;
  title: string;
  description: string;
  categoryKey: string;
  ward: string;
  locality: string;
  area: string;
  addressDescription: string;
  latitude: number | null;
  longitude: number | null;
  isAnonymous: boolean;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  consentGiven: boolean;
}

const EMPTY: FormState = {
  type: 'ISSUE',
  title: '',
  description: '',
  categoryKey: '',
  ward: '',
  locality: '',
  area: '',
  addressDescription: '',
  latitude: null,
  longitude: null,
  isAnonymous: true,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  consentGiven: false,
};

export function FeedbackPage() {
  const { t, organizationSlug } = useSite();
  const { state: submitState, submit, reset } = useIssueSubmission();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useSeo({
    title: t('feedback.title'),
    description: t('feedback.intro'),
    path: '/feedback',
  });

  const { state: categoryState } = usePublicQuery<{
    publicIssueCategories: CategoryOption[];
  }>(CATEGORIES_QUERY);

  const categories = useMemo(
    () => (categoryState.status === 'success' ? categoryState.data.publicIssueCategories : []),
    [categoryState],
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** The server's field-specific message, shown beside the input it concerns. */
  const fieldError = (field: string): string | null =>
    submitState.status === 'error' && submitState.field === field ? submitState.message : null;

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);

    try {
      const remaining = ISSUE_LIMITS.maxAttachments - attachments.length;
      for (const file of Array.from(files).slice(0, Math.max(0, remaining))) {
        const uploaded = await uploadAttachment(file, organizationSlug);
        setAttachments((current) => [...current, uploaded]);
      }
    } catch (error) {
      // A failed upload must never block the submission: the words are worth
      // more than the picture.
      setUploadError(error instanceof Error ? error.message : t('feedback.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  /**
   * Reads the device location, and only when asked.
   *
   * `getCurrentPosition` is called from this click handler and nowhere else, so
   * the browser's permission prompt is always the direct result of a deliberate
   * tap. Nothing is watched, and nothing is read on page load.
   */
  function useCurrentLocation(): void {
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError(t('feedback.location.denied'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        set('latitude', Number(position.coords.latitude.toFixed(6)));
        set('longitude', Number(position.coords.longitude.toFixed(6)));
      },
      () => setLocationError(t('feedback.location.denied')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    await submit({
      organizationSlug,
      type: form.type,
      title: form.title,
      description: form.description,
      categoryKey: form.categoryKey || null,
      ward: form.ward || null,
      locality: form.locality || null,
      area: form.area || null,
      addressDescription: form.addressDescription || null,
      latitude: form.latitude,
      longitude: form.longitude,
      isAnonymous: form.isAnonymous,
      contactName: form.isAnonymous ? null : form.contactName || null,
      contactPhone: form.isAnonymous ? null : form.contactPhone || null,
      contactEmail: form.isAnonymous ? null : form.contactEmail || null,
      consentGiven: form.consentGiven,
      // Attribution only, and only if this visitor arrived through a printed
      // code. It says which poster worked, never anything about them.
      qrCode: readQrReferrer(),
      attachments: attachments.map((file) => ({ id: file.id, claimToken: file.claimToken })),
    });
  }

  // --- Confirmation --------------------------------------------------------
  if (submitState.status === 'done') {
    const receipt = submitState.receipt;

    return (
      <div className="section">
        <div className="section__inner section__inner--narrow">
          <div className="feedback-done" role="status">
            <span className="feedback-done__mark" aria-hidden="true">
              ✓
            </span>
            <h1 className="feedback-done__title">{t('feedback.done.title')}</h1>

            <p className="feedback-done__label">{t('feedback.done.reference')}</p>
            <p className="feedback-done__reference">{receipt.referenceNumber}</p>
            <p className="feedback-done__save">{t('feedback.done.save')}</p>

            <p className="feedback-done__note">
              {receipt.contactProvided ? t('feedback.done.contact') : t('feedback.done.anonymous')}
            </p>

            <div className="feedback-done__actions">
              <Link to="/track">
                <Button variant="primary">{t('feedback.done.track')}</Button>
              </Link>
              <Button
                variant="secondary"
                onClick={() => {
                  setForm(EMPTY);
                  setAttachments([]);
                  reset();
                }}
              >
                {t('feedback.done.another')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const submitting = submitState.status === 'submitting';
  const generalError =
    submitState.status === 'error' && submitState.field === null ? submitState.message : null;

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <header className="section-header">
          <div>
            <h1 className="section-header__title">{t('feedback.title')}</h1>
            <p className="section-header__subtitle">{t('feedback.intro')}</p>
          </div>
        </header>

        <form className="feedback-form" onSubmit={handleSubmit} noValidate>
          {generalError ? (
            <p className="feedback-form__error" role="alert">
              {generalError}
            </p>
          ) : null}

          {/* --- 1. Type ------------------------------------------------- */}
          <fieldset className="feedback-section">
            <legend className="feedback-section__legend">{t('feedback.stepType')}</legend>
            <div className="feedback-types">
              {SUBMISSION_TYPES.map((type) => (
                <label
                  key={type}
                  className={`feedback-type${form.type === type ? ' feedback-type--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={type}
                    checked={form.type === type}
                    onChange={() => set('type', type)}
                  />
                  <span className="feedback-type__label">
                    {t(`feedback.type.${type}` as StringKey)}
                  </span>
                  <span className="feedback-type__hint">
                    {t(`feedback.type.${type}.hint` as StringKey)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* --- 2. Details ---------------------------------------------- */}
          <fieldset className="feedback-section">
            <legend className="feedback-section__legend">{t('feedback.stepDetails')}</legend>

            <label className="feedback-field">
              <span className="feedback-field__label">
                {t('feedback.field.title')} <span aria-hidden="true">*</span>
              </span>
              <span className="feedback-field__hint">{t('feedback.field.titleHint')}</span>
              <input
                className="rk-input"
                type="text"
                required
                maxLength={ISSUE_LIMITS.titleMax}
                value={form.title}
                aria-invalid={fieldError('title') !== null}
                onChange={(event) => set('title', event.target.value)}
              />
              {fieldError('title') ? (
                <span className="feedback-field__error" role="alert">
                  {fieldError('title')}
                </span>
              ) : null}
            </label>

            <label className="feedback-field">
              <span className="feedback-field__label">
                {t('feedback.field.description')} <span aria-hidden="true">*</span>
              </span>
              <span className="feedback-field__hint">{t('feedback.field.descriptionHint')}</span>
              <textarea
                className="rk-textarea"
                rows={6}
                required
                maxLength={ISSUE_LIMITS.descriptionMax}
                value={form.description}
                aria-invalid={fieldError('description') !== null}
                onChange={(event) => set('description', event.target.value)}
              />
              {fieldError('description') ? (
                <span className="feedback-field__error" role="alert">
                  {fieldError('description')}
                </span>
              ) : null}
            </label>

            <label className="feedback-field">
              <span className="feedback-field__label">{t('feedback.field.category')}</span>
              <span className="feedback-field__hint">{t('feedback.field.categoryHint')}</span>
              <select
                className="rk-select__control"
                value={form.categoryKey}
                onChange={(event) => set('categoryKey', event.target.value)}
              >
                <option value="">—</option>
                {categories.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
              {fieldError('categoryKey') ? (
                <span className="feedback-field__error" role="alert">
                  {fieldError('categoryKey')}
                </span>
              ) : null}
            </label>
          </fieldset>

          {/* --- 3. Location --------------------------------------------- */}
          <fieldset className="feedback-section">
            <legend className="feedback-section__legend">{t('feedback.stepLocation')}</legend>
            <p className="feedback-section__note">{t('feedback.location.optional')}</p>

            <div className="feedback-grid">
              <label className="feedback-field">
                <span className="feedback-field__label">{t('feedback.field.ward')}</span>
                <input
                  className="rk-input"
                  type="text"
                  value={form.ward}
                  onChange={(event) => set('ward', event.target.value)}
                />
              </label>

              <label className="feedback-field">
                <span className="feedback-field__label">{t('feedback.field.locality')}</span>
                <input
                  className="rk-input"
                  type="text"
                  value={form.locality}
                  onChange={(event) => set('locality', event.target.value)}
                />
              </label>
            </div>

            <label className="feedback-field">
              <span className="feedback-field__label">{t('feedback.field.address')}</span>
              <span className="feedback-field__hint">{t('feedback.field.addressHint')}</span>
              <input
                className="rk-input"
                type="text"
                value={form.addressDescription}
                onChange={(event) => set('addressDescription', event.target.value)}
              />
            </label>

            <div className="feedback-location">
              {form.latitude !== null && form.longitude !== null ? (
                <>
                  <span className="feedback-location__added">{t('feedback.location.added')}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set('latitude', null);
                      set('longitude', null);
                    }}
                  >
                    {t('feedback.location.remove')}
                  </Button>
                </>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={useCurrentLocation}>
                  {t('feedback.location.use')}
                </Button>
              )}
            </div>

            {locationError ? (
              <p className="feedback-field__error" role="alert">
                {locationError}
              </p>
            ) : null}

            <p className="feedback-section__note">{t('feedback.location.note')}</p>
          </fieldset>

          {/* --- 4. Photo ------------------------------------------------ */}
          <fieldset className="feedback-section">
            <legend className="feedback-section__legend">{t('feedback.stepPhoto')}</legend>

            <label className="feedback-field">
              <span className="feedback-field__label">{t('feedback.field.photo')}</span>
              <span className="feedback-field__hint">{t('feedback.field.photoHint')}</span>
              <input
                ref={fileInput}
                className="rk-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                disabled={uploading || attachments.length >= ISSUE_LIMITS.maxAttachments}
                onChange={(event) => void handleFiles(event.target.files)}
              />
            </label>

            {uploadError ? (
              <p className="feedback-field__error" role="alert">
                {uploadError}
              </p>
            ) : null}

            {attachments.length > 0 ? (
              <ul className="feedback-attachments">
                {attachments.map((file) => (
                  <li key={file.id} className="feedback-attachment">
                    <span className="feedback-attachment__name">{file.originalName}</span>
                    <button
                      type="button"
                      className="feedback-attachment__remove"
                      onClick={() =>
                        setAttachments((current) => current.filter((item) => item.id !== file.id))
                      }
                    >
                      {t('feedback.attachmentRemove')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </fieldset>

          {/* --- 5 & 6. Contact and consent ------------------------------ */}
          <fieldset className="feedback-section">
            <legend className="feedback-section__legend">{t('feedback.stepContact')}</legend>

            <label className="feedback-checkbox">
              <input
                type="checkbox"
                checked={form.isAnonymous}
                onChange={(event) => {
                  set('isAnonymous', event.target.checked);
                  // Consent only means something while there are details to
                  // consent to, so it resets with the choice.
                  if (event.target.checked) set('consentGiven', false);
                }}
              />
              <span>
                <span className="feedback-checkbox__label">{t('feedback.anonymous.label')}</span>
                <span className="feedback-field__hint">{t('feedback.anonymous.hint')}</span>
              </span>
            </label>

            {form.isAnonymous ? null : (
              <>
                <p className="feedback-section__note">{t('feedback.contact.hint')}</p>

                <label className="feedback-field">
                  <span className="feedback-field__label">{t('feedback.field.name')}</span>
                  <input
                    className="rk-input"
                    type="text"
                    autoComplete="name"
                    value={form.contactName}
                    onChange={(event) => set('contactName', event.target.value)}
                  />
                </label>

                <div className="feedback-grid">
                  <label className="feedback-field">
                    <span className="feedback-field__label">{t('feedback.field.phone')}</span>
                    <input
                      className="rk-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={form.contactPhone}
                      aria-invalid={fieldError('contactPhone') !== null}
                      onChange={(event) => set('contactPhone', event.target.value)}
                    />
                    {fieldError('contactPhone') ? (
                      <span className="feedback-field__error" role="alert">
                        {fieldError('contactPhone')}
                      </span>
                    ) : null}
                  </label>

                  <label className="feedback-field">
                    <span className="feedback-field__label">{t('feedback.field.email')}</span>
                    <input
                      className="rk-input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={form.contactEmail}
                      aria-invalid={fieldError('contactEmail') !== null}
                      onChange={(event) => set('contactEmail', event.target.value)}
                    />
                    {fieldError('contactEmail') ? (
                      <span className="feedback-field__error" role="alert">
                        {fieldError('contactEmail')}
                      </span>
                    ) : null}
                  </label>
                </div>

                <label className="feedback-checkbox">
                  <input
                    type="checkbox"
                    checked={form.consentGiven}
                    aria-invalid={fieldError('consentGiven') !== null}
                    onChange={(event) => set('consentGiven', event.target.checked)}
                  />
                  <span>
                    <span className="feedback-checkbox__label">{t('feedback.consent.label')}</span>
                    <span className="feedback-field__hint">{t('feedback.consent.note')}</span>
                  </span>
                </label>

                {fieldError('consentGiven') ? (
                  <p className="feedback-field__error" role="alert">
                    {fieldError('consentGiven')}
                  </p>
                ) : null}
              </>
            )}
          </fieldset>

          {/* --- 7. Submit ------------------------------------------------ */}
          <div className="feedback-form__actions">
            <Button type="submit" variant="primary" size="lg" isLoading={submitting}>
              {submitting ? t('feedback.submitting') : t('feedback.submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
