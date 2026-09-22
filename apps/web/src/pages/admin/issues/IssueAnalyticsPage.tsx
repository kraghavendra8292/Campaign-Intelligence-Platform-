import { useMemo, useState } from 'react';
import { useAdminQuery } from '../../../features/admin/adminApi';
import {
  ISSUE_ANALYTICS_QUERY,
  type IssueAnalyticsData,
} from '../../../features/issues/issueQueries';
import { CmsPageHeader } from '../../../components/cms/CmsShell';
import {
  DateRangePicker,
  DEFAULT_RANGE,
  FilterBar,
  QrBoundary,
  StatCard,
  StatGrid,
  type RangeSelection,
} from '../../../components/qr/QrShell';
import { ChartCard, ColumnChart, RankedBars, TrendChart } from '../../../components/qr/charts';

/**
 * Aggregate submission analytics.
 *
 * Reuses the Phase 4 chart components and range picker rather than growing a
 * second set: an admin console where two dashboards disagree about what "last
 * 30 days" means, or draw bars differently, feels like two products.
 *
 * WHAT THESE NUMBERS ARE: counts of submissions, and of work outstanding. They
 * describe the campaign's workload and the places people reported problems in.
 *
 * WHAT THEY ARE NOT, and the note at the foot of the page says so where staff
 * will actually read it: a statement about anybody's politics. "Ward 12 filed
 * 42 drainage reports" is a fact about drains. Reading it as a fact about how
 * Ward 12 votes would be both unsupported and exactly the thing this platform
 * refuses to do.
 */
export function IssueAnalyticsPage() {
  const [range, setRange] = useState<RangeSelection>(DEFAULT_RANGE);

  const variables = useMemo(
    () => ({
      filter: {
        range: range.range,
        from: range.from ? new Date(range.from).toISOString() : null,
        to: range.to ? new Date(range.to).toISOString() : null,
      },
    }),
    [range],
  );

  const { state, refetch } = useAdminQuery<{ issueAnalytics: IssueAnalyticsData }>(
    ISSUE_ANALYTICS_QUERY,
    variables,
  );

  return (
    <div className="cms-page">
      <CmsPageHeader
        title="Submission analytics"
        description="Aggregate view of what citizens are sending in, and how much is outstanding."
        backTo="/admin/issues"
        backLabel="Back to inbox"
      />

      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
      </FilterBar>

      <QrBoundary state={state} refetch={refetch}>
        {(data) => {
          const analytics = data.issueAnalytics;
          const inRange = analytics.totalInRange;

          return (
            <div className="analytics">
              <StatGrid>
                <StatCard
                  label="Received in range"
                  value={inRange.toLocaleString()}
                  hint={`${analytics.range.days} day${analytics.range.days === 1 ? '' : 's'}`}
                  tone="primary"
                />
                <StatCard
                  label="Received today"
                  value={analytics.submittedToday.toLocaleString()}
                />
                <StatCard
                  label="Received in total"
                  value={analytics.totalAllTime.toLocaleString()}
                  hint="All time"
                />
                <StatCard
                  label="Still open"
                  value={analytics.openCount.toLocaleString()}
                  hint="Not yet closed or rejected"
                  tone="accent"
                />
              </StatGrid>

              <StatGrid>
                <StatCard
                  label="High or urgent"
                  value={analytics.highPriorityOpen.toLocaleString()}
                  hint="Open, needing attention"
                />
                <StatCard
                  label="Unassigned"
                  value={analytics.unassignedOpen.toLocaleString()}
                  hint="Open, nobody allocated"
                />
                <StatCard
                  label="Awaiting review"
                  value={analytics.awaitingModeration.toLocaleString()}
                  hint="Not yet vetted by a person"
                />
                <StatCard
                  label="Average per day"
                  value={(inRange / Math.max(1, analytics.range.days)).toFixed(1)}
                  hint="Across the selected range"
                />
              </StatGrid>

              <ChartCard
                title="Submissions over time"
                description="How many arrived each day in the selected range."
              >
                <TrendChart
                  points={analytics.trend.map((point) => ({
                    date: point.date,
                    scans: point.count,
                  }))}
                />
              </ChartCard>

              <div className="chart-grid">
                <ChartCard title="By status" description="Where the work currently sits.">
                  <RankedBars
                    buckets={toBuckets(analytics.byStatus)}
                    total={inRange}
                    unit="submissions"
                  />
                </ChartCard>

                <ChartCard title="By category" description="What people are reporting.">
                  <RankedBars
                    buckets={toBuckets(analytics.byCategory)}
                    total={inRange}
                    unit="submissions"
                    emptyMessage="No submissions in this range."
                  />
                </ChartCard>

                <ChartCard
                  title="By ward"
                  description="Where the reported problems are - not who reported them."
                >
                  <RankedBars
                    buckets={toBuckets(analytics.byWard)}
                    total={inRange}
                    unit="submissions"
                    emptyMessage="No ward was recorded on these submissions."
                  />
                </ChartCard>

                <ChartCard title="By source" description="Which channel brought people here.">
                  <RankedBars
                    buckets={toBuckets(analytics.bySource)}
                    total={inRange}
                    unit="submissions"
                  />
                </ChartCard>

                <ChartCard title="By type" description="Feedback, issues, suggestions, complaints.">
                  <ColumnChart buckets={toBuckets(analytics.byType)} />
                </ChartCard>

                <ChartCard title="By priority" description="Administrative triage only.">
                  <ColumnChart buckets={toBuckets(analytics.byPriority)} />
                </ChartCard>
              </div>

              <p className="analytics__note">
                These figures count <strong>submissions</strong> — things citizens chose to send.
                They describe the campaign&rsquo;s workload and the places problems were reported,
                and nothing else. No political preference, affiliation or support is recorded,
                scored or inferred anywhere in this platform, and a ward&rsquo;s submission count
                says nothing about how that ward intends to vote.
              </p>
            </div>
          );
        }}
      </QrBoundary>
    </div>
  );
}

/** The Phase 4 chart components speak `scans`; these are submissions. */
function toBuckets(rows: Array<{ key: string; label: string; count: number }>) {
  return rows.map((row) => ({ key: row.key, label: row.label, scans: row.count }));
}
