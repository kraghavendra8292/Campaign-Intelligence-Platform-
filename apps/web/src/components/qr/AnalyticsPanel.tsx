import { Button } from '@rk/ui';
import type { QrAnalyticsData } from '../../features/qr/qrQueries';
import { ChartCard, ColumnChart, RankedBars, TrendChart } from './charts';
import { StatCard, StatGrid } from './QrShell';

/**
 * The analytics view, shared by the tenant-wide, per-campaign and per-code
 * screens.
 *
 * One component rather than three near-identical ones, because the questions
 * are the same at every scope - only the filter changes. Three copies would
 * drift, and the first thing to drift would be the careful wording below.
 *
 * WORDING IS LOad-BEARING HERE. Every figure says "scans", because that is what
 * was measured: an event, not a person. "1,248 scans" is true; "1,248 people"
 * would be a claim the data cannot support - one person scanning a poster twice
 * and two people scanning it once are indistinguishable, by design.
 */

export function AnalyticsPanel({
  data,
  showQrBreakdown = true,
  onExportCsv,
  exporting,
}: {
  data: QrAnalyticsData;
  showQrBreakdown?: boolean;
  onExportCsv?: () => void;
  exporting?: boolean;
}) {
  const humanScans = data.totalScans - data.automatedScans;

  return (
    <div className="analytics">
      <StatGrid>
        <StatCard
          label="Total scans"
          value={data.totalScans.toLocaleString()}
          hint={`${data.range.days} day${data.range.days === 1 ? '' : 's'}`}
          tone="primary"
        />
        <StatCard
          label="Estimated unique visits"
          // An em dash, not a zero. The estimate is unavailable when no scan in
          // the window carried a visit hash - reporting that as "0" would say
          // nobody came, which is a different and false statement.
          value={
            data.estimatedUniqueScans === null ? '—' : data.estimatedUniqueScans.toLocaleString()
          }
          hint={
            data.estimatedUniqueScans === null
              ? 'Not available for this period'
              : 'Approximate, same-day only'
          }
        />
        <StatCard
          label="Average per day"
          value={data.averageScansPerDay.toLocaleString()}
          hint="Across the selected range"
        />
        <StatCard
          label="Active QR codes"
          value={data.activeQrCodes.toLocaleString()}
          hint={`${data.totalQrCodes.toLocaleString()} in total`}
          tone="accent"
        />
      </StatGrid>

      <StatGrid>
        <StatCard label="Scans today" value={data.scansToday.toLocaleString()} />
        <StatCard label="Last 7 days" value={data.scansLast7Days.toLocaleString()} />
        <StatCard label="Last 30 days" value={data.scansLast30Days.toLocaleString()} />
        <StatCard
          label="Excluding automated"
          value={humanScans.toLocaleString()}
          hint={`${data.automatedScans.toLocaleString()} identified as crawlers or scripts`}
        />
      </StatGrid>

      <ChartCard
        title="Scan trend"
        description="Scans per day across the selected range."
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

      <div className="chart-grid">
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

        <ChartCard
          title="Scans by device"
          description="Coarse device class only. No device is identified."
        >
          <RankedBars buckets={data.byDevice} total={data.totalScans} />
        </ChartCard>

        <ChartCard title="Scans by day of week" description="Aggregate weekly pattern.">
          <ColumnChart buckets={data.byDayOfWeek} />
        </ChartCard>

        <ChartCard title="Scans by time of day" description="UTC, in six-hour buckets.">
          <ColumnChart buckets={data.byHourBucket} />
        </ChartCard>
      </div>

      <p className="analytics__note">
        All figures count <strong>scan events</strong>, not people. A single person scanning a
        poster twice is two scans. Nothing here identifies an individual, and no political
        preference, affiliation or supporter status is recorded or inferred anywhere in this
        platform.
      </p>
    </div>
  );
}
