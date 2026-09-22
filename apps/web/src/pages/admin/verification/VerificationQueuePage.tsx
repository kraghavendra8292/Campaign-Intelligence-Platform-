import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EVIDENCE_TYPE_LABELS, type VerificationStatus } from '@rk/types';
import { Badge, Button, Icon } from '@rk/ui';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import {
  DECIDE_VERIFICATION,
  VERIFICATION_HISTORY_QUERY,
  VERIFICATION_QUEUE_QUERY,
  WORK_EVIDENCE_QUERY,
  type AdminEvidence,
  type VerificationHistoryEntry,
  type VerificationQueueEntry,
  type WorkSubjectType,
} from '../../../features/work/workQueries';
import { CmsPageHeader, IfPermitted } from '../../../components/cms/CmsShell';
import { ListTableCard } from '../../../components/cms/ListPro';
import { QrBoundary } from '../../../components/qr/QrShell';
import { ChartCard } from '../../../components/analytics/charts';
import { formatDateTime } from '../../../lib/format';

/**
 * The verification console.
 *
 * WHAT A REVIEWER COMES HERE TO DO: look at the evidence for one claim and
 * decide whether it holds up. So the page is a queue on the left of a decision,
 * not a dashboard - and opening a claim shows everything needed to decide
 * without navigating away, because a reviewer who has to open four tabs to see
 * four documents will start deciding from the titles.
 *
 * OLDEST FIRST, ALWAYS. A queue sorted any other way lets the awkward case sink
 * to the bottom, and the awkward case is exactly the one that needs a person.
 */

const STATUS_TONE: Record<VerificationStatus, 'neutral' | 'success' | 'warning' | 'error'> = {
  UNVERIFIED: 'neutral',
  IN_REVIEW: 'warning',
  VERIFIED: 'success',
  REJECTED: 'error',
};

// `as const` rather than a typed array, so indexing is provably in range under
// noUncheckedIndexedAccess and the tab list needs no defensive fallback.
const STATUS_TABS = [
  { label: 'Waiting', statuses: ['IN_REVIEW'] },
  { label: 'Verified', statuses: ['VERIFIED'] },
  { label: 'Rejected', statuses: ['REJECTED'] },
  { label: 'Not submitted', statuses: ['UNVERIFIED'] },
] as const satisfies ReadonlyArray<{
  label: string;
  statuses: readonly VerificationStatus[];
}>;

export function VerificationQueuePage() {
  const [tab, setTab] = useState<0 | 1 | 2 | 3>(0);
  const [open, setOpen] = useState<{ type: WorkSubjectType; id: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const variables = useMemo(
    () => ({ filter: { statuses: [...STATUS_TABS[tab].statuses], first: 50 } }),
    [tab],
  );

  const queue = useAdminQuery<{ verificationQueue: VerificationQueueEntry[] }>(
    VERIFICATION_QUEUE_QUERY,
    variables,
  );

  useEffect(() => {
    if (queue.state.status !== 'loading') setRefreshing(false);
  }, [queue.state.status]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    queue.refetch();
  }, [queue]);

  return (
    <div className="cms-page list-page verify-page">
      <CmsPageHeader
        title="Verification"
        description="Claims waiting to be checked against their evidence, and the record of what was decided."
        backTo="/admin"
        backLabel="Back to dashboard"
      />

      <div className="verify-tabs" role="tablist">
        {STATUS_TABS.map((entry, index) => (
          <button
            key={entry.label}
            type="button"
            role="tab"
            aria-selected={tab === index}
            className={`filter-chip${tab === index ? ' filter-chip--active' : ''}`}
            onClick={() => {
              setTab(index as 0 | 1 | 2 | 3);
              setOpen(null);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="list-toolbar">
        <div className="list-toolbar__left" />
        <div className="list-toolbar__right">
          <button
            type="button"
            className={`cms-icon-btn cms-icon-btn--square${refreshing ? ' cms-icon-btn--busy' : ''}`}
            aria-label="Refresh"
            title="Refresh"
            disabled={queue.state.status === 'loading'}
            onClick={handleRefresh}
          >
            <Icon name="refresh" size={1.15} />
          </button>
        </div>
      </div>

      <QrBoundary state={queue.state} refetch={queue.refetch}>
        {(data) =>
          data.verificationQueue.length === 0 ? (
            <p className="chart-empty">Nothing here.</p>
          ) : (
            <ListTableCard
              title={STATUS_TABS[tab].label}
              count={data.verificationQueue.length}
              countLabel="claims"
            >
              <table className="list-table">
                <caption className="visually-hidden">Verification queue</caption>
                <thead>
                  <tr>
                    <th scope="col" className="list-table__actions-col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                    <th scope="col">Claim</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Category</th>
                    <th scope="col">Area</th>
                    <th scope="col">Evidence</th>
                    <th scope="col">Submitted by</th>
                    <th scope="col">Waiting since</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.verificationQueue.map((row) => {
                    const isOpen = open?.id === row.id;
                    return (
                      <tr key={`${row.subjectType}:${row.id}`}>
                        <td className="list-table__actions-col">
                          <div className="list-row-actions">
                            <button
                              type="button"
                              className="list-action-btn list-action-btn--view"
                              aria-label={isOpen ? `Close ${row.title}` : `Review ${row.title}`}
                              title={isOpen ? 'Close' : 'Review'}
                              onClick={() =>
                                setOpen(
                                  isOpen ? null : { type: row.subjectType, id: row.id },
                                )
                              }
                            >
                              <Icon name={isOpen ? 'close' : 'eye'} size={1} />
                            </button>
                          </div>
                        </td>
                        <td>{row.title}</td>
                        <td>{row.subjectType === 'PROJECT' ? 'Work' : 'Achievement'}</td>
                        <td>{row.category.replace(/_/g, ' ').toLowerCase()}</td>
                        <td>{row.area ?? '—'}</td>
                        <td>
                          {/* Zero evidence is called out rather than shown as a
                              bare 0: it is the one value that makes the claim
                              undecidable, and it should look like a problem. */}
                          {row.evidenceCount === 0 ? (
                            <Badge tone="error">none</Badge>
                          ) : (
                            row.evidenceCount
                          )}
                        </td>
                        <td>{row.submittedBy?.fullName ?? '—'}</td>
                        <td>{formatDateTime(row.submittedForReviewAt) ?? '—'}</td>
                        <td>
                          <Badge tone={STATUS_TONE[row.verification]}>
                            {row.verification.replace(/_/g, ' ').toLowerCase()}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ListTableCard>
          )
        }
      </QrBoundary>

      {open ? (
        <ReviewPanel
          subjectType={open.type}
          subjectId={open.id}
          onDecided={() => {
            setOpen(null);
            queue.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Everything a reviewer needs to decide, in one place.
 *
 * Evidence, the metadata that establishes its provenance, and the history of
 * what has already been decided about this claim - because a claim that was
 * rejected last week for a missing certificate should not be re-litigated from
 * scratch.
 */
function ReviewPanel({
  subjectType,
  subjectId,
  onDecided,
}: {
  subjectType: WorkSubjectType;
  subjectId: string;
  onDecided: () => void;
}) {
  const [reason, setReason] = useState('');
  const variables = useMemo(() => ({ subjectType, subjectId }), [subjectType, subjectId]);

  const evidence = useAdminQuery<{ workEvidence: AdminEvidence[] }>(WORK_EVIDENCE_QUERY, variables);
  const history = useAdminQuery<{ verificationHistory: VerificationHistoryEntry[] }>(
    VERIFICATION_HISTORY_QUERY,
    variables,
  );

  const decide = useAdminMutation<
    Record<string, unknown>,
    { subjectType: string; subjectId: string; decision: string; reason: string | null }
  >(DECIDE_VERIFICATION);

  const run = useCallback(
    async (decision: 'VERIFY' | 'REJECT') => {
      await decide.run({
        subjectType,
        subjectId,
        decision,
        reason: reason.trim() || null,
      });
      onDecided();
    },
    [decide, subjectType, subjectId, reason, onDecided],
  );

  return (
    <ChartCard
      title="Review"
      description="Check the evidence, then record a decision. Verifying does not publish; publishing is separate."
    >
      <QrBoundary state={evidence.state} refetch={evidence.refetch}>
        {(data) =>
          data.workEvidence.length === 0 ? (
            <p className="cms-error" role="alert">
              No evidence is attached. There is nothing here to verify.
            </p>
          ) : (
            <ul className="verify-evidence">
              {data.workEvidence.map((item) => (
                <li key={item.id} className="verify-evidence__item">
                  <div className="verify-evidence__head">
                    <span className="evidence__type">
                      {EVIDENCE_TYPE_LABELS[item.evidenceType]}
                    </span>
                    <strong>{item.title}</strong>
                    <Badge tone={item.isPublic ? 'success' : 'neutral'}>
                      {item.isPublic ? 'public' : 'internal'}
                    </Badge>
                  </div>

                  {item.description ? <p>{item.description}</p> : null}

                  <dl className="evidence__meta">
                    {item.issuingAuthority ? (
                      <>
                        <dt>Issued by</dt>
                        <dd>{item.issuingAuthority}</dd>
                      </>
                    ) : null}
                    {item.referenceNumber ? (
                      <>
                        <dt>Reference</dt>
                        <dd>{item.referenceNumber}</dd>
                      </>
                    ) : null}
                    {item.sourceNote ? (
                      <>
                        <dt>Source</dt>
                        <dd>{item.sourceNote}</dd>
                      </>
                    ) : null}
                  </dl>

                  {/* The internal note is visible here and nowhere public. */}
                  {item.internalNote ? (
                    <p className="verify-evidence__note">
                      <span>Internal note</span> {item.internalNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        }
      </QrBoundary>

      <QrBoundary state={history.state} refetch={history.refetch}>
        {(data) =>
          data.verificationHistory.length === 0 ? null : (
            <section className="verify-history">
              <h3>History</h3>
              <ol>
                {data.verificationHistory.map((entry) => (
                  <li key={entry.id}>
                    <span className="verify-history__when">{formatDateTime(entry.createdAt)}</span>
                    <span className="verify-history__what">
                      {entry.action.replace(/_/g, ' ').toLowerCase()}
                      {entry.actor ? ` — ${entry.actor.fullName}` : ''}
                    </span>
                    {entry.reason ? (
                      <span className="verify-history__reason">{entry.reason}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          )
        }
      </QrBoundary>

      <IfPermitted permission="ACHIEVEMENT_VERIFY">
        <div className="verify-decision">
          <label htmlFor="verify-reason">
            Reason <span>Required to reject. Internal — never shown publicly.</span>
          </label>
          <textarea
            id="verify-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Say what is missing or what you checked."
          />

          <div className="comm-actions">
            <Button
              type="button"
              disabled={decide.state.submitting}
              onClick={() => void run('VERIFY')}
            >
              Verify
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={decide.state.submitting}
              onClick={() => void run('REJECT')}
            >
              Reject
            </Button>
          </div>

          {decide.state.error ? (
            <p className="cms-error" role="alert">
              {decide.state.error}
            </p>
          ) : null}
        </div>
      </IfPermitted>

      <p className="cms-muted">
        Verifying records that staff checked the evidence. It does not make the claim public —
        publishing is a separate act, in the <Link to="/admin/cms/achievements">CMS</Link>.
      </p>
    </ChartCard>
  );
}
