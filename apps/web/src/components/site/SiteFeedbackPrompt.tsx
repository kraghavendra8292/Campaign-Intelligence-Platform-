import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { SiteFeedbackReaction } from '@rk/types';
import { ApiError, graphqlRequest } from '../../features/auth/authClient';
import { useSite } from '../../features/site/SiteContext';
import { readQrReferrer } from '../../features/site/useIssueSubmission';
import {
  getSiteFeedbackPromptDelayMs,
  hasSiteFeedbackBeenGiven,
  markSiteFeedbackGiven,
  markSiteFeedbackPromptDismissed,
  wasSiteFeedbackPromptDismissed,
  SITE_FEEDBACK_GIVEN_EVENT,
} from '../../features/site/feedbackPromptStorage';

const SUBMIT_SITE_FEEDBACK = /* GraphQL */ `
  mutation SubmitSiteFeedback($input: SubmitSiteFeedbackInput!) {
    submitSiteFeedback(input: $input) {
      id
      reaction
      submittedAt
    }
  }
`;

/** Show once after this much active time on the site without feedback. */
const DWELL_MS = 30_000;

const REACTIONS: readonly {
  value: SiteFeedbackReaction;
  labelKey: 'opinion.great' | 'opinion.ok' | 'opinion.worst';
  tone: 'great' | 'ok' | 'worst';
  icon: string;
}[] = [
  { value: 'GREAT', labelKey: 'opinion.great', tone: 'great', icon: '😊' },
  { value: 'OK', labelKey: 'opinion.ok', tone: 'ok', icon: '😐' },
  { value: 'WORST', labelKey: 'opinion.worst', tone: 'worst', icon: '😕' },
];

/**
 * After ~30s on the public site without feedback, ask once for
 * Good / OK / Need to improve.
 *
 * Uses a wall-clock timeout (not Page Visibility). Pausing on `document.hidden`
 * prevented the prompt in DevTools device mode and when the IDE stole focus —
 * both report the document as hidden while the user is still "on" the page.
 */
export function SiteFeedbackPrompt() {
  const { t, organizationSlug } = useSite();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [reaction, setReaction] = useState<SiteFeedbackReaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const close = useCallback(() => {
    markSiteFeedbackPromptDismissed();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (hasSiteFeedbackBeenGiven(organizationSlug)) {
      setOpen(false);
    }
  }, [organizationSlug]);

  useEffect(() => {
    const onGiven = () => setOpen(false);
    window.addEventListener(SITE_FEEDBACK_GIVEN_EVENT, onGiven);
    return () => window.removeEventListener(SITE_FEEDBACK_GIVEN_EVENT, onGiven);
  }, []);

  useEffect(() => {
    if (hasSiteFeedbackBeenGiven(organizationSlug) || wasSiteFeedbackPromptDismissed()) {
      return;
    }

    const delay = getSiteFeedbackPromptDelayMs(organizationSlug, DWELL_MS);
    const timeoutId = window.setTimeout(() => {
      if (hasSiteFeedbackBeenGiven(organizationSlug) || wasSiteFeedbackPromptDismissed()) {
        return;
      }
      setOpen(true);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [organizationSlug]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);

    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const onSubmit = useCallback(async () => {
    if (!reaction || submitting) return;
    if (hasSiteFeedbackBeenGiven(organizationSlug)) {
      setOpen(false);
      return;
    }

    setSubmitting(true);
    setStatus('idle');
    setErrorMessage(null);

    try {
      await graphqlRequest<{
        submitSiteFeedback: { id: string; reaction: SiteFeedbackReaction; submittedAt: string };
      }>(SUBMIT_SITE_FEEDBACK, {
        skipAuthRetry: true,
        variables: {
          input: {
            organizationSlug: organizationSlug || null,
            reaction,
            comment: null,
            qrCode: readQrReferrer(),
          },
        },
      });
      setStatus('success');
      markSiteFeedbackGiven(organizationSlug);
      window.setTimeout(() => setOpen(false), 900);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof ApiError ? error.message : t('opinion.error'));
    } finally {
      setSubmitting(false);
    }
  }, [reaction, submitting, organizationSlug, t]);

  if (!open) return null;

  return (
    <div className="feedback-prompt" role="presentation">
      <button
        type="button"
        className="feedback-prompt__backdrop"
        aria-label={t('opinion.promptDismiss')}
        onClick={close}
      />
      <div
        ref={dialogRef}
        className="feedback-prompt__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="feedback-prompt__header">
          <h2 className="feedback-prompt__title" id={titleId}>
            {t('opinion.promptTitle')}
          </h2>
          <p className="feedback-prompt__subtitle">{t('opinion.promptSubtitle')}</p>
        </header>

        <div
          className="feedback-prompt__reactions"
          role="radiogroup"
          aria-label={t('opinion.reactionsLabel')}
        >
          {REACTIONS.map((option) => {
            const selected = reaction === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`feedback-prompt__reaction feedback-prompt__reaction--${option.tone}${
                  selected ? ' is-selected' : ''
                }`}
                onClick={() => {
                  setReaction(option.value);
                  setStatus('idle');
                }}
              >
                {selected ? (
                  <span className="feedback-prompt__check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
                <span className="feedback-prompt__icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="feedback-prompt__label">{t(option.labelKey)}</span>
              </button>
            );
          })}
        </div>

        <div className="feedback-prompt__actions">
          <button
            type="button"
            className="feedback-prompt__submit"
            disabled={!reaction || submitting}
            onClick={() => void onSubmit()}
          >
            {submitting ? t('opinion.submitting') : t('opinion.submit')}
          </button>
          <button type="button" className="feedback-prompt__dismiss" onClick={close}>
            {t('opinion.promptClose')}
          </button>
        </div>

        {status !== 'idle' ? (
          <p
            className={`feedback-prompt__status feedback-prompt__status--${status}`}
            role="status"
            aria-live="polite"
          >
            {status === 'success' ? t('opinion.success') : (errorMessage ?? t('opinion.error'))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
