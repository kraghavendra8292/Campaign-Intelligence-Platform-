import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ISSUE_LIMITS } from '@rk/types';
import { Button, Icon } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import { useSeo } from '../../features/site/useSeo';
import {
  readQrReferrer,
  uploadAttachment,
  useIssueSubmission,
  type UploadedAttachment,
} from '../../features/site/useIssueSubmission';
import { SiteBackBar } from '../../components/site/SiteBackBar';

/**
 * Public “Report an issue” form — issue only, four blocks.
 *
 * Built for someone on a phone next to the problem: short title, explanation,
 * where it is, optional photos. No account, anonymous by default, no type picker.
 */

interface FormState {
  title: string;
  description: string;
  addressDescription: string;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY: FormState = {
  title: '',
  description: '',
  addressDescription: '',
  latitude: null,
  longitude: null,
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

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

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
      setUploadError(error instanceof Error ? error.message : t('feedback.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

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
      type: 'ISSUE',
      title: form.title,
      description: form.description,
      categoryKey: null,
      ward: null,
      locality: null,
      area: null,
      addressDescription: form.addressDescription || null,
      latitude: form.latitude,
      longitude: form.longitude,
      isAnonymous: true,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      consentGiven: false,
      qrCode: readQrReferrer(),
      attachments: attachments.map((file) => ({ id: file.id, claimToken: file.claimToken })),
    });
  }

  if (submitState.status === 'done') {
    const receipt = submitState.receipt;

    return (
      <div className="section section--report">
        <div className="section__inner section__inner--narrow">
          <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
          <div className="feedback-done" role="status">
            <span className="feedback-done__mark" aria-hidden="true">
              ✓
            </span>
            <h1 className="feedback-done__title">{t('feedback.done.title')}</h1>
            <p className="feedback-done__label">{t('feedback.done.reference')}</p>
            <p className="feedback-done__reference">{receipt.referenceNumber}</p>
            <p className="feedback-done__save">{t('feedback.done.save')}</p>
            <p className="feedback-done__note">{t('feedback.done.anonymous')}</p>
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
    <div className="section section--report">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />

        <header className="report-hero">
          <p className="report-hero__eyebrow">{t('feedback.type.ISSUE')}</p>
          <h1 className="report-hero__title">{t('feedback.title')}</h1>
          <p className="report-hero__subtitle">{t('feedback.intro')}</p>
        </header>

        <form className="report-form" onSubmit={handleSubmit} noValidate>
          {generalError ? (
            <p className="feedback-form__error" role="alert">
              {generalError}
            </p>
          ) : null}

          <label className="report-field" htmlFor="report-title">
            <span className="report-field__label">
              {t('feedback.field.title')} <span className="report-field__req" aria-hidden="true">*</span>
            </span>
            <span className="report-field__hint" id="report-title-hint">
              {t('feedback.field.titleHint')}
            </span>
            <input
              id="report-title"
              className="rk-input"
              type="text"
              required
              maxLength={ISSUE_LIMITS.titleMax}
              value={form.title}
              aria-describedby="report-title-hint"
              aria-invalid={fieldError('title') !== null}
              onChange={(event) => set('title', event.target.value)}
            />
            {fieldError('title') ? (
              <span className="feedback-field__error" role="alert">
                {fieldError('title')}
              </span>
            ) : null}
          </label>

          <label className="report-field" htmlFor="report-explanation">
            <span className="report-field__label">
              {t('feedback.field.description')}{' '}
              <span className="report-field__req" aria-hidden="true">*</span>
            </span>
            <span className="report-field__hint" id="report-explanation-hint">
              {t('feedback.field.descriptionHint')}
            </span>
            <textarea
              id="report-explanation"
              className="rk-textarea report-form__textarea"
              rows={4}
              required
              maxLength={ISSUE_LIMITS.descriptionMax}
              value={form.description}
              aria-describedby="report-explanation-hint"
              aria-invalid={fieldError('description') !== null}
              onChange={(event) => set('description', event.target.value)}
            />
            {fieldError('description') ? (
              <span className="feedback-field__error" role="alert">
                {fieldError('description')}
              </span>
            ) : null}
          </label>

          <div className="report-field">
            <label className="report-field__label" htmlFor="report-where">
              {t('feedback.stepLocation')}
            </label>
            <span className="report-field__hint" id="report-where-hint">
              {t('feedback.location.optional')}
            </span>
            <input
              id="report-where"
              className="rk-input"
              type="text"
              placeholder={t('feedback.field.addressHint')}
              value={form.addressDescription}
              aria-describedby="report-where-hint"
              onChange={(event) => set('addressDescription', event.target.value)}
            />
            <div className="report-location">
              {form.latitude !== null && form.longitude !== null ? (
                <>
                  <span className="feedback-location__added">{t('feedback.location.added')}</span>
                  <button
                    type="button"
                    className="report-location__link"
                    onClick={() => {
                      set('latitude', null);
                      set('longitude', null);
                    }}
                  >
                    {t('feedback.location.remove')}
                  </button>
                </>
              ) : (
                <button type="button" className="report-location__btn" onClick={useCurrentLocation}>
                  <Icon name="target" size={1} />
                  {t('feedback.location.use')}
                </button>
              )}
            </div>
            {locationError ? (
              <p className="feedback-field__error" role="alert">
                {locationError}
              </p>
            ) : null}
          </div>

          <div className="report-field">
            <span className="report-field__label" id="report-photos-label">
              {t('feedback.stepPhoto')}
            </span>
            <span className="report-field__hint" id="report-photos-hint">
              {t('feedback.field.photoHint')}
            </span>
            <label className="report-upload" htmlFor="report-photos">
              <input
                id="report-photos"
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                disabled={uploading || attachments.length >= ISSUE_LIMITS.maxAttachments}
                aria-labelledby="report-photos-label"
                aria-describedby="report-photos-hint"
                onChange={(event) => void handleFiles(event.target.files)}
              />
              <span className="report-upload__icon" aria-hidden="true">
                <Icon name="images" size={1.25} />
              </span>
              <span className="report-upload__text">
                {uploading ? t('feedback.submitting') : t('feedback.field.photo')}
              </span>
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
          </div>

          <div className="report-form__actions">
            <Button type="submit" variant="primary" size="lg" isLoading={submitting}>
              {submitting ? t('feedback.submitting') : t('feedback.submit')}
            </Button>
            <p className="report-form__note">{t('feedback.formNote')}</p>
          </div>
        </form>
      </div>
    </div>
  );
}
