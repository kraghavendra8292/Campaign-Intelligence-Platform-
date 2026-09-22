import type { ScanBucket } from '../../features/qr/qrQueries';
import {
  ChartEmpty as SharedChartEmpty,
  ColumnChart as SharedColumnChart,
  DonutChart as SharedDonutChart,
  RankedBars as SharedRankedBars,
  Sparkline as SharedSparkline,
  TrendChart as SharedTrendChart,
} from '../analytics/charts';

/**
 * QR analytics visuals.
 *
 * ADAPTER ONLY SINCE PHASE 7. The SVG lives in `components/analytics/charts.tsx`
 * because a second dashboard needed the same three shapes; this module keeps
 * the exact public API Phase 4 was written against, so no QR call site changed
 * when the primitives moved.
 *
 * The two things it adds back are the QR-specific vocabulary: buckets carry a
 * `scans` field rather than a neutral `value`, and the empty state says "no
 * scan data" rather than "no data". Both would be wrong for an issue chart,
 * which is why the shared component is neutral and the naming lives here.
 *
 * A future phase that finds itself writing `<TrendChart>` for something that is
 * not scans should import from `components/analytics/charts` directly rather
 * than widening this file.
 */

export { ChartCard, Sparkline } from '../analytics/charts';
export type { ChartBucket, TrendPoint } from '../analytics/charts';

export function ChartEmpty({ message = 'No scan data available yet.' }: { message?: string }) {
  return <SharedChartEmpty message={message} />;
}

export function TrendChart({ points }: { points: Array<{ date: string; scans: number }> }) {
  return (
    <SharedTrendChart
      points={points.map((point) => ({ date: point.date, value: point.scans }))}
      unit="scans"
      emptyMessage="No scan data available yet."
    />
  );
}

export function RankedBars({
  buckets,
  total,
  emptyMessage,
  unit = 'scans',
}: {
  buckets: ScanBucket[];
  total?: number;
  emptyMessage?: string;
  unit?: string;
}) {
  return (
    <SharedRankedBars
      buckets={buckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        value: bucket.scans,
      }))}
      {...(total === undefined ? {} : { total })}
      emptyMessage={emptyMessage ?? 'No scan data available yet.'}
      unit={unit}
    />
  );
}

export function ColumnChart({ buckets }: { buckets: ScanBucket[] }) {
  return (
    <SharedColumnChart
      buckets={buckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        value: bucket.scans,
      }))}
      emptyMessage="No scan data available yet."
    />
  );
}

export function DonutChart({
  buckets,
  total,
  emptyMessage,
  unit = 'scans',
  centreLabel,
}: {
  buckets: ScanBucket[];
  total?: number;
  emptyMessage?: string;
  unit?: string;
  centreLabel?: string;
}) {
  const mapped = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    value: bucket.scans,
  }));

  // When a total is supplied that exceeds the visible buckets (e.g. top-N),
  // pad with an "Other" slice so the donut still reads as a full mix.
  if (total !== undefined && total > mapped.reduce((sum, b) => sum + b.value, 0)) {
    const visible = mapped.reduce((sum, b) => sum + b.value, 0);
    mapped.push({ key: '__other', label: 'Other', value: total - visible });
  }

  return (
    <SharedDonutChart
      buckets={mapped}
      unit={unit}
      emptyMessage={emptyMessage ?? 'No scan data available yet.'}
      {...(centreLabel === undefined ? {} : { centreLabel })}
    />
  );
}

export function ScanSparkline({ values }: { values: readonly number[] }) {
  return <SharedSparkline values={values} label="Scan trend" />;
}
