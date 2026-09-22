import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Icon } from '@rk/ui';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import {
  COMMUNICATION_FOLLOW_UPS_QUERY,
  COMMUNICATION_OVERVIEW_QUERY,
  RETRY_NOTIFICATION,
  REVIEW_FOLLOW_UP,
  type AdminFollowUpRow,
  type CommunicationFollowUpsData,
  type CommunicationOverviewData,
  type NotificationStatus,
} from '../../../features/communication/communicationQueries';
import { CmsPageHeader, IfPermitted } from '../../../components/cms/CmsShell';
import { ListTableCard } from '../../../components/cms/ListPro';
import { QrBoundary, StatCard, StatGrid } from '../../../components/qr/QrShell';
import { ChartCard } from '../../../components/analytics/charts';
import { formatDateTime } from '../../../lib/format';

/**
 * The communication centre.
 *
 * WHAT AN OPERATOR COMES HERE TO ANSWER: is anything failing to reach citizens,
 * and is anybody waiting on us. So the page leads with delivery health, and the
 * reopen queue sits immediately below it - those are the two things that need a
 * person, and everything else is reference.
 *
 * SKIPPED IS REPORTED SEPARATELY FROM FAILED throughout. A skipped message is
 * one the system correctly chose not to send - no consent, provider not
 * configured, update withdrawn before it went out - and folding those into
 * failures would make a healthy deployment look broken and bury the handful of
 * genuine failures that need attention.
 *
 * NO RECIPIENT ADDRESS APPEARS ON THIS PAGE. The server masks it before it
 * leaves the service; this renders what it is given.
 */

const STATUS_TONE: Record<NotificationStatus, 'neutral' | 'success' | 'warning' | 'error'> = {
  QUEUED: 'neutral',
  PROCESSING: 'neutral',
  SENT: 'success',
  DELIVERED: 'success',
  FAILED: 'error',
  SKIPPED: 'warning',
};

const STATUS_OPTIONS: NotificationStatus[] = [
  'QUEUED',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'SKIPPED',
];

const RESPONSE_LABELS: Record<string, string> = {
  RESOLVED: 'Resolved',
  PARTIALLY_RESOLVED: 'Partly resolved',
  NOT_RESOLVED: 'Not resolved',
};

export function CommunicationCenterPage() {
  const [statuses, setStatuses] = useState<NotificationStatus[]>([]);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const variables = useMemo(
    () => ({ filter: { statuses: statuses.length > 0 ? statuses : null, first: 25 } }),
    [statuses],
  );

  const overview = useAdminQuery<CommunicationOverviewData>(
    COMMUNICATION_OVERVIEW_QUERY,
    variables,
  );
  const followUps = useAdminQuery<CommunicationFollowUpsData>(COMMUNICATION_FOLLOW_UPS_QUERY, {
    pendingOnly,
  });

  const retry = useAdminMutation<Record<string, unknown>, { notificationId: string }>(
    RETRY_NOTIFICATION,
  );

  useEffect(() => {
    if (overview.state.status !== 'loading' && followUps.state.status !== 'loading') {
      setRefreshing(false);
    }
  }, [overview.state.status, followUps.state.status]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    overview.refetch();
    followUps.refetch();
  }, [overview, followUps]);

  const onRetry = useCallback(
    async (notificationId: string) => {
      await retry.run({ notificationId });
      overview.refetch();
    },
    [retry, overview],
  );

  const toggleStatus = (status: NotificationStatus): void => {
    setStatuses((current) =>
      current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status],
    );
  };

  return (
    <div className="cms-page list-page comm-page">
      <CmsPageHeader
        title="Communication"
        description="What the campaign has told citizens about their submissions, and what reached them."
        backTo="/admin"
        backLabel="Back to dashboard"
      />

      <div className="list-toolbar">
        <div className="list-toolbar__left" />
        <div className="list-toolbar__right">
          <button
            type="button"
            className={`cms-icon-btn cms-icon-btn--square${refreshing ? ' cms-icon-btn--busy' : ''}`}
            aria-label="Refresh"
            title="Refresh"
            disabled={overview.state.status === 'loading'}
            onClick={handleRefresh}
          >
            <Icon name="refresh" size={1.15} />
          </button>
        </div>
      </div>

      <QrBoundary state={overview.state} refetch={overview.refetch}>
        {(data) => {
          const summary = data.communicationOverview;
          return (
            <>
              {!summary.notificationsEnabled ? (
                <p className="cms-error" role="alert">
                  Outbound messages are not enabled for this deployment. Public updates are still
                  published to citizens&rsquo; tracking pages; nothing is emailed. Messages are
                  recorded as skipped rather than sent.
                </p>
              ) : null}

              <StatGrid>
                <StatCard
                  label="Messages"
                  value={summary.total.toLocaleString()}
                  hint="Last 30 days"
                />
                <StatCard label="Sent" value={summary.sent.toLocaleString()} />
                <StatCard
                  label="Delivered"
                  value={summary.delivered.toLocaleString()}
                  hint="Confirmed by provider"
                />
                <StatCard label="Failed" value={summary.failed.toLocaleString()} />
                <StatCard
                  label="Skipped"
                  value={summary.skipped.toLocaleString()}
                  hint="Correctly not sent"
                />
                <StatCard
                  label="Delivery rate"
                  value={summary.successRatePct === null ? '—' : `${summary.successRatePct}%`}
                  hint="Null when nothing attempted"
                />
                <StatCard
                  label="Updates published"
                  value={summary.publishedUpdates.toLocaleString()}
                />
                <StatCard
                  label="Citizens following"
                  value={summary.activeSubscriptions.toLocaleString()}
                  hint="Active consents"
                />
              </StatGrid>

              <p className="cms-muted">
                Provider: {summary.provider}. Queue on this server: {summary.queue.pending} waiting,{' '}
                {summary.queue.activeWorkers} in progress. Computed{' '}
                {formatDateTime(summary.generatedAt)}.
              </p>

              <div className="list-toolbar">
                <div className="list-toolbar__left">
                  <div className="comm-filters" role="group" aria-label="Filter by status">
                    {STATUS_OPTIONS.map((status) => (
                      <label key={status} className="comm-filters__item">
                        <input
                          type="checkbox"
                          checked={statuses.includes(status)}
                          onChange={() => toggleStatus(status)}
                        />
                        <span>{status.toLowerCase()}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <ListTableCard
                title="Recent messages"
                count={data.communicationNotifications.nodes.length}
                countLabel="messages"
              >
                {data.communicationNotifications.nodes.length === 0 ? (
                  <p className="chart-empty">No messages match these filters.</p>
                ) : (
                  <table className="list-table">
                    <caption className="visually-hidden">Recent messages</caption>
                    <thead>
                      <tr>
                        <th scope="col">Submission</th>
                        <th scope="col">Event</th>
                        <th scope="col">Channel</th>
                        <th scope="col">Recipient</th>
                        <th scope="col">Status</th>
                        <th scope="col">When</th>
                        <th scope="col" className="list-table__actions-col">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.communicationNotifications.nodes.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {row.issue ? (
                              <Link to={`/admin/issues/${row.issue.id}`}>
                                {row.issue.referenceNumber}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{row.event.replace(/_/g, ' ').toLowerCase()}</td>
                          <td>{row.channel.toLowerCase()}</td>
                          <td>{row.recipientRedacted}</td>
                          <td>
                            <Badge tone={STATUS_TONE[row.status]}>
                              {row.status.toLowerCase()}
                            </Badge>
                            {row.failureReason ? (
                              <span className="cms-muted"> {row.failureReason}</span>
                            ) : null}
                          </td>
                          <td>{formatDateTime(row.createdAt)}</td>
                          <td className="list-table__actions-col">
                            {row.status === 'FAILED' && row.attempts < 3 ? (
                              <IfPermitted permission="COMMUNICATION_SEND">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={retry.state.submitting}
                                  onClick={() => void onRetry(row.id)}
                                >
                                  Retry
                                </Button>
                              </IfPermitted>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ListTableCard>

              {retry.state.error ? (
                <p className="cms-error" role="alert">
                  {retry.state.error}
                </p>
              ) : null}
            </>
          );
        }}
      </QrBoundary>

      <FollowUpQueue
        state={followUps.state}
        refetch={followUps.refetch}
        pendingOnly={pendingOnly}
        onTogglePending={() => setPendingOnly((value) => !value)}
      />
    </div>
  );
}

/**
 * The reopen queue.
 *
 * Shown as a worklist rather than a statistic, because every row is a citizen
 * who said their problem is not fixed and is waiting for somebody to look.
 */
function FollowUpQueue({
  state,
  refetch,
  pendingOnly,
  onTogglePending,
}: {
  state: ReturnType<typeof useAdminQuery<CommunicationFollowUpsData>>['state'];
  refetch: () => void;
  pendingOnly: boolean;
  onTogglePending: () => void;
}) {
  const review = useAdminMutation<
    Record<string, unknown>,
    { followUpId: string; outcome: string; note?: string | null }
  >(REVIEW_FOLLOW_UP);

  const decide = useCallback(
    async (followUpId: string, outcome: string) => {
      await review.run({ followUpId, outcome, note: null });
      refetch();
    },
    [review, refetch],
  );

  return (
    <ChartCard
      title={pendingOnly ? 'Waiting for review' : 'Citizen replies'}
      description={
        pendingOnly
          ? 'Citizens who said their submission is not resolved. Recording a decision here does not change the submission&rsquo;s status.'
          : 'All recent replies from citizens.'
      }
      action={
        <Button type="button" variant="secondary" onClick={onTogglePending}>
          {pendingOnly ? 'Show all replies' : 'Show only waiting'}
        </Button>
      }
    >
      <QrBoundary state={state} refetch={refetch}>
        {(data) =>
          data.communicationFollowUps.length === 0 ? (
            <p className="chart-empty">
              {pendingOnly ? 'Nothing is waiting for review.' : 'No citizens have replied yet.'}
            </p>
          ) : (
            <ul className="comm-followups">
              {data.communicationFollowUps.map((followUp) => (
                <QueueRow
                  key={followUp.id}
                  followUp={followUp}
                  busy={review.state.submitting}
                  onDecide={(outcome) => void decide(followUp.id, outcome)}
                />
              ))}
            </ul>
          )
        }
      </QrBoundary>
    </ChartCard>
  );
}

function QueueRow({
  followUp,
  busy,
  onDecide,
}: {
  followUp: AdminFollowUpRow;
  busy: boolean;
  onDecide: (outcome: string) => void;
}) {
  return (
    <li className="comm-followup">
      <div className="comm-update__head">
        {followUp.issue ? (
          <Link to={`/admin/issues/${followUp.issue.id}`}>{followUp.issue.referenceNumber}</Link>
        ) : null}
        <Badge
          tone={
            followUp.response === 'RESOLVED'
              ? 'success'
              : followUp.response === 'NOT_RESOLVED'
                ? 'error'
                : 'warning'
          }
        >
          {RESPONSE_LABELS[followUp.response] ?? followUp.response}
        </Badge>
        {followUp.status === 'REVIEWED' ? (
          <span className="cms-muted">
            Reviewed
            {followUp.outcome ? ` — ${followUp.outcome.replace(/_/g, ' ').toLowerCase()}` : ''}
          </span>
        ) : null}
        <span className="cms-muted">{formatDateTime(followUp.submittedAt)}</span>
      </div>

      {/* Citizen free text, rendered as text. */}
      {followUp.comment ? <p className="comm-update__body">{followUp.comment}</p> : null}

      {followUp.status === 'SUBMITTED' ? (
        <IfPermitted permission="FOLLOW_UP_REVIEW">
          <div className="comm-actions">
            <Button type="button" disabled={busy} onClick={() => onDecide('REOPENED')}>
              Mark for reopening
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => onDecide('KEPT_CLOSED')}
            >
              Keep closed
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => onDecide('ACKNOWLEDGED')}
            >
              Acknowledge
            </Button>
          </div>
        </IfPermitted>
      ) : null}
    </li>
  );
}
