import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@rk/ui';
import type { SiteFeedbackReaction } from '@rk/types';
import { SITE_FEEDBACK_LIMITS } from '@rk/types';
import { ApiError, graphqlRequest } from '../../features/auth/authClient';
import { useSite } from '../../features/site/SiteContext';
import { readQrReferrer } from '../../features/site/useIssueSubmission';
import {
  hasSiteFeedbackBeenGiven,
  markSiteFeedbackGiven,
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
 * Homepage opinion pulse — Good / OK / Need to improve + optional commentary.
 *
 * Once submitted successfully, the section hides and further submissions from
 * this browser are blocked (localStorage). The dwell popup shares the same flag.
 */
export function HomeOpinionSection() {
  const { t, organizationSlug } = useSite();
  const titleId = useId();
  const commentId = useId();
  const statusId = useId();

  const [hidden, setHidden] = useState(() => hasSiteFeedbackBeenGiven(organizationSlug));
  const [reaction, setReaction] = useState<SiteFeedbackReaction | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (hasSiteFeedbackBeenGiven(organizationSlug)) {
      setHidden(true);
    }
  }, [organizationSlug]);

  useEffect(() => {
    const onGiven = () => setHidden(true);
    window.addEventListener(SITE_FEEDBACK_GIVEN_EVENT, onGiven);
    return () => window.removeEventListener(SITE_FEEDBACK_GIVEN_EVENT, onGiven);
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!reaction || submitting) return;
      if (hasSiteFeedbackBeenGiven(organizationSlug)) {
        setHidden(true);
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
              comment: comment.trim() || null,
              qrCode: readQrReferrer(),
            },
          },
        });
        markSiteFeedbackGiven(organizationSlug);
        setStatus('success');
        setComment('');
        setReaction(null);
        window.setTimeout(() => setHidden(true), 1200);
      } catch (error) {
        setStatus('error');
        setErrorMessage(
          error instanceof ApiError ? error.message : t('opinion.error'),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [reaction, submitting, organizationSlug, comment, t],
  );

  if (hidden) return null;

  return (
    <section className="home-opinion" aria-labelledby={titleId}>
      <div className="home-opinion__inner">
        <header className="home-opinion__header">
          <span className="home-opinion__badge" aria-hidden="true">
            💬
          </span>
          <div className="home-opinion__heading">
            <h2 className="home-opinion__title" id={titleId}>
              {t('opinion.title')}
            </h2>
            <p className="home-opinion__subtitle">{t('opinion.subtitle')}</p>
          </div>
        </header>

        <form className="home-opinion__form" onSubmit={onSubmit} noValidate>
          <div
            className="home-opinion__reactions"
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
                  className={`home-opinion__reaction home-opinion__reaction--${option.tone}${
                    selected ? ' is-selected' : ''
                  }`}
                  onClick={() => {
                    setReaction(option.value);
                    setStatus('idle');
                  }}
                >
                  {selected ? (
                    <span className="home-opinion__check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                  <span className="home-opinion__reaction-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="home-opinion__reaction-label">{t(option.labelKey)}</span>
                </button>
              );
            })}
          </div>

          <div className="home-opinion__field">
            <label className="visually-hidden" htmlFor={commentId}>
              {t('opinion.commentLabel')}
            </label>
            <div className="home-opinion__textarea-wrap">
              <span className="home-opinion__textarea-icon" aria-hidden="true">
                ✏️
              </span>
              <textarea
                id={commentId}
                className="home-opinion__textarea"
                value={comment}
                maxLength={SITE_FEEDBACK_LIMITS.maxCommentChars}
                rows={3}
                placeholder={t('opinion.commentPlaceholder')}
                onChange={(event) => setComment(event.target.value)}
                aria-describedby={`${commentId}-count`}
              />
              <span id={`${commentId}-count`} className="home-opinion__count">
                {comment.length}/{SITE_FEEDBACK_LIMITS.maxCommentChars}
              </span>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            className="home-opinion__submit"
            disabled={!reaction || submitting}
            isLoading={submitting}
            aria-describedby={status !== 'idle' ? statusId : undefined}
          >
            <span aria-hidden="true">✈️</span>
            {submitting ? t('opinion.submitting') : t('opinion.submit')}
          </Button>

          {status !== 'idle' ? (
            <div
              id={statusId}
              className={`home-opinion__status home-opinion__status--${status}`}
              role="status"
              aria-live="polite"
            >
              {status === 'success' ? t('opinion.success') : (errorMessage ?? t('opinion.error'))}
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
