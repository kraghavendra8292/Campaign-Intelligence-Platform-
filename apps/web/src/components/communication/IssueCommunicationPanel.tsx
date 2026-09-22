import { useCallback, useState } from 'react';
import { Badge, Button } from '@rk/ui';
import { COMMUNICATION_LIMITS } from '@rk/types';
import { useAdminMutation, useAdminQuery } from '../../features/admin/adminApi';
import {
  ARCHIVE_PUBLIC_UPDATE,
  CREATE_PUBLIC_UPDATE,
  ISSUE_COMMUNICATION_QUERY,
  PUBLISH_PUBLIC_UPDATE,
  RETRY_NOTIFICATION,
  REVIEW_FOLLOW_UP,
  type AdminFollowUpRow,
  type AdminNotificationRow,
  type AdminPublicUpdateRow,
  type IssueCommunicationData,
} from '../../features/communication/communicationQueries';
import { CmsCard, IfPermitted } from '../cms/CmsShell';
import { formatDateTime } from '../../lib/format';

/**
 * The communication panel on a submission's page.
 *
 * THE SEPARATION THIS COMPONENT MAKES VISIBLE. Phase 5's internal notes live in
 * their own card elsewhere on this page; public updates live here, under a
 * heading that says who reads them, with a standing warning before publication.
 * A staff member should never be in doubt about which box a citizen can see -
 * the backend guarantees it structurally, and this makes the guarantee legible.
 *
 * PUBLISHING IS A TWO-STEP ACT. Writing produces a draft; publishing is a
 * separate button behind a separate permission, with a confirmation that states
 * plainly that the citizen will be able to read it. Nothing here publishes on
 * save, because a slip of the finger would be unrecallable.
 */

const NOTIFICATION_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'error'> = {
  QUEUED: 'neutral',
  PROCESSING: 'neutral',
  SENT: 'success',
  DELIVERED: 'success',
  FAILED: 'error',
  SKIPPED: 'warning',
};

const RESPONSE_LABELS: Record<string, string> = {
  RESOLVED: 'Resolved',
  PARTIALLY_RESOLVED: 'Partly resolved',
  NOT_RESOLVED: 'Not resolved',
};

export function IssueCommunicationPanel({ issueId }: { issueId: string }) {
  const { state, refetch } = useAdminQuery<IssueCommunicationData>(ISSUE_COMMUNICATION_QUERY, {
    issueId,
  });

  const createDraft = useAdminMutation<Record<string, unknown>, { issueId: string; body: string }>(
    CREATE_PUBLIC_UPDATE,
  );
  const publish = useAdminMutation<Record<string, unknown>, { updateId: string }>(
    PUBLISH_PUBLIC_UPDATE,
  );
  const archive = useAdminMutation<Record<string, unknown>, { updateId: string }>(
    ARCHIVE_PUBLIC_UPDATE,
  );
  const retry = useAdminMutation<Record<string, unknown>, { notificationId: string }>(
    RETRY_NOTIFICATION,
  );
  const review = useAdminMutation<
    Record<string, unknown>,
    { followUpId: string; outcome: string; note?: string | null }
  >(REVIEW_FOLLOW_UP);

  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      refetch();
    },
    [refetch],
  );

  if (state.status === 'loading') {
    return (
      <CmsCard title="Communication">
        <p className="cms-muted">Loading…</p>
      </CmsCard>
    );
  }

  if (state.status === 'error') {
    // A user without COMMUNICATION_READ simply does not see the panel, rather
    // than being shown an access error about a capability never offered.
    if (state.code === 'FORBIDDEN') return null;
    return (
      <CmsCard title="Communication">
        <p className="cms-error">{state.message}</p>
      </CmsCard>
    );
  }

  const data = state.data.issueCommunication;
  const updates = state.data.issuePublicUpdates;
  const busy =
    createDraft.state.submitting ||
    publish.state.submitting ||
    archive.state.submitting ||
    retry.state.submitting ||
    review.state.submitting;

  const error =
    createDraft.state.error ??
    publish.state.error ??
    archive.state.error ??
    retry.state.error ??
    review.state.error;

  return (
    <CmsCard title="Communication">
      {error ? (
        <p className="cms-error" role="alert">
          {error}
        </p>
      ) : null}

      <dl className="comm-summary">
        <Stat label="Published updates" value={data.publicUpdateCount} />
        <Stat label="Messages sent" value={data.notifications.length} />
        <Stat label="Citizen replies" value={data.followUps.length} />
        <Stat
          label="Email updates"
          value={data.subscription?.active ? 'On' : data.subscription ? 'Stopped' : 'Not set up'}
        />
      </dl>

      {/* ---- Public updates ------------------------------------------- */}
      <section className="comm-section">
        <h3 className="comm-section__title">Public updates</h3>
        <p className="cms-muted">
          Written for the citizen who reported this. Published updates appear on their tracking page
          and are emailed to them if they asked for updates.
        </p>

        {composing ? (
          <div className="comm-compose">
            <label className="cms-field__label" htmlFor="public-update-body">
              Update
            </label>
            <textarea
              id="public-update-body"
              className="cms-field__input"
              rows={4}
              maxLength={COMMUNICATION_LIMITS.publicUpdateMax}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="For example: This has been passed to the roads team for inspection."
            />
            <p className="cms-muted">
              {draft.length} / {COMMUNICATION_LIMITS.publicUpdateMax} characters. Plain text only.
              Describe what has actually happened &mdash; avoid promising work that has not been
              agreed.
            </p>
            <div className="comm-actions">
              <Button
                type="button"
                disabled={busy || draft.trim().length < COMMUNICATION_LIMITS.publicUpdateMin}
                onClick={() =>
                  void run(async () => {
                    await createDraft.run({ issueId, body: draft });
                    setDraft('');
                    setComposing(false);
                  })
                }
              >
                Save as draft
              </Button>
              <Button type="button" variant="secondary" onClick={() => setComposing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setComposing(true)}>
            Write an update
          </Button>
        )}

        {updates.length === 0 ? (
          <p className="cms-muted">Nothing has been published to this citizen yet.</p>
        ) : (
          <ul className="comm-updates">
            {updates.map((update) => (
              <PublicUpdateRow
                key={update.id}
                update={update}
                busy={busy}
                confirming={confirmingId === update.id}
                onConfirm={() => setConfirmingId(update.id)}
                onCancelConfirm={() => setConfirmingId(null)}
                onPublish={() =>
                  void run(async () => {
                    await publish.run({ updateId: update.id });
                    setConfirmingId(null);
                  })
                }
                onArchive={() => void run(() => archive.run({ updateId: update.id }))}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---- Citizen replies ------------------------------------------ */}
      {data.followUps.length > 0 ? (
        <section className="comm-section">
          <h3 className="comm-section__title">Citizen replies</h3>
          <ul className="comm-followups">
            {data.followUps.map((followUp) => (
              <FollowUpRow
                key={followUp.id}
                followUp={followUp}
                busy={busy}
                onReview={(outcome, note) =>
                  void run(() => review.run({ followUpId: followUp.id, outcome, note }))
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- Delivery history ----------------------------------------- */}
      <section className="comm-section">
        <h3 className="comm-section__title">Messages</h3>
        {data.notifications.length === 0 ? (
          <p className="cms-muted">No messages have been sent about this submission.</p>
        ) : (
          <ul className="comm-notifications">
            {data.notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                busy={busy}
                onRetry={() => void run(() => retry.run({ notificationId: notification.id }))}
              />
            ))}
          </ul>
        )}
      </section>
    </CmsCard>
  );
}

function PublicUpdateRow({
  update,
  busy,
  confirming,
  onConfirm,
  onCancelConfirm,
  onPublish,
  onArchive,
}: {
  update: AdminPublicUpdateRow;
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onPublish: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="comm-update">
      <div className="comm-update__head">
        <Badge
          tone={
            update.status === 'PUBLISHED'
              ? 'success'
              : update.status === 'ARCHIVED'
                ? 'neutral'
                : 'warning'
          }
        >
          {update.status === 'PUBLISHED'
            ? 'Visible to citizen'
            : update.status === 'ARCHIVED'
              ? 'Withdrawn'
              : 'Draft — not visible'}
        </Badge>
        {update.supersedesId ? <span className="cms-muted">Correction</span> : null}
        <span className="cms-muted">
          {update.publishedAt
            ? `Published ${formatDateTime(update.publishedAt)}`
            : `Drafted ${formatDateTime(update.createdAt)}`}
          {update.publishedBy ? ` by ${update.publishedBy.fullName}` : ''}
        </span>
      </div>

      {/* Plain text through interpolation; no markup is rendered. */}
      <p className="comm-update__body">{update.body}</p>

      {update.status === 'DRAFT' ? (
        <IfPermitted permission="COMMUNICATION_PUBLISH">
          {confirming ? (
            <div className="comm-confirm" role="alert">
              <p>
                <strong>This update will be visible to the citizen</strong> on their tracking page,
                and will be emailed to them if they asked for updates. It cannot be unsent.
              </p>
              <div className="comm-actions">
                <Button type="button" disabled={busy} onClick={onPublish}>
                  Publish
                </Button>
                <Button type="button" variant="secondary" onClick={onCancelConfirm}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="comm-actions">
              <Button type="button" variant="secondary" disabled={busy} onClick={onConfirm}>
                Publish…
              </Button>
            </div>
          )}
        </IfPermitted>
      ) : update.status === 'PUBLISHED' ? (
        <IfPermitted permission="COMMUNICATION_PUBLISH">
          <div className="comm-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={onArchive}>
              Withdraw
            </Button>
          </div>
        </IfPermitted>
      ) : null}
    </li>
  );
}

function FollowUpRow({
  followUp,
  busy,
  onReview,
}: {
  followUp: AdminFollowUpRow;
  busy: boolean;
  onReview: (outcome: string, note: string | null) => void;
}) {
  const [note, setNote] = useState('');

  return (
    <li className="comm-followup">
      <div className="comm-update__head">
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
        {followUp.reopenRequested && followUp.status === 'SUBMITTED' ? (
          <Badge tone="warning">Reopen requested</Badge>
        ) : null}
        <span className="cms-muted">{formatDateTime(followUp.submittedAt)}</span>
      </div>

      {followUp.comment ? <p className="comm-update__body">{followUp.comment}</p> : null}

      {followUp.status === 'REVIEWED' ? (
        <p className="cms-muted">
          Reviewed{followUp.reviewedBy ? ` by ${followUp.reviewedBy.fullName}` : ''}
          {followUp.outcome ? ` — ${followUp.outcome.replace(/_/g, ' ').toLowerCase()}` : ''}
          {followUp.reviewNote ? `: ${followUp.reviewNote}` : ''}
        </p>
      ) : (
        <IfPermitted permission="FOLLOW_UP_REVIEW">
          <div className="comm-review">
            <p className="cms-muted">
              Recording a decision here does not change the submission&rsquo;s status. Reopening it
              is a separate step on this page.
            </p>
            <label className="cms-field__label" htmlFor={`review-note-${followUp.id}`}>
              Internal note (optional)
            </label>
            <textarea
              id={`review-note-${followUp.id}`}
              className="cms-field__input"
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="comm-actions">
              <Button
                type="button"
                disabled={busy}
                onClick={() => onReview('REOPENED', note.trim() || null)}
              >
                Mark for reopening
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onReview('KEPT_CLOSED', note.trim() || null)}
              >
                Keep closed
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onReview('ACKNOWLEDGED', note.trim() || null)}
              >
                Acknowledge
              </Button>
            </div>
          </div>
        </IfPermitted>
      )}
    </li>
  );
}

function NotificationRow({
  notification,
  busy,
  onRetry,
}: {
  notification: AdminNotificationRow;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <li className="comm-notification">
      <div className="comm-update__head">
        <Badge tone={NOTIFICATION_TONE[notification.status] ?? 'neutral'}>
          {notification.status.toLowerCase()}
        </Badge>
        <span>{notification.event.replace(/_/g, ' ').toLowerCase()}</span>
        {/* Masked by the server. The real address is never sent to this UI. */}
        <span className="cms-muted">{notification.recipientRedacted}</span>
        <span className="cms-muted">{formatDateTime(notification.createdAt)}</span>
      </div>

      {notification.failureReason ? (
        <p className="cms-muted">{notification.failureReason}</p>
      ) : null}

      {notification.status === 'FAILED' && notification.attempts < 3 ? (
        <IfPermitted permission="COMMUNICATION_SEND">
          <div className="comm-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={onRetry}>
              Retry
            </Button>
          </div>
        </IfPermitted>
      ) : null}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="comm-summary__item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
