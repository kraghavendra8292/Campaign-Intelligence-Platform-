import { useCallback, useState, type FormEvent } from 'react';
import { Button } from '@rk/ui';
import { COMMUNICATION_LIMITS } from '@rk/types';
import { ApiError, graphqlRequest } from '../../features/auth/authClient';
import {
  FOLLOW_ISSUE_MUTATION,
  SUBMIT_FOLLOW_UP_MUTATION,
  UNSUBSCRIBE_MUTATION,
  type FollowUpResponse,
  type PublicIssueUpdateRow,
  type PublicTimelineEntry,
} from '../../features/communication/communicationQueries';
import { useSite } from '../../features/site/SiteContext';
import { formatDate } from '../../lib/format';
import type { StringKey } from '../../i18n/strings';

/**
 * The citizen-facing halves of the tracking page.
 *
 * MOBILE FIRST, because this is reached by scanning a poster: most visitors
 * arrive on a phone, outdoors, on mobile data, often one-handed. Every control
 * here is full width at small sizes, the timeline reads top to bottom rather
 * than across, and the follow-up answer is three large buttons rather than a
 * select - a dropdown is three taps and a scroll, three buttons is one tap.
 *
 * TYPING IS MINIMISED for the same reason. The tracking code is long and is
 * asked for only when the citizen wants something that needs it; checking a
 * status never requires it.
 *
 * ALL SERVER TEXT IS RENDERED AS TEXT. Public updates are staff-authored prose
 * and citizen comments are citizen-authored; both arrive as plain text and go
 * through JSX interpolation. There is no `dangerouslySetInnerHTML` in this file
 * or anywhere in the Phase 8 UI.
 */

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/**
 * The progress list.
 *
 * Each entry is a status and a date, which is all the API returns - there is no
 * actor, no note and no internal detail available to render even by mistake.
 * The most recent entry is marked current so somebody scanning the page sees
 * where their report has got to without reading every row.
 */
export function PublicTimeline({ entries }: { entries: PublicTimelineEntry[] }) {
  const { t } = useSite();

  if (entries.length === 0) return null;

  return (
    <section className="track-section">
      <h2 className="track-section__title">{t('track.timeline')}</h2>
      <ol className="track-timeline">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            className={
              index === entries.length - 1
                ? 'track-timeline__step track-timeline__step--current'
                : 'track-timeline__step'
            }
          >
            <span className="track-timeline__marker" aria-hidden="true" />
            <span className="track-timeline__label">
              {t(`issueStatus.${entry.status}` as StringKey)}
            </span>
            <time className="track-timeline__date" dateTime={entry.occurredAt}>
              {formatDate(entry.occurredAt) ?? ''}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Public updates
// ---------------------------------------------------------------------------

/** Messages staff wrote for this citizen. Newest first, plain text. */
export function PublicUpdates({ updates }: { updates: PublicIssueUpdateRow[] }) {
  const { t } = useSite();

  return (
    <section className="track-section">
      <h2 className="track-section__title">{t('track.updates')}</h2>

      {updates.length === 0 ? (
        <p className="track-empty">{t('track.noUpdates')}</p>
      ) : (
        <ul className="track-updates">
          {updates.map((update) => (
            <li key={update.id} className="track-update">
              <time className="track-update__date" dateTime={update.publishedAt ?? undefined}>
                {update.publishedAt ? formatDate(update.publishedAt) : ''}
              </time>
              {/* Plain text through interpolation. */}
              <p className="track-update__body">{update.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Follow
// ---------------------------------------------------------------------------

type FollowState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'following'; destination: string | null }
  | { status: 'stopped' }
  | { status: 'error'; message: string };

/**
 * Turning email updates on, and off again.
 *
 * CONSENT IS A SEPARATE, UNTICKED CHECKBOX and the submit button is disabled
 * until it is ticked. Not pre-ticked, not bundled with anything, and worded to
 * say exactly what will be sent - the note underneath states that the address
 * is used for this submission and nothing else, which is a promise the data
 * model actually keeps: there is no cross-issue citizen record to add it to.
 *
 * The tracking code is required here and explained rather than merely demanded,
 * because a citizen who does not have it should understand they have lost
 * nothing except this optional extra.
 */
export function FollowIssue({
  reference,
  initiallySubscribed,
  onChanged,
}: {
  reference: string;
  initiallySubscribed: boolean;
  onChanged?: () => void;
}) {
  const { t } = useSite();
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<FollowState>(
    initiallySubscribed ? { status: 'following', destination: null } : { status: 'idle' },
  );

  const follow = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setState({ status: 'saving' });

      try {
        const data = await graphqlRequest<{
          followIssue: { subscribed: boolean; destinationRedacted: string | null };
        }>(FOLLOW_ISSUE_MUTATION, {
          variables: {
            input: {
              reference,
              trackingToken: token.trim(),
              channel: 'EMAIL',
              destination: email.trim(),
              consent,
            },
          },
          skipAuthRetry: true,
        });

        setState({
          status: 'following',
          destination: data.followIssue.destinationRedacted,
        });
        onChanged?.();
      } catch (error) {
        setState({
          status: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'We could not save that just now. Please try again.',
        });
      }
    },
    [reference, token, email, consent, onChanged],
  );

  const stop = useCallback(async () => {
    setState({ status: 'saving' });
    try {
      await graphqlRequest(UNSUBSCRIBE_MUTATION, {
        variables: { reference, trackingToken: token.trim() },
        skipAuthRetry: true,
      });
      setState({ status: 'stopped' });
      onChanged?.();
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'We could not save that just now. Please try again.',
      });
    }
  }, [reference, token, onChanged]);

  return (
    <section className="track-section">
      <h2 className="track-section__title">{t('track.follow')}</h2>
      <p className="track-section__intro">{t('track.followIntro')}</p>

      {state.status === 'following' ? (
        <div className="track-followed" role="status">
          <p>
            {t('track.following')}
            {state.destination ? ` (${state.destination})` : ''}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void stop();
            }}
            className="track-form"
          >
            <label className="feedback-field">
              <span className="feedback-field__label">{t('track.trackingCode')}</span>
              <input
                className="rk-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <Button type="submit" variant="secondary" disabled={token.trim().length === 0}>
              {t('track.stop')}
            </Button>
          </form>
        </div>
      ) : state.status === 'stopped' ? (
        <p className="track-followed" role="status">
          {t('track.stopped')}
        </p>
      ) : (
        <form className="track-form" onSubmit={(event) => void follow(event)} noValidate>
          <label className="feedback-field">
            <span className="feedback-field__label">{t('track.trackingCode')}</span>
            <input
              className="rk-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <span className="feedback-field__hint">{t('track.trackingCodeHint')}</span>
          </label>

          <label className="feedback-field">
            <span className="feedback-field__label">{t('track.email')}</span>
            <input
              className="rk-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          {/* Unticked, single-purpose, and never bundled with anything else. */}
          <label className="feedback-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>{t('track.consent')}</span>
          </label>
          <p className="feedback-field__hint">{t('track.consentNote')}</p>

          <Button
            type="submit"
            variant="primary"
            isLoading={state.status === 'saving'}
            disabled={!consent || token.trim().length === 0 || email.trim().length === 0}
          >
            {t('track.followSubmit')}
          </Button>
        </form>
      )}

      {state.status === 'error' ? (
        <p className="track-result track-result--empty" role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------

const ANSWERS: Array<{ value: FollowUpResponse; labelKey: StringKey }> = [
  { value: 'RESOLVED', labelKey: 'track.answerYes' },
  { value: 'PARTIALLY_RESOLVED', labelKey: 'track.answerPartly' },
  { value: 'NOT_RESOLVED', labelKey: 'track.answerNo' },
];

/**
 * "Was this resolved?"
 *
 * Three large buttons rather than a select: on a phone a dropdown is three taps
 * and a scroll, and this is the one question the whole follow-up loop exists to
 * ask.
 *
 * The intro says plainly that the answer does not change the status by itself.
 * That is both true and important - a citizen who taps "no" and then watches
 * the status stay RESOLVED should understand that a person is going to look,
 * rather than conclude the form did nothing.
 */
export function FollowUpForm({
  reference,
  onSubmitted,
}: {
  reference: string;
  onSubmitted?: () => void;
}) {
  const { t } = useSite();
  const [token, setToken] = useState('');
  const [response, setResponse] = useState<FollowUpResponse | null>(null);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'done'; message: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!response) return;

      setState({ status: 'saving' });
      try {
        const data = await graphqlRequest<{
          submitIssueFollowUp: { recorded: boolean; reopenRequested: boolean; message: string };
        }>(SUBMIT_FOLLOW_UP_MUTATION, {
          variables: {
            input: {
              reference,
              trackingToken: token.trim(),
              response,
              comment: comment.trim().length > 0 ? comment.trim() : null,
            },
          },
          skipAuthRetry: true,
        });

        setState({ status: 'done', message: data.submitIssueFollowUp.message });
        onSubmitted?.();
      } catch (error) {
        setState({
          status: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'We could not send that just now. Please try again.',
        });
      }
    },
    [reference, token, response, comment, onSubmitted],
  );

  if (state.status === 'done') {
    return (
      <section className="track-section">
        <h2 className="track-section__title">{t('track.resolvedQuestion')}</h2>
        <p className="track-followed" role="status">
          {state.message}
        </p>
      </section>
    );
  }

  return (
    <section className="track-section">
      <h2 className="track-section__title">{t('track.resolvedQuestion')}</h2>
      <p className="track-section__intro">{t('track.resolvedIntro')}</p>

      <form className="track-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="track-answers" role="group" aria-label={t('track.resolvedQuestion')}>
          {ANSWERS.map((answer) => (
            <button
              key={answer.value}
              type="button"
              className={
                response === answer.value ? 'track-answer track-answer--selected' : 'track-answer'
              }
              aria-pressed={response === answer.value}
              onClick={() => setResponse(answer.value)}
            >
              {t(answer.labelKey)}
            </button>
          ))}
        </div>

        <label className="feedback-field">
          <span className="feedback-field__label">{t('track.trackingCode')}</span>
          <input
            className="rk-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>

        <label className="feedback-field">
          <span className="feedback-field__label">{t('track.commentLabel')}</span>
          <textarea
            className="rk-input"
            rows={4}
            maxLength={COMMUNICATION_LIMITS.followUpCommentMax}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>

        <Button
          type="submit"
          variant="primary"
          isLoading={state.status === 'saving'}
          disabled={response === null || token.trim().length === 0}
        >
          {t('track.followUpSubmit')}
        </Button>
      </form>

      {state.status === 'error' ? (
        <p className="track-result track-result--empty" role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
