import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@rk/ui';
import { AI_LIMITS } from '@rk/types';
import { useAdminMutation, useAdminQuery } from '../../features/admin/adminApi';
import {
  AI_INSIGHT_QUERY,
  DECIDE_AI_CATEGORY,
  PROCESS_ISSUE_AI,
  REGENERATE_ISSUE_AI,
  REVIEW_AI_SUMMARY,
  type AiInsightQueryResult,
} from '../../features/ai/aiQueries';
import { CmsCard, IfPermitted } from '../cms/CmsShell';
import { AiConfidenceBadge, AiDisclaimer, AiProcessingBadge, AiReviewBadge } from './AiBadges';
import { formatDateTime } from '../../lib/format';

/**
 * The AI panel on a submission's page.
 *
 * Three things here are shaped by the human-in-the-loop requirement rather than
 * by convenience, and they are the reason this is a separate component instead
 * of a few fields on the detail page:
 *
 *  1. AI OUTPUT IS ALWAYS LABELLED. The disclaimer and the review badge render
 *     above the summary, never below it and never only on hover. A reader who
 *     skims must still see that a machine wrote this and whether anybody has
 *     checked it.
 *  2. THE SUGGESTION AND THE RECORD ARE VISUALLY SEPARATE. The suggested
 *     category is presented as a proposal with Accept and Dismiss, not as a
 *     value in the same style as the submission's actual category. Accepting is
 *     an explicit act.
 *  3. NOTHING IS AUTOMATIC. Processing, regeneration, approval and category
 *     acceptance are all buttons. The panel never triggers a generation on
 *     render - that would spend money by navigation.
 *
 * All model text renders as TEXT through JSX interpolation. There is no
 * `dangerouslySetInnerHTML` anywhere in this file, because model output is
 * untrusted input.
 */

export function AiIntelligencePanel({ issueId }: { issueId: string }) {
  const { state, refetch } = useAdminQuery<AiInsightQueryResult>(AI_INSIGHT_QUERY, { issueId });

  const process = useAdminMutation<Record<string, unknown>, { issueId: string }>(PROCESS_ISSUE_AI);
  const regenerate = useAdminMutation<Record<string, unknown>, { issueId: string }>(
    REGENERATE_ISSUE_AI,
  );
  const review = useAdminMutation<
    Record<string, unknown>,
    { issueId: string; decision: string; editedSummary?: string | null }
  >(REVIEW_AI_SUMMARY);
  const decideCategory = useAdminMutation<
    Record<string, unknown>,
    { issueId: string; accept: boolean }
  >(DECIDE_AI_CATEGORY);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      refetch();
    },
    [refetch],
  );

  if (state.status === 'loading') {
    return (
      <CmsCard title="AI intelligence">
        <p className="cms-muted">Loading…</p>
      </CmsCard>
    );
  }

  if (state.status === 'error') {
    // A caller without AI_INSIGHT_READ simply does not see the panel. Rendering
    // an access error beside a submission they CAN read would be noise about a
    // capability they were never offered.
    if (state.code === 'FORBIDDEN') return null;

    return (
      <CmsCard title="AI intelligence">
        <p className="cms-error">{state.message}</p>
      </CmsCard>
    );
  }

  const insight = state.data.aiIssueInsight;
  const similar = state.data.aiSimilarIssues;

  const busy =
    process.state.submitting ||
    regenerate.state.submitting ||
    review.state.submitting ||
    decideCategory.state.submitting;

  const actionError =
    process.state.error ??
    regenerate.state.error ??
    review.state.error ??
    decideCategory.state.error;

  return (
    <CmsCard title="AI intelligence">
      {actionError ? (
        <p className="cms-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {insight === null ? (
        <div className="ai-panel__empty">
          <p className="cms-muted">
            This submission has not been processed. Processing produces a short summary, suggested
            topics and a category suggestion for staff to review.
          </p>
          <IfPermitted
            permission="AI_ISSUE_PROCESS"
            fallback={<p className="cms-muted">You do not have permission to run AI processing.</p>}
          >
            <Button
              type="button"
              disabled={busy}
              onClick={() => void run(() => process.run({ issueId }))}
            >
              {process.state.submitting ? 'Processing…' : 'Run AI processing'}
            </Button>
          </IfPermitted>
        </div>
      ) : (
        <div className="ai-panel">
          <div className="ai-panel__status">
            <AiProcessingBadge status={insight.processingStatus} />
            <AiReviewBadge status={insight.reviewStatus} />
            {insight.isEdited ? <span className="cms-muted">Edited by staff</span> : null}
          </div>

          {insight.isStale ? (
            <p className="ai-panel__stale" role="note">
              This submission has been edited since the summary was generated, so the summary may
              describe text that no longer exists. Regenerate it to bring it up to date.
            </p>
          ) : null}

          {insight.processingStatus === 'FAILED' ? (
            <p className="cms-error">
              {insight.failureReason ?? 'AI processing failed.'}{' '}
              {insight.retryCount > 0 ? `Attempts: ${insight.retryCount}.` : null}
            </p>
          ) : null}

          {insight.summary ? (
            <>
              <AiDisclaimer />

              {editing ? (
                <div className="ai-panel__edit">
                  <label className="cms-field__label" htmlFor="ai-summary-edit">
                    Corrected summary
                  </label>
                  <textarea
                    id="ai-summary-edit"
                    className="cms-field__input"
                    rows={4}
                    maxLength={AI_LIMITS.summaryMax}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <p className="cms-muted">
                    {draft.length} / {AI_LIMITS.summaryMax} characters. The model&rsquo;s original
                    wording is kept alongside your correction.
                  </p>
                  <div className="ai-panel__actions">
                    <Button
                      type="button"
                      disabled={busy || draft.trim().length < AI_LIMITS.summaryMin}
                      onClick={() =>
                        void run(async () => {
                          await review.run({ issueId, decision: 'EDIT', editedSummary: draft });
                          setEditing(false);
                        })
                      }
                    >
                      Save and approve
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="ai-panel__summary">{insight.summary}</p>

                  {insight.isEdited && insight.generatedSummary ? (
                    <details className="ai-panel__original">
                      <summary>What the model originally wrote</summary>
                      <p>{insight.generatedSummary}</p>
                    </details>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {insight.categorySuggestion?.category ? (
            <div className="ai-panel__suggestion">
              <h3 className="ai-panel__heading">Suggested category</h3>
              <div className="ai-panel__status">
                <strong>{insight.categorySuggestion.category.label}</strong>
                <AiConfidenceBadge band={insight.categorySuggestion.band} />
              </div>
              {insight.categorySuggestion.reason ? (
                <p className="cms-muted">{insight.categorySuggestion.reason}</p>
              ) : null}

              {insight.categorySuggestion.accepted === null ? (
                <IfPermitted permission="AI_SUMMARY_REVIEW">
                  <div className="ai-panel__actions">
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => decideCategory.run({ issueId, accept: true }))}
                    >
                      Accept category
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void run(() => decideCategory.run({ issueId, accept: false }))}
                    >
                      Dismiss
                    </Button>
                  </div>
                </IfPermitted>
              ) : (
                <p className="cms-muted">
                  {insight.categorySuggestion.accepted
                    ? 'Accepted by staff. The submission category was updated.'
                    : 'Dismissed by staff. The submission category is unchanged.'}
                </p>
              )}
            </div>
          ) : null}

          {insight.topics.length > 0 ? (
            <div className="ai-panel__topics">
              <h3 className="ai-panel__heading">Detected topics</h3>
              <ul className="ai-panel__topic-list">
                {insight.topics.map((topic) => (
                  <li key={topic.id}>{topic.topic}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="ai-panel__provenance">
            <p className="cms-muted">
              {insight.model ? `Model: ${insight.model}. ` : null}
              {insight.promptVersion ? `Prompt: ${insight.promptVersion}. ` : null}
              {insight.generation > 0 ? `Generation ${insight.generation}. ` : null}
              {insight.reviewedBy && insight.reviewedAt
                ? `Reviewed by ${insight.reviewedBy.fullName} on ${formatDateTime(insight.reviewedAt)}.`
                : null}
            </p>
          </div>

          {insight.summary ? (
            <IfPermitted permission="AI_SUMMARY_REVIEW">
              <div className="ai-panel__actions">
                <Button
                  type="button"
                  disabled={busy || insight.reviewStatus === 'APPROVED'}
                  onClick={() => void run(() => review.run({ issueId, decision: 'APPROVE' }))}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setDraft(insight.summary ?? '');
                    setEditing(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || insight.reviewStatus === 'REJECTED'}
                  onClick={() => void run(() => review.run({ issueId, decision: 'REJECT' }))}
                >
                  Reject
                </Button>
              </div>
            </IfPermitted>
          ) : null}

          <IfPermitted permission="AI_ISSUE_REGENERATE">
            <div className="ai-panel__actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void run(() => regenerate.run({ issueId }))}
              >
                {regenerate.state.submitting ? 'Regenerating…' : 'Regenerate'}
              </Button>
            </div>
          </IfPermitted>
        </div>
      )}

      {similar.length > 0 ? (
        <div className="ai-panel__similar">
          <h3 className="ai-panel__heading">Potentially similar submissions</h3>
          <p className="cms-muted">
            Suggestions only, based on shared topics and wording. Nothing is merged or closed
            automatically &mdash; open them and decide.
          </p>
          <ul className="ai-panel__similar-list">
            {similar.map((row) => (
              <li key={row.issue.id}>
                <Link to={`/admin/issues/${row.issue.id}`}>{row.issue.referenceNumber}</Link>{' '}
                <span>{row.issue.title}</span>{' '}
                <span className="cms-muted">
                  matched on {row.basis === 'TOPICS' ? 'topics' : 'wording'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </CmsCard>
  );
}
