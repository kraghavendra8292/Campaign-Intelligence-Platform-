import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@rk/ui';
import { useAdminQuery } from '../../../features/admin/adminApi';
import { graphqlRequest } from '../../../features/auth/authClient';
import {
  ANALYTICS_BACKLOG_QUERY,
  ANALYTICS_BREAKDOWN_QUERY,
  ANALYTICS_EXPORT_QUERY,
  ANALYTICS_GEO_QUERY,
  ANALYTICS_INTELLIGENCE_QUERY,
  ANALYTICS_OVERVIEW_QUERY,
  ANALYTICS_RESOLUTION_QUERY,
  ANALYTICS_TREND_QUERY,
  type AnalyticsBacklogData,
  type AnalyticsBreakdownData,
  type AnalyticsExportDataset,
  type AnalyticsGeoData,
  type AnalyticsIntelligenceData,
  type AnalyticsOverviewData,
  type AnalyticsResolutionData,
  type AnalyticsTrendData,
} from '../../../features/analytics/analyticsQueries';
import { useAnalyticsFilters } from '../../../features/analytics/useAnalyticsFilters';
import { CmsPageHeader, IfPermitted } from '../../../components/cms/CmsShell';
import { QrBoundary, StatCard, StatGrid } from '../../../components/qr/QrShell';
import {
  ChartCard,
  ColumnChart,
  RankedBars,
  TrendChart,
} from '../../../components/analytics/charts';
import { AnalyticsFilterPanel } from '../../../components/analytics/AnalyticsFilterPanel';
import { AreaTable, AreaDetailPanel } from '../../../components/analytics/AreaSections';
import { formatDateTime } from '../../../lib/format';

/**
 * The decision dashboard.
 *
 * SECTION ORDER IS THE ARGUMENT. What happened (overview and insights), then
 * when (trend), then what kind (categories, statuses, priorities), then where
 * (areas), then how well we are handling it (resolution), then what to do next
 * (backlog). An administrator reading top to bottom is walked from a situation
 * to an action.
 *
 * EACH SECTION LOADS INDEPENDENTLY. Six queries rather than one document, so
 * the header paints immediately while the slower area rollup is still running.
 * A single document would hold the whole page at the speed of its slowest
 * panel, and every filter change would repay that.
 *
 * NOTHING IS COMPUTED IN THE BROWSER. No issue rows reach this page; every
 * figure was produced by a database aggregate. That is what makes the numbers
 * consistent between sections and what keeps the page usable at fifty thousand
 * submissions.
 *
 * WHAT THESE NUMBERS ARE NOT is stated on the page itself, at the foot, where
 * staff will actually read it - carried forward from the Phase 5 analytics page
 * because this dashboard ranks wards and is therefore the surface most open to
 * being misread as something about the people who live in them.
 */
export function AnalyticsPage() {
  const { filters, variables, setFilters, reset, activeCount } = useAnalyticsFilters();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const overview = useAdminQuery<AnalyticsOverviewData>(ANALYTICS_OVERVIEW_QUERY, variables);
  const trend = useAdminQuery<AnalyticsTrendData>(ANALYTICS_TREND_QUERY, {
    ...variables,
    granularity: 'AUTO',
  });
  const breakdown = useAdminQuery<AnalyticsBreakdownData>(ANALYTICS_BREAKDOWN_QUERY, variables);
  const geo = useAdminQuery<AnalyticsGeoData>(ANALYTICS_GEO_QUERY, variables);
  const resolution = useAdminQuery<AnalyticsResolutionData>(ANALYTICS_RESOLUTION_QUERY, variables);
  const backlog = useAdminQuery<AnalyticsBacklogData>(ANALYTICS_BACKLOG_QUERY, variables);
  const intelligence = useAdminQuery<AnalyticsIntelligenceData>(
    ANALYTICS_INTELLIGENCE_QUERY,
    variables,
  );

  return (
    <div className="cms-page analytics-page">
      <CmsPageHeader
        title="Campaign intelligence"
        description="Aggregate view of what citizens are reporting, where, and how quickly it is being resolved."
      />

      <AnalyticsFilterPanel
        filters={filters}
        onChange={setFilters}
        onReset={reset}
        activeCount={activeCount}
        variables={variables}
      />

      <ExportBar filters={variables} />

      {/* ---- Overview and insights ------------------------------------- */}
      <QrBoundary state={overview.state} refetch={overview.refetch}>
        {(data) => (
          <>
            <OverviewCards data={data} />
            <InsightCards insights={data.analyticsInsights} />
            <p className="analytics-freshness">
              Figures computed {formatDateTime(data.analyticsOverview.generatedAt)}. Not cached.
            </p>
          </>
        )}
      </QrBoundary>

      {/* ---- Trend ------------------------------------------------------ */}
      <QrBoundary state={trend.state} refetch={trend.refetch}>
        {(data) => (
          <ChartCard
            title="Submissions over time"
            description={`Bucketed by ${data.analyticsTrend.granularity.toLowerCase()}. Previous period total: ${data.analyticsTrend.previousTotal.toLocaleString()}.`}
          >
            <TrendChart
              points={data.analyticsTrend.points.map((point) => ({
                date: point.date,
                value: point.count,
              }))}
              unit="submissions"
              emptyMessage="No submissions in the selected period."
            />
          </ChartCard>
        )}
      </QrBoundary>

      {/* ---- Breakdowns -------------------------------------------------- */}
      <QrBoundary state={breakdown.state} refetch={breakdown.refetch}>
        {(data) => (
          <div className="analytics-grid">
            <ChartCard title="By category" description="Ranked by volume in the selected period.">
              <RankedBars
                buckets={data.analyticsByCategory.map(toBucket)}
                unit="submissions"
                emptyMessage="No submissions match these filters."
              />
            </ChartCard>

            <ChartCard
              title="By status"
              description="In workflow order, so the shape of the funnel is visible."
            >
              <ColumnChart
                buckets={data.analyticsByStatus.map(toBucket)}
                emptyMessage="No submissions match these filters."
              />
            </ChartCard>

            <ChartCard title="By priority" description="Administrative triage, set by staff.">
              <CategoryTable rows={data.analyticsByPriority} label="Priority" />
            </ChartCard>

            <ChartCard title="Category detail" description="Period comparison and open workload.">
              <CategoryTable rows={data.analyticsByCategory} label="Category" />
            </ChartCard>
          </div>
        )}
      </QrBoundary>

      {/* ---- Geography --------------------------------------------------- */}
      <section className="analytics-section">
        <h2 className="analytics-section__title">Geographic intelligence</h2>
        <p className="cms-muted">
          Submissions grouped by the {filters.geoLevel.toLowerCase()} a citizen named when
          reporting. Exact locations are never shown.
        </p>

        <QrBoundary state={geo.state} refetch={geo.refetch}>
          {(data) => (
            <>
              <AreaTable
                rows={data.analyticsAreas}
                selected={selectedArea}
                onSelect={setSelectedArea}
              />
              <AttentionLists attention={data.analyticsAreaAttention} onSelect={setSelectedArea} />
            </>
          )}
        </QrBoundary>

        {selectedArea ? (
          <AreaDetailPanel
            area={selectedArea}
            variables={variables}
            onClose={() => setSelectedArea(null)}
          />
        ) : null}
      </section>

      {/* ---- AI and channel ---------------------------------------------- */}
      <QrBoundary state={intelligence.state} refetch={intelligence.refetch}>
        {(data) => <IntelligenceSections data={data} />}
      </QrBoundary>

      {/* ---- Resolution --------------------------------------------------- */}
      <QrBoundary state={resolution.state} refetch={resolution.refetch}>
        {(data) => <ResolutionSections data={data.analyticsResolution} />}
      </QrBoundary>

      {/* ---- Backlog ------------------------------------------------------ */}
      <QrBoundary state={backlog.state} refetch={backlog.refetch}>
        {(data) => <BacklogTable rows={data.analyticsBacklog} />}
      </QrBoundary>

      <p className="analytics-disclaimer">
        These figures describe <strong>reported civic issues</strong> and the campaign&rsquo;s
        workload. A ward appearing near the top of a table has reported more problems &mdash; that
        is a statement about infrastructure and about reporting, and never about the politics,
        preferences or intentions of the people who live there.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewCards({ data }: { data: AnalyticsOverviewData }) {
  const overview = data.analyticsOverview;

  return (
    <StatGrid>
      <StatCard
        label="Submissions this period"
        value={overview.totalInRange.toLocaleString()}
        hint={changeHint(overview.changePct, overview.previousTotal)}
      />
      <StatCard label="Open now" value={overview.openCount.toLocaleString()} hint="All periods" />
      <StatCard
        label="Resolved this period"
        value={overview.resolvedInRange.toLocaleString()}
        hint={changeHint(overview.resolvedChangePct, overview.previousResolvedInRange)}
      />
      <StatCard
        label="Resolution rate"
        value={percent(overview.resolutionRatePct)}
        hint="Of submissions received this period"
      />
      <StatCard
        label="High priority open"
        value={overview.highPriorityOpen.toLocaleString()}
        hint="All periods"
      />
      <StatCard
        label="Average resolution"
        value={days(overview.averageResolutionDays)}
        hint={
          overview.medianResolutionDays === null
            ? 'No resolutions in period'
            : `Median ${days(overview.medianResolutionDays)}`
        }
      />
      <StatCard
        label="Unassigned open"
        value={overview.unassignedOpen.toLocaleString()}
        hint="All periods"
      />
      <StatCard
        label="Awaiting moderation"
        value={overview.awaitingModeration.toLocaleString()}
        hint="All periods"
      />
    </StatGrid>
  );
}

/**
 * Evidence-backed insight cards.
 *
 * Every card renders its two counts beside the sentence, because the sentence
 * without them is a claim and with them is a finding. The wording comes from
 * the backend as a template over those same figures - no model wrote it - and
 * the card says so is unnecessary precisely because no AI label is warranted.
 */
function InsightCards({ insights }: { insights: AnalyticsOverviewData['analyticsInsights'] }) {
  if (insights.length === 0) return null;

  return (
    <div className="insight-grid">
      {insights.map((insight) => (
        <article
          key={`${insight.kind}-${insight.headline}`}
          className={`insight-card insight-card--${insight.severity.toLowerCase()}`}
        >
          <h3 className="insight-card__headline">{insight.headline}</h3>
          <p className="insight-card__detail">{insight.detail}</p>
          <dl className="insight-card__evidence">
            <div>
              <dt>This period</dt>
              <dd>{insight.currentValue.toLocaleString()}</dd>
            </div>
            {insight.changePct !== null ? (
              <>
                <div>
                  <dt>Previous</dt>
                  <dd>{insight.previousValue.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Change</dt>
                  <dd>
                    {insight.changePct > 0 ? '+' : ''}
                    {insight.changePct}%
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function CategoryTable({
  rows,
  label,
}: {
  rows: AnalyticsBreakdownData['analyticsByCategory'];
  label: string;
}) {
  if (rows.length === 0) return <p className="chart-empty">No submissions match these filters.</p>;

  return (
    <div className="table-scroll">
      <table className="cms-table">
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col">Count</th>
            <th scope="col">Share</th>
            <th scope="col">Previous</th>
            <th scope="col">Change</th>
            <th scope="col">Open</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{row.count.toLocaleString()}</td>
              <td>{percent(row.sharePct)}</td>
              <td>{row.previousCount.toLocaleString()}</td>
              <td className={changeClass(row.changePct)}>{signedPercent(row.changePct)}</td>
              <td>{row.openCount === null ? '—' : row.openCount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttentionLists({
  attention,
  onSelect,
}: {
  attention: AnalyticsGeoData['analyticsAreaAttention'];
  onSelect: (area: string) => void;
}) {
  const lists: Array<{
    title: string;
    description: string;
    rows: AnalyticsGeoData['analyticsAreas'];
    metric: (row: AnalyticsGeoData['analyticsAreas'][number]) => string;
  }> = [
    {
      title: 'Most unresolved',
      description: 'Open submissions outstanding, all periods.',
      rows: attention.byUnresolved,
      metric: (row) => `${row.openCount} open`,
    },
    {
      title: 'Most high priority',
      description: 'Open submissions marked high or urgent by staff.',
      rows: attention.byHighPriority,
      metric: (row) => `${row.highPriorityOpenCount} high/urgent`,
    },
    {
      title: 'Slowest to resolve',
      description: 'Average days to resolution. Areas with too few resolutions are excluded.',
      rows: attention.bySlowResolution,
      metric: (row) => days(row.averageResolutionDays),
    },
  ];

  return (
    <div className="analytics-grid">
      {lists.map((list) => (
        <ChartCard key={list.title} title={list.title} description={list.description}>
          {list.rows.length === 0 ? (
            <p className="chart-empty">Nothing to show for these filters.</p>
          ) : (
            <ul className="attention-list">
              {list.rows.map((row) => (
                <li key={row.key}>
                  <button type="button" className="linklike" onClick={() => onSelect(row.key)}>
                    {row.label}
                  </button>
                  <span className="cms-muted">{list.metric(row)}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      ))}
    </div>
  );
}

function BacklogTable({ rows }: { rows: AnalyticsBacklogData['analyticsBacklog'] }) {
  return (
    <ChartCard
      title="High priority backlog"
      description="Open submissions marked high or urgent, oldest first. Priority is set by staff and is never changed automatically."
    >
      {rows.length === 0 ? (
        <p className="chart-empty">No high priority submissions are open. </p>
      ) : (
        <div className="table-scroll">
          <table className="cms-table">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Category</th>
                <th scope="col">Area</th>
                <th scope="col">Priority</th>
                <th scope="col">Status</th>
                <th scope="col">Age</th>
                <th scope="col">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/admin/issues/${row.id}`}>{row.referenceNumber}</Link>
                  </td>
                  <td>{row.category?.label ?? 'Not categorised'}</td>
                  <td>{row.ward ?? row.locality ?? row.area ?? '—'}</td>
                  <td>{row.priority}</td>
                  <td>{row.status.replace(/_/g, ' ').toLowerCase()}</td>
                  <td>{row.ageDays} days</td>
                  <td>{row.assignedTo?.fullName ?? 'Unassigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function ResolutionSections({ data }: { data: AnalyticsResolutionData['analyticsResolution'] }) {
  return (
    <section className="analytics-section">
      <h2 className="analytics-section__title">Resolution performance</h2>

      <StatGrid>
        <StatCard
          label="Average resolution"
          value={days(data.averageResolutionDays)}
          hint={`${data.resolvedInRange} resolved in period`}
        />
        <StatCard
          label="Median resolution"
          value={days(data.medianResolutionDays)}
          hint="Less affected by a few very old items"
        />
        <StatCard
          label="Average first response"
          value={days(data.averageFirstResponseDays)}
          hint={`Approximated from first status change (${data.firstResponseSampleCount} samples)`}
        />
        <StatCard
          label="Oldest open"
          value={data.oldestOpenAgeDays === null ? '—' : `${data.oldestOpenAgeDays} days`}
          hint="All periods"
        />
      </StatGrid>

      <div className="analytics-grid">
        <ChartCard
          title="Time to resolution"
          description="How long resolved submissions took. A record of the past."
        >
          <ColumnChart
            buckets={data.timeToResolution.map((bucket) => ({
              key: bucket.key,
              label: bucket.label,
              value: bucket.count,
            }))}
            emptyMessage="Nothing was resolved in this period."
          />
        </ChartCard>

        <ChartCard
          title="Backlog aging"
          description="How long open submissions have been waiting. A picture of the present."
        >
          <ColumnChart
            buckets={data.backlogAging.map((bucket) => ({
              key: bucket.key,
              label: bucket.label,
              value: bucket.count,
            }))}
            emptyMessage="Nothing is currently open."
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Slowest categories"
        description="Average days to resolution. Categories with too few resolutions are excluded rather than ranked on noise."
      >
        {data.slowestCategories.length === 0 ? (
          <p className="chart-empty">Not enough resolved submissions to compare categories.</p>
        ) : (
          <div className="table-scroll">
            <table className="cms-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Average</th>
                  <th scope="col">Median</th>
                  <th scope="col">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {data.slowestCategories.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{days(row.averageResolutionDays)}</td>
                    <td>{days(row.medianResolutionDays)}</td>
                    <td>{row.resolvedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </section>
  );
}

// ---------------------------------------------------------------------------
// AI and channel
// ---------------------------------------------------------------------------

function IntelligenceSections({ data }: { data: AnalyticsIntelligenceData }) {
  const themes = data.analyticsThemes;
  const topics = data.analyticsTopics;
  const source = data.analyticsSource;

  return (
    <>
      {themes !== null || topics !== null ? (
        <section className="analytics-section">
          <h2 className="analytics-section__title">Themes and topics</h2>
          <p className="ai-disclaimer" role="note">
            <strong>AI-assisted.</strong> Theme names and summaries were written by a language
            model. <strong>All counts below were computed by the platform</strong>, not by the
            model, and are recalculated for the filters you have selected.
          </p>

          <div className="analytics-grid">
            {themes !== null ? (
              <ChartCard title="Recurring themes" description="Detected across submissions.">
                {themes.length === 0 ? (
                  <p className="chart-empty">No themes match the selected filters.</p>
                ) : (
                  <ul className="theme-cards">
                    {themes.map((theme) => (
                      <li key={theme.id} className="theme-card">
                        <div className="theme-card__head">
                          <strong>{theme.name}</strong>
                          <span className="cms-muted">
                            {theme.count.toLocaleString()} submissions
                            {theme.changePct !== null
                              ? ` · ${signedPercent(theme.changePct)} vs previous`
                              : ''}
                          </span>
                        </div>
                        {theme.generatedSummary ? (
                          <p className="theme-card__summary">{theme.generatedSummary}</p>
                        ) : null}
                        <p className="cms-muted">
                          Evidence: {theme.count} this period, {theme.previousCount} previous.
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>
            ) : null}

            {topics !== null ? (
              <ChartCard
                title="Common topics"
                description="Subject matter extracted from submissions. Counted per submission."
              >
                <RankedBars
                  buckets={topics.map((topic) => ({
                    key: topic.topic,
                    label: topic.label,
                    value: topic.count,
                  }))}
                  unit="submissions"
                  emptyMessage="No topics match the selected filters."
                />
              </ChartCard>
            ) : null}
          </div>
        </section>
      ) : null}

      {source !== null ? (
        <section className="analytics-section">
          <h2 className="analytics-section__title">Channels</h2>
          <p className="cms-muted">
            How citizens arrived. A scan means a code was scanned &mdash; nothing more is inferred
            about the person who scanned it.
          </p>

          <StatGrid>
            <StatCard
              label="QR scans"
              value={source.scanCount.toLocaleString()}
              hint="Excludes automated"
            />
            <StatCard label="Submissions via QR" value={source.issuesFromQr.toLocaleString()} />
            <StatCard
              label="Submission rate"
              value={percent(source.conversionRatePct)}
              hint="Submissions per scan"
            />
          </StatGrid>

          <div className="analytics-grid">
            <ChartCard title="By source" description="Where submissions came from.">
              <RankedBars
                buckets={source.bySource.map((row) => ({
                  key: row.key,
                  label: row.label,
                  value: row.count,
                }))}
                unit="submissions"
                emptyMessage="No submissions match these filters."
              />
            </ChartCard>

            <ChartCard title="By campaign" description="Scans and submissions per QR campaign.">
              {source.byCampaign.length === 0 ? (
                <p className="chart-empty">No QR activity in this period.</p>
              ) : (
                <div className="table-scroll">
                  <table className="cms-table">
                    <thead>
                      <tr>
                        <th scope="col">Campaign</th>
                        <th scope="col">Scans</th>
                        <th scope="col">Submissions</th>
                        <th scope="col">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {source.byCampaign.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.scans.toLocaleString()}</td>
                          <td>{row.issues.toLocaleString()}</td>
                          <td>{percent(row.conversionRatePct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>
          </div>
        </section>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const EXPORT_DATASETS: Array<{ value: AnalyticsExportDataset; label: string }> = [
  { value: 'OVERVIEW', label: 'Overview' },
  { value: 'CATEGORIES', label: 'Categories' },
  { value: 'STATUSES', label: 'Statuses' },
  { value: 'PRIORITIES', label: 'Priorities' },
  { value: 'AREAS', label: 'Areas' },
  { value: 'RESOLUTION', label: 'Resolution' },
];

/**
 * Export control.
 *
 * Hidden entirely without `ANALYTICS_EXPORT` rather than shown and refused: an
 * administrator who cannot export does not need a button that fails.
 *
 * The download is assembled in the browser from the CSV the API returns, which
 * keeps the server side a plain GraphQL field rather than a second authenticated
 * file endpoint to secure - matching how Phase 4 delivers its QR export.
 */
function ExportBar({ filters }: { filters: { filter: Record<string, unknown> } }) {
  const [dataset, setDataset] = useState<AnalyticsExportDataset>('OVERVIEW');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await graphqlRequest<{ analyticsExportCsv: string }>(ANALYTICS_EXPORT_QUERY, {
        variables: { dataset, ...filters },
      });

      const blob = new Blob([result.analyticsExportCsv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `analytics-${dataset.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // The underlying error is not surfaced: it can carry internal detail, and
      // the useful action is the same whatever it was.
      setError('The export could not be produced. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [dataset, filters]);

  return (
    <IfPermitted permission="ANALYTICS_EXPORT">
      <div className="analytics-export">
        <label className="cms-field__label" htmlFor="analytics-export-dataset">
          Export
        </label>
        <select
          id="analytics-export-dataset"
          className="rk-select__control"
          value={dataset}
          onChange={(event) => setDataset(event.target.value as AnalyticsExportDataset)}
        >
          {EXPORT_DATASETS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void download()}>
          {busy ? 'Preparing…' : 'Download CSV'}
        </Button>
        <span className="cms-muted">Aggregate figures only, matching the filters above.</span>
        {error ? (
          <span className="cms-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </IfPermitted>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Null renders as an em dash, never as "0%".
 *
 * A rate with an empty denominator is undefined, and printing zero would state
 * something false with the same confidence as a measurement.
 */
function percent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function signedPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value}%`;
}

function days(value: number | null): string {
  return value === null ? '—' : `${value} days`;
}

function changeClass(value: number | null): string {
  if (value === null) return '';
  return value > 0 ? 'change change--up' : value < 0 ? 'change change--down' : 'change';
}

function changeHint(change: number | null, previous: number): string {
  if (change === null) return 'No comparable previous period';
  return `${signedPercent(change)} vs ${previous.toLocaleString()} previous`;
}

function toBucket(row: { key: string; label: string; count: number }) {
  return { key: row.key, label: row.label, value: row.count };
}
