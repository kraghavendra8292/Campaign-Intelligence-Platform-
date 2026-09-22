import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@rk/ui';
import { useAdminMutation, useAdminQuery } from '../../../features/admin/adminApi';
import {
  AI_EXECUTIVE_SUMMARIES_QUERY,
  AI_OVERVIEW_QUERY,
  AI_REVIEW_QUEUE_QUERY,
  AI_THEMES_QUERY,
  AI_USAGE_QUERY,
  GENERATE_AI_EXECUTIVE_SUMMARY,
  GENERATE_AI_THEMES,
  REVIEW_AI_EXECUTIVE_SUMMARY,
  type AiExecutiveSummaryRow,
  type AiOverviewRow,
  type AiReviewQueueRow,
  type AiThemeRow,
  type AiUsageRow,
} from '../../../features/ai/aiQueries';
import { CmsBoundary, CmsCard, CmsPageHeader, IfPermitted } from '../../../components/cms/CmsShell';
import { AiDisclaimer, AiProcessingBadge, AiReviewBadge } from '../../../components/ai/AiBadges';
import { formatDate, formatDateTime } from '../../../lib/format';

/**
 * The AI console.
 *
 * Sections in the order an administrator actually needs them: is it working,
 * what needs my attention, what is it telling me in aggregate, and what is it
 * costing. Operational health first because a dashboard whose numbers are stale
 * for a configuration reason should say so before it shows analysis.
 *
 * EVERY NUMBER ON THIS PAGE IS A DATABASE AGGREGATE. Nothing is a model's
 * estimate, and the two places a figure could be misread are labelled: the
 * queue panel says it describes this API process only, and unpriced usage
 * reads "Not priced" rather than "$0.00".
 */

/** A period covering the last N days, for the generation controls. */
function lastDays(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function AiInsightsPage() {
  const overview = useAdminQuery<{ aiOverview: AiOverviewRow }>(AI_OVERVIEW_QUERY);

  return (
    <>
      <CmsPageHeader
        title="AI insights"
        description="AI-assisted summaries, topics and themes drawn from citizen submissions. Everything here is reviewed by a person before it is used."
      />

      <CmsBoundary state={overview.state} refetch={overview.refetch}>
        {(data) => <OverviewSection overview={data.aiOverview} />}
      </CmsBoundary>

      <ReviewQueueSection />
      <ThemesSection />
      <ExecutiveSummarySection />
      <UsageSection />
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewSection({ overview }: { overview: AiOverviewRow }) {
  return (
    <>
      {!overview.enabled ? (
        <CmsCard>
          <p className="cms-error" role="alert">
            AI processing is not currently available. Submissions, the issue console and citizen
            tracking are unaffected &mdash; only the generation of new AI output is paused.
          </p>
        </CmsCard>
      ) : null}

      <CmsCard title="Processing">
        <dl className="ai-stats">
          <Stat label="Submissions" value={overview.totalIssues} />
          <Stat label="Processed" value={overview.processed} />
          <Stat label="Not processed" value={overview.notProcessed} />
          <Stat label="Queued" value={overview.queued} />
          <Stat label="Failed" value={overview.failed} />
          <Stat label="Needs a closer look" value={overview.requiresReview} />
          <Stat
            label="Success rate"
            // Null rather than 0 when nothing has run: a "0%" success rate for
            // a tenant that has never generated anything is a false alarm.
            value={
              overview.successRatePct === null ? 'Nothing run yet' : `${overview.successRatePct}%`
            }
          />
        </dl>
        <p className="cms-muted">
          Provider: {overview.provider}. Model: {overview.model}.
        </p>
      </CmsCard>

      <CmsCard title="Review">
        <dl className="ai-stats">
          <Stat label="Awaiting review" value={overview.pendingReview} />
          <Stat label="Approved" value={overview.approvedCount} />
          <Stat label="Rejected" value={overview.rejectedCount} />
          <Stat label="Themes" value={overview.themeCount} />
          <Stat label="Executive summaries" value={overview.executiveSummaryCount} />
        </dl>
      </CmsCard>

      {overview.topTopics.length > 0 ? (
        <CmsCard title="Most common topics">
          <AiDisclaimer>
            Topics are extracted by a language model from what citizens wrote. They describe
            reported subject matter, not the people who reported it.
          </AiDisclaimer>
          <ul className="ai-topic-counts">
            {overview.topTopics.map((row) => (
              <li key={row.topic}>
                <span>{row.topic}</span>
                <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        </CmsCard>
      ) : null}

      {overview.recentFailures.length > 0 ? (
        <CmsCard title="Recent failures">
          <ul className="ai-failure-list">
            {overview.recentFailures.map((row) => (
              <li key={row.issueId}>
                <Link to={`/admin/issues/${row.issueId}`}>View submission</Link>{' '}
                <span className="cms-muted">
                  {row.failureReason ?? row.failureKind ?? 'Unknown failure'}
                  {row.completedAt ? ` — ${formatDateTime(row.completedAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </CmsCard>
      ) : null}

      <CmsCard title="Queue (this server only)">
        <p className="cms-muted">
          The processing queue runs inside this API process, so these figures describe one server
          and reset when it restarts.
        </p>
        <dl className="ai-stats">
          <Stat label="Waiting" value={overview.queue.pending} />
          <Stat label="Workers busy" value={overview.queue.activeWorkers} />
          <Stat label="Processed since start" value={overview.queue.processed} />
          <Stat label="Failed since start" value={overview.queue.failed} />
        </dl>
      </CmsCard>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="ai-stats__item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

function ReviewQueueSection() {
  const { state, refetch } = useAdminQuery<{
    aiIssueInsights: { nodes: AiReviewQueueRow[]; totalCount: number; hasMore: boolean };
  }>(AI_REVIEW_QUEUE_QUERY, { filter: { reviewStatus: 'GENERATED', first: 20 } });

  return (
    <CmsCard title="Summaries awaiting review">
      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.aiIssueInsights.nodes.length === 0}
        emptyMessage="Nothing is waiting for review."
      >
        {(data) => (
          <ul className="ai-review-list">
            {data.aiIssueInsights.nodes.map((row) => (
              <li key={row.issueId} className="ai-review-list__item">
                <div className="ai-review-list__head">
                  <Link to={`/admin/issues/${row.issueId}`}>{row.referenceNumber}</Link>
                  <AiProcessingBadge status={row.insight.processingStatus} />
                  <AiReviewBadge status={row.insight.reviewStatus} />
                </div>
                <p className="ai-review-list__title">{row.title}</p>
                {row.insight.summary ? (
                  <p className="ai-review-list__summary">{row.insight.summary}</p>
                ) : null}
                {row.insight.categorySuggestion?.category ? (
                  <p className="cms-muted">
                    Suggested category: {row.insight.categorySuggestion.category.label}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CmsBoundary>
    </CmsCard>
  );
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

function ThemesSection() {
  const { state, refetch } = useAdminQuery<{ aiThemes: AiThemeRow[] }>(AI_THEMES_QUERY);
  const generate = useAdminMutation<
    Record<string, unknown>,
    { period: { from: string; to: string } }
  >(GENERATE_AI_THEMES);

  const onGenerate = useCallback(async () => {
    await generate.run({ period: lastDays(30) });
    refetch();
  }, [generate, refetch]);

  return (
    <CmsCard title="Recurring themes">
      <p className="cms-muted">
        Recurring subject matter across submissions in a period. Issue counts are computed by the
        platform, not by the model.
      </p>

      <IfPermitted permission="AI_ISSUE_PROCESS">
        <div className="ai-panel__actions">
          <Button
            type="button"
            disabled={generate.state.submitting}
            onClick={() => void onGenerate()}
          >
            {generate.state.submitting ? 'Detecting…' : 'Detect themes (last 30 days)'}
          </Button>
        </div>
      </IfPermitted>

      {generate.state.error ? (
        <p className="cms-error" role="alert">
          {generate.state.error}
        </p>
      ) : null}

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.aiThemes.length === 0}
        emptyMessage="No themes have been detected yet."
      >
        {(data) => (
          <ul className="ai-theme-list">
            {data.aiThemes.map((theme) => (
              <li key={theme.id} className="ai-theme-list__item">
                <div className="ai-review-list__head">
                  <strong>{theme.name}</strong>
                  <span className="cms-muted">{theme.issueCount} submissions</span>
                  <AiReviewBadge status={theme.reviewStatus} />
                </div>
                {theme.description ? <p>{theme.description}</p> : null}
                {theme.generatedSummary ? (
                  <p className="ai-review-list__summary">{theme.generatedSummary}</p>
                ) : null}
                <p className="cms-muted">
                  {formatDate(theme.periodStart)} – {formatDate(theme.periodEnd)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CmsBoundary>
    </CmsCard>
  );
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

function ExecutiveSummarySection() {
  const { state, refetch } = useAdminQuery<{ aiExecutiveSummaries: AiExecutiveSummaryRow[] }>(
    AI_EXECUTIVE_SUMMARIES_QUERY,
  );

  const generate = useAdminMutation<
    Record<string, unknown>,
    { period: { from: string; to: string } }
  >(GENERATE_AI_EXECUTIVE_SUMMARY);
  const review = useAdminMutation<
    Record<string, unknown>,
    { id: string; decision: string; editedSummary?: string | null }
  >(REVIEW_AI_EXECUTIVE_SUMMARY);

  const [days, setDays] = useState(30);

  const onGenerate = useCallback(async () => {
    await generate.run({ period: lastDays(days) });
    refetch();
  }, [generate, refetch, days]);

  return (
    <CmsCard title="Executive summary">
      <p className="cms-muted">
        A written briefing for a period. The model is given statistics computed by the platform and
        is instructed to use only those figures; the figures are shown alongside so any claim can be
        checked.
      </p>

      <IfPermitted permission="AI_ISSUE_PROCESS">
        <div className="ai-panel__actions">
          <label className="cms-field__label" htmlFor="ai-summary-period">
            Period
          </label>
          <select
            id="ai-summary-period"
            className="cms-field__input"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button
            type="button"
            disabled={generate.state.submitting}
            onClick={() => void onGenerate()}
          >
            {generate.state.submitting ? 'Generating…' : 'Generate summary'}
          </Button>
        </div>
      </IfPermitted>

      {generate.state.error ? (
        <p className="cms-error" role="alert">
          {generate.state.error}
        </p>
      ) : null}

      <CmsBoundary
        state={state}
        refetch={refetch}
        isEmpty={(data) => data.aiExecutiveSummaries.length === 0}
        emptyMessage="No executive summaries have been generated yet."
      >
        {(data) => (
          <ul className="ai-summary-list">
            {data.aiExecutiveSummaries.map((summary) => (
              <li key={summary.id} className="ai-summary-list__item">
                <div className="ai-review-list__head">
                  <strong>
                    {formatDate(summary.periodStart)} – {formatDate(summary.periodEnd)}
                  </strong>
                  <AiReviewBadge status={summary.reviewStatus} />
                </div>

                <AiDisclaimer>
                  Written by a language model from the figures shown below. Check any claim against
                  them before using it.
                </AiDisclaimer>

                {summary.unsupportedFigures.length > 0 ? (
                  <p className="cms-error" role="alert">
                    These figures in the text are not supported by the data supplied to the model
                    and should be checked before use: {summary.unsupportedFigures.join(', ')}.
                  </p>
                ) : null}

                <p className="ai-summary-list__text">{summary.summary}</p>

                {summary.isEdited ? (
                  <details className="ai-panel__original">
                    <summary>What the model originally wrote</summary>
                    <p>{summary.generatedSummary}</p>
                  </details>
                ) : null}

                {summary.keyThemes.length > 0 ? (
                  <ul className="ai-panel__topic-list">
                    {summary.keyThemes.map((theme) => (
                      <li key={theme}>{theme}</li>
                    ))}
                  </ul>
                ) : null}

                <EvidenceTable summary={summary} />

                <p className="cms-muted">
                  Generated {formatDateTime(summary.generatedAt)}
                  {summary.generatedBy ? ` by ${summary.generatedBy.fullName}` : ''}
                  {summary.model ? ` · ${summary.model}` : ''}
                  {summary.promptVersion ? ` · ${summary.promptVersion}` : ''}
                  {summary.reviewedBy ? ` · reviewed by ${summary.reviewedBy.fullName}` : ''}
                </p>

                <IfPermitted permission="AI_SUMMARY_REVIEW">
                  <div className="ai-panel__actions">
                    <Button
                      type="button"
                      disabled={review.state.submitting || summary.reviewStatus === 'APPROVED'}
                      onClick={() =>
                        void (async () => {
                          await review.run({ id: summary.id, decision: 'APPROVE' });
                          refetch();
                        })()
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={review.state.submitting || summary.reviewStatus === 'REJECTED'}
                      onClick={() =>
                        void (async () => {
                          await review.run({ id: summary.id, decision: 'REJECT' });
                          refetch();
                        })()
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </IfPermitted>
              </li>
            ))}
          </ul>
        )}
      </CmsBoundary>
    </CmsCard>
  );
}

/**
 * The statistics the model was given, rendered beside its prose.
 *
 * This is what makes the summary checkable rather than merely authoritative-
 * sounding. It is not an optional detail panel and is not collapsed by default.
 */
function EvidenceTable({ summary }: { summary: AiExecutiveSummaryRow }) {
  const evidence = summary.evidence;

  return (
    <div className="ai-evidence">
      <h4 className="ai-panel__heading">Supporting figures (computed by the platform)</h4>
      <dl className="ai-stats">
        <Stat label="Submissions in period" value={evidence.totalIssues} />
        <Stat label="Previous period" value={evidence.previousPeriodTotal} />
        <Stat
          label="Change"
          value={
            evidence.changeFromPreviousPct === null
              ? 'Not comparable'
              : `${evidence.changeFromPreviousPct > 0 ? '+' : ''}${evidence.changeFromPreviousPct}%`
          }
        />
        <Stat label="Open now" value={evidence.openCount} />
        <Stat label="Resolved in period" value={evidence.resolvedInPeriod} />
      </dl>

      {evidence.byCategory.length > 0 ? (
        <table className="cms-table">
          <caption className="cms-muted">By category</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Count</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {evidence.byCategory.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.count}</td>
                <td>{row.sharePct === null ? '—' : `${row.sharePct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function UsageSection() {
  const { state, refetch } = useAdminQuery<{ aiUsage: AiUsageRow }>(AI_USAGE_QUERY);

  return (
    <IfPermitted permission="AI_ANALYTICS_READ">
      <CmsCard title="Usage and cost (last 30 days)">
        <CmsBoundary state={state} refetch={refetch}>
          {(data) => (
            <>
              <dl className="ai-stats">
                <Stat label="Requests" value={data.aiUsage.requestCount} />
                <Stat label="Succeeded" value={data.aiUsage.successCount} />
                <Stat label="Failed" value={data.aiUsage.failureCount} />
                <Stat
                  label="Success rate"
                  value={
                    data.aiUsage.successRatePct === null
                      ? 'Nothing run yet'
                      : `${data.aiUsage.successRatePct}%`
                  }
                />
                <Stat label="Tokens" value={data.aiUsage.totalTokens ?? 'Not reported'} />
                <Stat
                  label="Estimated cost"
                  // "Not priced" rather than "$0.00": unconfigured rates and a
                  // genuinely free run are different facts.
                  value={
                    data.aiUsage.estimatedCostUsd === null
                      ? 'Not priced'
                      : `$${data.aiUsage.estimatedCostUsd}`
                  }
                />
                <Stat
                  label="Average duration"
                  value={
                    data.aiUsage.averageDurationMs === null
                      ? '—'
                      : `${data.aiUsage.averageDurationMs} ms`
                  }
                />
              </dl>

              {data.aiUsage.byFailureKind.length > 0 ? (
                <ul className="ai-failure-list">
                  {data.aiUsage.byFailureKind.map((row) => (
                    <li key={row.kind}>
                      <span>{row.kind}</span> <strong>{row.count}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </CmsBoundary>
      </CmsCard>
    </IfPermitted>
  );
}
