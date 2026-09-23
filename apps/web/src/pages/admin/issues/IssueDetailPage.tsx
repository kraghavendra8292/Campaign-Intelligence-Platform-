import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUS_TRANSITIONS,
  MODERATION_STATUSES,
  type IssueStatus,
} from '@rk/types';
import { Button } from '@rk/ui';
import { apiBaseUrl } from '../../../config/env';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import { graphqlRequest } from '../../../features/auth/authClient';
import {
  ADD_ISSUE_NOTE,
  ASSIGN_ISSUE,
  ISSUE_ASSIGNEES_QUERY,
  ISSUE_ATTACHMENTS_QUERY,
  ISSUE_DETAIL_QUERY,
  ISSUE_NOTES_QUERY,
  MODERATE_ISSUE,
  REVEAL_ISSUE_CONTACT,
  UNASSIGN_ISSUE,
  UPDATE_ISSUE_PRIORITY,
  UPDATE_ISSUE_STATUS,
  type IssueAttachmentRow,
  type IssueDetailRow,
  type IssueHistoryRow,
  type IssueNoteRow,
} from '../../../features/issues/issueQueries';
import {
  CmsCard,
  CmsPageHeader,
  IfPermitted,
  ToastRegion,
  useToasts,
} from '../../../components/cms/CmsShell';
import { QrBoundary } from '../../../components/qr/QrShell';
import {
  IssueModerationBadge,
  IssuePriorityBadge,
  IssueStatusBadge,
  IssueTypeLabel,
  STATUS_LABELS,
  issueSourceLabel,
} from '../../../components/issues/IssueBadges';
import { AiIntelligencePanel } from '../../../components/ai/AiIntelligencePanel';
import { IssueCommunicationPanel } from '../../../components/communication/IssueCommunicationPanel';
import { formatDate, formatDateTime } from '../../../lib/format';

/**
 * One submission, and everything the team can do with it.
 *
 * Three things here are shaped by privacy rather than by convenience:
 *
 *  1. CONTACT DETAILS ARE HIDDEN BEHIND A DELIBERATE ACTION. Even a user who
 *     holds ISSUE_CONTACT_READ sees a button rather than the number, and
 *     pressing it writes an audit record. Reading somebody's phone number
 *     should be a decision, not something that happens by opening a page.
 *  2. ATTACHMENTS DOWNLOAD THROUGH AN AUTHENTICATED FETCH, never an `<img src>`
 *     - the access token lives in memory, so a plain URL would carry no
 *     credential and the endpoint would have to be public.
 *  3. ONLY REACHABLE STATUSES ARE OFFERED. The dropdown is built from the
 *     transition map, so an invalid move is not something the UI can ask for.
 */

interface DetailData {
  issue: IssueDetailRow;
  issueHistory: IssueHistoryRow[];
}

export function IssueDetailPage() {
  const { id = '' } = useParams();
  const { toasts, success, failure } = useToasts();
  const [revealed, setRevealed] = useState<{
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const { state, refetch } = useAdminQuery<DetailData>(ISSUE_DETAIL_QUERY, { id });

  // Notes and attachments are separate queries behind their own permissions, so
  // a user who may read the submission but not the staff notes still gets a
  // working page rather than an error.
  const notes = useAdminQuery<{ issueNotes: IssueNoteRow[] }>(ISSUE_NOTES_QUERY, { issueId: id });
  const attachments = useAdminQuery<{ issueAttachments: IssueAttachmentRow[] }>(
    ISSUE_ATTACHMENTS_QUERY,
    { issueId: id },
  );
  const assignees = useAdminQuery<{
    issueAssignees: Array<{ id: string; fullName: string }>;
  }>(ISSUE_ASSIGNEES_QUERY);

  const setStatus = useAdminMutation<unknown, { id: string; status: string }>(UPDATE_ISSUE_STATUS);
  const setPriority = useAdminMutation<unknown, { id: string; priority: string }>(
    UPDATE_ISSUE_PRIORITY,
  );
  const assign = useAdminMutation<unknown, { id: string; userId: string }>(ASSIGN_ISSUE);
  const unassign = useAdminMutation<unknown, { id: string }>(UNASSIGN_ISSUE);
  const moderate = useAdminMutation<unknown, { id: string; moderationStatus: string }>(
    MODERATE_ISSUE,
  );
  const addNote = useAdminMutation<unknown, { issueId: string; note: string }>(ADD_ISSUE_NOTE);

  const run = useCallback(
    async (action: () => Promise<unknown>, message: string, fallback: string) => {
      const result = await action();
      if (result) {
        success(message);
        refetch();
        notes.refetch();
      } else {
        failure(fallback);
      }
    },
    [success, failure, refetch, notes],
  );

  /**
   * Reveals the citizen's contact details.
   *
   * A mutation, because the server records the disclosure. The button exists so
   * that reading somebody's number is an act with a trace, not a side effect of
   * navigation.
   */
  async function reveal(): Promise<void> {
    try {
      const result = await graphqlRequest<{
        revealIssueContact: {
          contactName: string | null;
          contactPhone: string | null;
          contactEmail: string | null;
        };
      }>(REVEAL_ISSUE_CONTACT, { variables: { id } });

      setRevealed(result.revealIssueContact);
    } catch {
      failure('Could not show the contact details.');
    }
  }

  /**
   * Downloads an attachment through an authenticated request.
   *
   * The bytes arrive as a Blob and are handed to the browser from memory, so
   * the protected endpoint is never exposed as a plain link that would be
   * shared, bookmarked or crawled without its credential.
   */
  async function download(attachment: IssueAttachmentRow): Promise<void> {
    try {
      const { tokenStore, organizationStore } = await import('../../../features/auth/authClient');

      const response = await fetch(`${apiBaseUrl}/issue-attachments/${attachment.id}`, {
        headers: {
          ...(tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get() as string}` } : {}),
          ...(organizationStore.get()
            ? { 'x-organization-id': organizationStore.get() as string }
            : {}),
        },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('download failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      failure('Could not download that file.');
    }
  }

  return (
    <div className="cms-page">
      <QrBoundary state={state} refetch={refetch}>
        {(data) => {
          const issue = data.issue;
          const reachable = ISSUE_STATUS_TRANSITIONS[issue.status as IssueStatus] ?? [];

          return (
            <>
              <CmsPageHeader
                title={issue.title}
                description={`${issue.referenceNumber} · received ${formatDate(issue.submittedAt) ?? ''}`}
                backTo="/admin/issues"
                backLabel="Back to inbox"
              />

              <div className="issue-detail">
                <div className="issue-detail__main">
                  <CmsCard title="What was reported">
                    <div className="issue-detail__badges">
                      <IssueTypeLabel value={issue.type} />
                      <IssueStatusBadge value={issue.status} />
                      <IssuePriorityBadge value={issue.priority} />
                      <IssueModerationBadge value={issue.moderationStatus} />
                    </div>

                    {/* Plain text, rendered as text. Citizen-supplied content is
                        never treated as markup anywhere in this platform. */}
                    <p className="issue-detail__description">{issue.description}</p>

                    <dl className="detail-facts">
                      <div>
                        <dt>Category</dt>
                        <dd>{issue.category?.label ?? 'Not categorised'}</dd>
                      </div>
                      <div>
                        <dt>Ward</dt>
                        <dd>{issue.ward ?? 'Not stated'}</dd>
                      </div>
                      <div>
                        <dt>Locality</dt>
                        <dd>{issue.locality ?? 'Not stated'}</dd>
                      </div>
                      <div>
                        <dt>Landmark</dt>
                        <dd>{issue.addressDescription ?? 'Not stated'}</dd>
                      </div>
                      <div>
                        <dt>Coordinates</dt>
                        <dd>
                          {issue.latitude !== null && issue.longitude !== null ? (
                            <a
                              className="mono"
                              href={`https://www.openstreetmap.org/?mlat=${issue.latitude}&mlon=${issue.longitude}#map=17/${issue.latitude}/${issue.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {issue.latitude}, {issue.longitude}
                            </a>
                          ) : (
                            'Not shared'
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>{issueSourceLabel(issue.source)}</dd>
                      </div>
                      {issue.qrCode ? (
                        <div>
                          <dt>Scanned code</dt>
                          <dd>
                            <span className="mono">{issue.qrCode.code}</span> · {issue.qrCode.name}
                          </dd>
                        </div>
                      ) : null}
                      {issue.campaign ? (
                        <div>
                          <dt>QR campaign</dt>
                          <dd>{issue.campaign.name}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </CmsCard>

                  {/*
                    Phase 6. Placed directly below the citizen's own words and
                    above everything else, because the order is the argument:
                    what the person actually wrote comes first, and the machine's
                    reading of it is offered second, clearly labelled, as an aid
                    to whoever is triaging. The panel renders nothing for a user
                    without AI permissions.
                  */}
                  <AiIntelligencePanel issueId={id} />

                  {/*
                    Phase 8. Public updates and delivery history, kept in their
                    own card and visibly separate from the internal-notes card
                    further down. The backend guarantees a note can never become
                    a public update - there is no operation that moves one - and
                    this layout makes that separation legible to whoever is
                    typing.
                  */}
                  <IssueCommunicationPanel issueId={id} />

                  <IfPermitted permission="ISSUE_ATTACHMENT_READ">
                    <CmsCard title={`Attachments (${issue.attachmentCount})`}>
                      {attachments.state.status === 'success' &&
                      attachments.state.data.issueAttachments.length > 0 ? (
                        <ul className="issue-attachments">
                          {attachments.state.data.issueAttachments.map((file) => (
                            <li key={file.id} className="issue-attachment">
                              <span className="issue-attachment__name">{file.originalName}</span>
                              <span className="issue-attachment__meta">
                                {Math.round(file.sizeBytes / 1024)} KB
                              </span>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void download(file)}
                              >
                                Download
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="cms-field__hint">No files were attached.</p>
                      )}
                    </CmsCard>
                  </IfPermitted>

                  <IfPermitted permission="ISSUE_NOTE_READ">
                    <CmsCard title={`Internal notes (${issue.noteCount})`}>
                      <p className="cms-field__hint">
                        Notes are for the team only. They are never shown to the citizen and never
                        appear on the public site.
                      </p>

                      <IfPermitted permission="ISSUE_NOTE_CREATE">
                        <div className="issue-note-form">
                          <label className="feedback-field">
                            <span className="visually-hidden">Add an internal note</span>
                            <textarea
                              className="cms-textarea"
                              rows={3}
                              placeholder="What did you do, or what needs doing next?"
                              value={noteDraft}
                              onChange={(event) => setNoteDraft(event.target.value)}
                            />
                          </label>
                          <Button
                            variant="primary"
                            size="sm"
                            isLoading={addNote.state.submitting}
                            disabled={noteDraft.trim().length === 0}
                            onClick={() =>
                              void run(
                                async () => {
                                  const result = await addNote.run({
                                    issueId: id,
                                    note: noteDraft,
                                  });
                                  if (result) setNoteDraft('');
                                  return result;
                                },
                                'Note added.',
                                addNote.state.error ?? 'Could not add that note.',
                              )
                            }
                          >
                            Add note
                          </Button>
                        </div>
                      </IfPermitted>

                      {notes.state.status === 'success' &&
                      notes.state.data.issueNotes.length > 0 ? (
                        <ul className="issue-notes">
                          {notes.state.data.issueNotes.map((note) => (
                            <li key={note.id} className="issue-note">
                              <p className="issue-note__body">{note.note}</p>
                              <p className="issue-note__meta">
                                {note.author?.fullName ?? 'A former colleague'} ·{' '}
                                {formatDateTime(note.createdAt)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="cms-field__hint">No notes yet.</p>
                      )}
                    </CmsCard>
                  </IfPermitted>

                  <CmsCard title="History">
                    <ol className="issue-timeline">
                      {data.issueHistory.map((entry) => (
                        <li key={entry.id} className="issue-timeline__item">
                          <span className="issue-timeline__when">
                            {formatDateTime(entry.createdAt)}
                          </span>
                          <span className="issue-timeline__what">{describeHistory(entry)}</span>
                          <span className="issue-timeline__who">
                            {/* The submission entry has no actor on purpose: a
                                member of the public is not a user. */}
                            {entry.performedBy?.fullName ?? 'Citizen'}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </CmsCard>
                </div>

                <aside className="issue-detail__side">
                  <CmsCard title="Contact">
                    {issue.isAnonymous ? (
                      <p className="cms-field__hint">
                        This was submitted anonymously. There is no way to reply directly.
                      </p>
                    ) : (
                      <>
                        <p className="cms-field__hint">
                          The citizen gave these details and consented to being contacted about this
                          submission
                          {issue.consentAt ? ` on ${formatDate(issue.consentAt)}` : ''}.
                        </p>

                        {revealed ? (
                          <dl className="detail-facts">
                            <div>
                              <dt>Name</dt>
                              <dd>{revealed.contactName ?? '—'}</dd>
                            </div>
                            <div>
                              <dt>Phone</dt>
                              <dd>{revealed.contactPhone ?? '—'}</dd>
                            </div>
                            <div>
                              <dt>Email</dt>
                              <dd>{revealed.contactEmail ?? '—'}</dd>
                            </div>
                          </dl>
                        ) : (
                          <IfPermitted permission="ISSUE_CONTACT_READ">
                            <p className="cms-field__hint">
                              Showing these is recorded in the audit log.
                            </p>
                            <Button variant="secondary" size="sm" onClick={() => void reveal()}>
                              Show contact details
                            </Button>
                          </IfPermitted>
                        )}

                        {!issue.contactVisible && !revealed ? (
                          <p className="cms-field__hint">
                            You do not have permission to view contact details.
                          </p>
                        ) : null}
                      </>
                    )}
                  </CmsCard>

                  <IfPermitted permission="ISSUE_STATUS_UPDATE">
                    <CmsCard title="Status">
                      <p className="cms-field__hint">Only the next valid steps are offered.</p>
                      <div className="issue-actions">
                        {reachable.length === 0 ? (
                          <p className="cms-field__hint">This submission is closed.</p>
                        ) : (
                          reachable.map((next) => (
                            <Button
                              key={next}
                              variant="secondary"
                              size="sm"
                              isLoading={setStatus.state.submitting}
                              onClick={() =>
                                void run(
                                  () => setStatus.run({ id, status: next }),
                                  `Moved to ${STATUS_LABELS[next]?.toLowerCase() ?? next}.`,
                                  setStatus.state.error ?? 'Could not change the status.',
                                )
                              }
                            >
                              {STATUS_LABELS[next] ?? next}
                            </Button>
                          ))
                        )}
                      </div>
                    </CmsCard>
                  </IfPermitted>

                  <IfPermitted permission="ISSUE_PRIORITY_UPDATE">
                    <CmsCard title="Priority">
                      <label className="feedback-field">
                        <span className="visually-hidden">Set priority</span>
                        <select
                          className="rk-select__control"
                          value={issue.priority}
                          onChange={(event) =>
                            void run(
                              () => setPriority.run({ id, priority: event.target.value }),
                              'Priority updated.',
                              setPriority.state.error ?? 'Could not change the priority.',
                            )
                          }
                        >
                          {ISSUE_PRIORITIES.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority.charAt(0) + priority.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                    </CmsCard>
                  </IfPermitted>

                  <IfPermitted permission="ISSUE_ASSIGN">
                    <CmsCard title="Assigned to">
                      <label className="feedback-field">
                        <span className="visually-hidden">Assign to a colleague</span>
                        <select
                          className="rk-select__control"
                          value={issue.assignedTo?.id ?? ''}
                          onChange={(event) => {
                            const userId = event.target.value;
                            void run(
                              () => (userId ? assign.run({ id, userId }) : unassign.run({ id })),
                              userId ? 'Assigned.' : 'Unassigned.',
                              assign.state.error ?? 'Could not change the assignment.',
                            );
                          }}
                        >
                          <option value="">Unassigned</option>
                          {assignees.state.status === 'success'
                            ? assignees.state.data.issueAssignees.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.fullName}
                                </option>
                              ))
                            : null}
                        </select>
                      </label>
                    </CmsCard>
                  </IfPermitted>

                  <IfPermitted permission="ISSUE_MODERATE">
                    <CmsCard title="Review">
                      <p className="cms-field__hint">
                        Is this a genuine submission? This is about the submission, not about the
                        person who sent it.
                      </p>
                      <div className="issue-actions">
                        {MODERATION_STATUSES.filter(
                          (status) => status !== issue.moderationStatus,
                        ).map((status) => (
                          <Button
                            key={status}
                            variant="secondary"
                            size="sm"
                            isLoading={moderate.state.submitting}
                            onClick={() =>
                              void run(
                                () => moderate.run({ id, moderationStatus: status }),
                                'Review state updated.',
                                moderate.state.error ?? 'Could not update the review state.',
                              )
                            }
                          >
                            {status.replace(/_/g, ' ').toLowerCase()}
                          </Button>
                        ))}
                      </div>
                    </CmsCard>
                  </IfPermitted>
                </aside>
              </div>
            </>
          );
        }}
      </QrBoundary>

      <ToastRegion toasts={toasts} />
    </div>
  );
}

/** Turns a history row into a sentence somebody can read at a glance. */
function describeHistory(entry: IssueHistoryRow): string {
  switch (entry.action) {
    case 'SUBMITTED':
      return 'Submitted';
    case 'STATUS_CHANGED':
      return `Status changed${entry.previousStatus ? ` from ${STATUS_LABELS[entry.previousStatus]?.toLowerCase() ?? entry.previousStatus}` : ''} to ${
        entry.newStatus ? (STATUS_LABELS[entry.newStatus]?.toLowerCase() ?? entry.newStatus) : ''
      }`;
    case 'PRIORITY_CHANGED':
      return `Priority changed to ${entry.newPriority?.toLowerCase() ?? ''}`;
    case 'ASSIGNED':
      return `Assigned${entry.detail ? ` to ${entry.detail}` : ''}`;
    case 'UNASSIGNED':
      return 'Unassigned';
    case 'CATEGORY_CHANGED':
      return `Category changed${entry.detail ? ` to ${entry.detail}` : ''}`;
    case 'LOCATION_UPDATED':
      return 'Location updated';
    case 'MODERATED':
      return `Reviewed${entry.detail ? `: ${entry.detail}` : ''}`;
    case 'NOTE_ADDED':
      // The note BODY is never in the timeline - staff write candidly, and this
      // is read more widely than the notes themselves.
      return 'Internal note added';
    default:
      return entry.action.replace(/_/g, ' ').toLowerCase();
  }
}
