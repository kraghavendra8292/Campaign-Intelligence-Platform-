import { useCallback, useId, useState } from 'react';
import { Button } from '@rk/ui';
import type { SiteFeedbackReaction } from '@rk/types';
import { SITE_FEEDBACK_LIMITS } from '@rk/types';
import { ApiError, graphqlRequest } from '../../features/auth/authClient';
import { useSite } from '../../features/site/SiteContext';
import { readQrReferrer } from '../../features/site/useIssueSubmission';

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
  hintKey: 'opinion.greatEn' | 'opinion.okEn' | 'opinion.worstEn';
  tone: 'great' | 'ok' | 'worst';
  icon: string;
}[] = [
  { value: 'GREAT', labelKey: 'opinion.great', hintKey: 'opinion.greatEn', tone: 'great', icon: '😊' },
  { value: 'OK', labelKey: 'opinion.ok', hintKey: 'opinion.okEn', tone: 'ok', icon: '😐' },
  { value: 'WORST', labelKey: 'opinion.worst', hintKey: 'opinion.worstEn', tone: 'worst', icon: '😞' },
];

/**
 * Homepage opinion pulse — Great / Ok / Worst + optional commentary.
 *
 * Public GraphQL mutation; rate-limited on the server. Success / error surfaces
 * as an accessible inline status (toast-like), not a route change.
 */
export function HomeOpinionSection() {
  const { t, organizationSlug } = useSite();
  const titleId = useId();
  const commentId = useId();
  const statusId = useId();

  const [reaction, setReaction] = useState<SiteFeedbackReaction | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!reaction || submitting) return;

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
        setStatus('success');
        setComment('');
        setReaction(null);
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

  return (
    <section className="home-opinion" aria-labelledby={titleId}>
      <div className="home-opinion__inner">
        <header className="home-opinion__header">
          <span className="home-opinion__badge" aria-hidden="true">
            👥
          </span>
          <div>
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
                  <span className="home-opinion__reaction-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="home-opinion__reaction-label">{t(option.labelKey)}</span>
                  <span className="home-opinion__reaction-hint">{t(option.hintKey)}</span>
                </button>
              );
            })}
          </div>

          <div className="home-opinion__field">
            <label className="home-opinion__field-label" htmlFor={commentId}>
              <span aria-hidden="true">✏️</span>
              {t('opinion.commentLabel')}
            </label>
            <textarea
              id={commentId}
              className="home-opinion__textarea"
              value={comment}
              maxLength={SITE_FEEDBACK_LIMITS.maxCommentChars}
              rows={2}
              placeholder={t('opinion.commentPlaceholder')}
              onChange={(event) => setComment(event.target.value)}
              aria-describedby={`${commentId}-count`}
            />
            <div className="home-opinion__field-meta">
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
