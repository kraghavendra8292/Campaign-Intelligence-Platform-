import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@rk/ui';
import '../../styles/issues.css';
import { ApiError, graphqlRequest } from '../../features/auth/authClient';
import {
  PUBLIC_TIMELINE_QUERY,
  type PublicTimelineData,
} from '../../features/communication/communicationQueries';
import {
  FollowIssue,
  FollowUpForm,
  PublicTimeline,
  PublicUpdates,
} from '../../components/communication/PublicIssueSections';
import { SiteBackBar } from '../../components/site/SiteBackBar';
import { useSite } from '../../features/site/SiteContext';
import { useSeo } from '../../features/site/useSeo';
import { formatDate } from '../../lib/format';
import type { StringKey } from '../../i18n/strings';

/**
 * Public submission tracking.
 *
 * A citizen with their reference can see that something is happening. That is
 * the whole feature, and the restraint is the point: the page shows the six
 * fields the API is willing to return and has no way to ask for more, because
 * the public type does not have more.
 *
 * The status vocabulary is translated into words a member of the public would
 * use - "Being worked on" rather than IN_PROGRESS - since the internal names
 * mean nothing to them and "REJECTED" in particular reads far harsher than the
 * administrative decision it represents.
 */

/**
 * Phase 8 replaces the Phase 5 `publicIssueStatus` query with
 * `publicIssueTimeline`, which is a strict superset: the same six disclosed
 * scalars plus the dated timeline and the updates staff published. The older
 * query remains in the schema and is still served - a client that has not been
 * updated keeps working.
 */
type PublicStatus = NonNullable<PublicTimelineData['publicIssueTimeline']>;

type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; result: PublicStatus }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

export function TrackIssuePage() {
  const { t } = useSite();
  const [reference, setReference] = useState('');
  const [state, setState] = useState<LookupState>({ status: 'idle' });

  useSeo({ title: t('track.title'), description: t('track.intro'), path: '/track' });

  /** Re-reads the submission after a citizen action changes what is shown. */
  async function handleRefresh(reference: string): Promise<void> {
    try {
      const data = await graphqlRequest<PublicTimelineData>(PUBLIC_TIMELINE_QUERY, {
        variables: { reference },
        skipAuthRetry: true,
      });
      if (data.publicIssueTimeline) {
        setState({ status: 'found', result: data.publicIssueTimeline });
      }
    } catch {
      // A failed refresh leaves the page as it was. The action itself already
      // succeeded and reported so; replacing that with an error would be worse.
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = reference.trim();
    if (trimmed.length === 0) return;

    setState({ status: 'loading' });

    try {
      const data = await graphqlRequest<PublicTimelineData>(PUBLIC_TIMELINE_QUERY, {
        variables: { reference: trimmed },
        skipAuthRetry: true,
      });

      // The API returns null for unknown, malformed and withheld alike, so this
      // page cannot be used to distinguish them either.
      setState(
        data.publicIssueTimeline
          ? { status: 'found', result: data.publicIssueTimeline }
          : { status: 'notFound' },
      );
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'We could not check that just now. Please try again.',
      });
    }
  }

  return (
    <div className="section">
      <div className="section__inner section__inner--narrow">
        <SiteBackBar fallbackTo="/" backLabel={t('nav.backHome')} listTo="/" listLabel={t('nav.home')} />
        <header className="section-header">
          <div>
            <h1 className="section-header__title">{t('track.title')}</h1>
            <p className="section-header__subtitle">{t('track.intro')}</p>
          </div>
        </header>

        <form className="track-form" onSubmit={handleSubmit} noValidate>
          <label className="feedback-field">
            <span className="feedback-field__label">{t('track.field')}</span>
            <input
              className="rk-input"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={t('track.placeholder')}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>

          <Button type="submit" variant="primary" isLoading={state.status === 'loading'}>
            {t('track.submit')}
          </Button>
        </form>

        {state.status === 'notFound' ? (
          <p className="track-result track-result--empty" role="status">
            {t('track.notFound')}
          </p>
        ) : null}

        {state.status === 'error' ? (
          <p className="track-result track-result--empty" role="alert">
            {state.message}
          </p>
        ) : null}

        {state.status === 'found' ? (
          <div className="track-result" role="status">
            <h2 className="track-result__title">{t('track.result')}</h2>

            <dl className="track-result__facts">
              <div>
                <dt>{t('track.field')}</dt>
                <dd className="track-result__reference">{state.result.referenceNumber}</dd>
              </div>
              <div>
                <dt>{t('feedback.stepType')}</dt>
                <dd>{t(`feedback.type.${state.result.type}` as StringKey)}</dd>
              </div>
              <div>
                <dt>{t('feedback.field.category')}</dt>
                <dd>{state.result.categoryLabel ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('track.submittedOn')}</dt>
                <dd>{formatDate(state.result.submittedAt) ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('track.updatedOn')}</dt>
                <dd>{formatDate(state.result.updatedAt) ?? '—'}</dd>
              </div>
            </dl>

            <p className="track-result__status">
              {t(`issueStatus.${state.result.status}` as StringKey)}
            </p>

            {/* Says plainly why the page is sparse, so the restraint reads as
                deliberate care rather than as something being broken. */}
            <p className="track-result__privacy">{t('track.privacy')}</p>
          </div>
        ) : null}

        {/*
          Phase 8 sections. Rendered below the Phase 5 status card rather than
          replacing it: the card answers the question most visitors came with,
          and everything here is optional depth beneath it.
        */}
        {state.status === 'found' ? (
          <>
            <PublicTimeline entries={state.result.timeline} />
            <PublicUpdates updates={state.result.publicUpdates} />

            {state.result.existingFollowUp ? (
              <p className="track-followed" role="status">
                {t('track.followUpAlready')}
              </p>
            ) : state.result.followUpAvailable ? (
              <FollowUpForm
                reference={state.result.referenceNumber}
                onSubmitted={() => void handleRefresh(state.result.referenceNumber)}
              />
            ) : null}

            <FollowIssue reference={state.result.referenceNumber} initiallySubscribed={false} />
          </>
        ) : null}

        <p className="track-form__footer">
          <Link to="/feedback">{t('nav.feedback')}</Link>
        </p>
      </div>
    </div>
  );
}
