import { Link } from 'react-router-dom';
import { Button } from '@rk/ui';
import type { QrAnalyticsData } from '../../features/qr/qrQueries';
import { DonutChart as SharedDonutChart, RankedBars as SharedRankedBars } from '../analytics/charts';
import { ChartCard, ColumnChart, RankedBars, ScanSparkline, TrendChart } from './charts';
import { StatCard, StatGrid } from './QrShell';
import { formatDate } from '../../lib/format';

/**
 * The analytics view, shared by the tenant-wide, per-campaign and per-code
 * screens.
 *
 * One component rather than three near-identical ones, because the questions
 * are the same at every scope - only the filter changes. Three copies would
 * drift, and the first thing to drift would be the careful wording below.
 *
 * WORDING IS LOAD-BEARING HERE. Every figure says "scans", because that is what
 * was measured: an event, not a person. "1,248 scans" is true; "1,248 people"
 * would be a claim the data cannot support - one person scanning a poster twice
 * and two people scanning it once are indistinguishable, by design.
 *
 * Layout: four hero KPIs on top; secondary figures live behind the "More
 * metrics" filter on the parent screen and surface here as a single focus card.
 */

/** Secondary figures selectable from the filter bar (not shown as hero cards). */
export type AnalyticsFocusMetric =
  | 'uniqueVisits'
  | 'avgPerDay'
  | 'activeQrCodes'
  | 'excludingAutomated'
  | 'scansToday'
  | 'last7Days'
  | 'last30Days'
  | 'openAllFeedbacks';

export const ANALYTICS_FOCUS_OPTIONS: ReadonlyArray<{
  value: AnalyticsFocusMetric;
  label: string;
}> = [
  { value: 'uniqueVisits', label: 'Estimated unique visits' },
  { value: 'avgPerDay', label: 'Average per day' },
  { value: 'activeQrCodes', label: 'Active QR codes' },
  { value: 'excludingAutomated', label: 'Excluding automated' },
  { value: 'scansToday', label: 'Scans today' },
  { value: 'last7Days', label: 'Last 7 days' },
  { value: 'last30Days', label: 'Last 30 days' },
  { value: 'openAllFeedbacks', label: 'Open / all feedbacks' },
];

function focusMetricView(
  key: AnalyticsFocusMetric,
  data: QrAnalyticsData,
): { label: string; value: string; hint: string } {
  const humanScans = data.totalScans - data.automatedScans;

  switch (key) {
    case 'uniqueVisits':
      return {
        label: 'Estimated unique visits',
        value:
          data.estimatedUniqueScans === null ? '—' : data.estimatedUniqueScans.toLocaleString(),
        hint:
          data.estimatedUniqueScans === null
            ? 'Not available for this period'
            : 'Approximate, same-day only',
      };
    case 'avgPerDay':
      return {
        label: 'Average per day',
        value: data.averageScansPerDay.toLocaleString(),
        hint: 'Across the selected range',
      };
    case 'activeQrCodes':
      return {
        label: 'Active QR codes',
        value: data.activeQrCodes.toLocaleString(),
        hint: `${data.totalQrCodes.toLocaleString()} in total`,
      };
    case 'excludingAutomated':
      return {
        label: 'Excluding automated',
        value: humanScans.toLocaleString(),
        hint: `${data.automatedScans.toLocaleString()} identified as crawlers or scripts`,
      };
    case 'scansToday':
      return {
        label: 'Scans today',
        value: data.scansToday.toLocaleString(),
        hint: 'Calendar day in organisation timezone',
      };
    case 'last7Days':
      return {
        label: 'Last 7 days',
        value: data.scansLast7Days.toLocaleString(),
        hint: 'Rolling window, independent of the date filter',
      };
    case 'last30Days':
      return {
        label: 'Last 30 days',
        value: data.scansLast30Days.toLocaleString(),
        hint: 'Rolling window, independent of the date filter',
      };
    case 'openAllFeedbacks':
      return {
        label: 'Open issues / opinions',
        value: `${data.openIssues.toLocaleString()} / ${data.siteFeedbacksFromQr.toLocaleString()}`,
        hint: 'Open citizen issues versus homepage opinions in this scope',
      };
  }
}

export function AnalyticsPanel({
  data,
  showQrBreakdown = true,
  onExportCsv,
  exporting,
  feedbacksHref,
  focusMetric = 'uniqueVisits',
}: {
  data: QrAnalyticsData;
  showQrBreakdown?: boolean;
  onExportCsv?: () => void;
  exporting?: boolean;
  /** When set, links to the filtered issues inbox for this scope. */
  feedbacksHref?: string | null;
  focusMetric?: AnalyticsFocusMetric;
}) {
  const focus = focusMetricView(focusMetric, data);
  const sparkValues = data.trend.map((point) => point.scans);
  const peakScans = sparkValues.length > 0 ? Math.max(...sparkValues) : 0;

  return (
    <div className="analytics">
      <StatGrid>
        <StatCard
          label="Total scans"
          value={data.totalScans.toLocaleString()}
          hint={`${data.range.days} day${data.range.days === 1 ? '' : 's'} · peak ${peakScans.toLocaleString()}/day`}
          tone="primary"
          sparkline={sparkValues.length > 1 ? <ScanSparkline values={sparkValues} /> : undefined}
        />
        <StatCard
          label="Feedbacks"
          value={data.siteFeedbacksFromQr.toLocaleString()}
          hint="Homepage opinions from this QR scope"
          tone="info"
        />
        <StatCard
          label="Issues"
          value={data.issuesFromQr.toLocaleString()}
          hint={`${data.openIssues.toLocaleString()} open`}
        />
        <StatCard
          label="Conversion"
          value={
            data.siteFeedbackConversionRatePct === null
              ? '—'
              : `${data.siteFeedbackConversionRatePct}%`
          }
          hint={
            data.siteFeedbackConversionRatePct === null
              ? 'No scans in this period'
              : 'Opinions submitted per scan'
          }
          tone="accent"
        />
      </StatGrid>

      <section className="analytics-focus" aria-label="Selected metric">
        <div className="analytics-focus__card">
          <p className="analytics-focus__eyebrow">From filter</p>
          <p className="stat-card__label">{focus.label}</p>
          <p className="analytics-focus__value">{focus.value}</p>
          <p className="stat-card__hint">{focus.hint}</p>
        </div>
      </section>

      <div className="chart-grid chart-grid--hero">
        <ChartCard
          title="Scan trend"
          description="Daily scan volume across the selected range."
          action={
            onExportCsv ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onExportCsv}
                isLoading={exporting ?? false}
              >
                Export CSV
              </Button>
            ) : undefined
          }
        >
          <TrendChart points={data.trend} />
        </ChartCard>

        <ChartCard
          title="Opinion mix"
          description="Great / Ok / Worst from this QR scope."
          action={
            <Link to="/admin/issues/opinions">
              <Button variant="secondary" size="sm">
                View all opinions
              </Button>
            </Link>
          }
        >
          <SharedDonutChart
            buckets={data.siteFeedbackByReaction
              .filter((bucket) => bucket.count > 0)
              .map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                value: bucket.count,
              }))}
            emptyMessage="No opinions attributed to this scope yet."
            unit="opinions"
            centreLabel="opinions"
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Recent feedbacks"
        description="What citizens said after scanning a code in this scope."
      >
        {data.recentSiteFeedbacks.length === 0 ? (
          <p className="chart-empty">No opinions attributed to this scope yet.</p>
        ) : (
          <ul className="analytics-feedback-list">
            {data.recentSiteFeedbacks.map((entry) => (
              <li key={entry.id} className="analytics-feedback-list__row">
                <span className={`analytics-feedback-list__reaction reaction--${entry.reaction.toLowerCase()}`}>
                  {entry.reaction === 'GREAT'
                    ? 'Great'
                    : entry.reaction === 'OK'
                      ? 'Ok'
                      : entry.reaction === 'WORST'
                        ? 'Worst'
                        : entry.reaction}
                </span>
                <span className="analytics-feedback-list__body">
                  {entry.comment?.trim() ? entry.comment : 'No comment'}
                </span>
                <time className="analytics-feedback-list__time" dateTime={entry.submittedAt}>
                  {formatDate(entry.submittedAt) ?? '—'}
                </time>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      <div className="chart-grid">
        <ChartCard
          title="Issues by status"
          description="Citizen issue submissions attributed via QR."
          action={
            feedbacksHref ? (
              <Link to={feedbacksHref}>
                <Button variant="secondary" size="sm">
                  View all issues
                </Button>
              </Link>
            ) : undefined
          }
        >
          <SharedRankedBars
            buckets={data.issuesByStatus.map((bucket) => ({
              key: bucket.key,
              label: bucket.label,
              value: bucket.count,
            }))}
            total={data.issuesFromQr}
            emptyMessage="No issues attributed to this scope yet."
            unit="issues"
          />
        </ChartCard>

        <ChartCard
          title="Issues by priority"
          description="Administrative triage on attributed issues."
        >
          <SharedRankedBars
            buckets={data.issuesByPriority.map((bucket) => ({
              key: bucket.key,
              label: bucket.label,
              value: bucket.count,
            }))}
            total={data.issuesFromQr}
            emptyMessage="No issues attributed to this scope yet."
            unit="issues"
          />
        </ChartCard>

        <ChartCard title="Scans by day of week" description="Aggregate weekly pattern.">
          <ColumnChart buckets={data.byDayOfWeek} />
        </ChartCard>

        <ChartCard title="Scans by time of day" description="UTC, in six-hour buckets.">
          <ColumnChart buckets={data.byHourBucket} />
        </ChartCard>

        {showQrBreakdown ? (
          <ChartCard title="Scans by QR code" description="Which codes are being scanned.">
            <RankedBars
              buckets={data.byQrCode}
              total={data.totalScans}
              emptyMessage="No QR codes have been scanned yet."
            />
          </ChartCard>
        ) : null}

        <ChartCard title="Scans by source" description="Poster, pamphlet, event and so on.">
          <RankedBars buckets={data.bySource} total={data.totalScans} />
        </ChartCard>

        <ChartCard
          title="Scans by device"
          description="Coarse device class only. No device is identified."
        >
          <SharedDonutChart
            buckets={data.byDevice.map((bucket) => ({
              key: bucket.key,
              label: bucket.label,
              value: bucket.scans,
            }))}
            emptyMessage="No scan data available yet."
            unit="scans"
            centreLabel="scans"
          />
        </ChartCard>

        <ChartCard
          title="Scans by ward"
          description="Where the scanned codes are placed - not where anyone was."
        >
          <RankedBars
            buckets={data.byWard}
            total={data.totalScans}
            emptyMessage="No ward has been recorded on these QR codes."
          />
        </ChartCard>

        <ChartCard title="Scans by area" description="Aggregate placement area.">
          <RankedBars
            buckets={data.byArea}
            total={data.totalScans}
            emptyMessage="No area has been recorded on these QR codes."
          />
        </ChartCard>
      </div>

      <p className="analytics__note">
        All figures count <strong>scan events</strong>, not people. A single person scanning a
        poster twice is two scans. Feedbacks are citizen issues attributed via QR. Nothing here
        identifies an individual, and no political preference, affiliation or supporter status is
        recorded or inferred anywhere in this platform.
      </p>
    </div>
  );
}
