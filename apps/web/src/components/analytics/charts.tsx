import { useId, type ReactNode } from 'react';

/**
 * Shared analytics visuals.
 *
 * MOVED HERE IN PHASE 7, FROM `components/qr/charts.tsx`, because a second
 * dashboard needed the same three shapes. The originals were typed to the QR
 * module's `ScanBucket` and defaulted their empty state to "No scan data" -
 * neither of which is wrong for QR and both of which are wrong for everything
 * else. The primitives are now keyed on a neutral `{ key, label, value }` and
 * `components/qr/charts.tsx` is a thin adapter over them, so every Phase 4 call
 * site is unchanged.
 *
 * The original three reasons for hand-drawn SVG over a charting library still
 * hold and are worth restating, because "just add Recharts" will be proposed:
 *
 *  1. These are simple shapes - a line, a bar list, a column chart. A
 *     general-purpose library would add ~150KB to the bundle to draw them.
 *  2. Every value is rendered as TEXT as well as geometry, so the numbers are
 *     readable by a screen reader and survive a chart that fails to paint.
 *     Most libraries render canvas or unlabelled paths.
 *  3. Colour comes from the existing design tokens, so these match the console
 *     instead of bringing their own palette.
 *
 * Every chart degrades to an explicit empty state. A blank chart area is
 * indistinguishable from one that failed to load.
 */

/** The neutral shape every chart here consumes. */
export interface ChartBucket {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

export function ChartCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="chart-card">
      <header className="chart-card__header">
        <div>
          <h3 className="chart-card__title">{title}</h3>
          {description ? <p className="chart-card__description">{description}</p> : null}
        </div>
        {action}
      </header>
      <div className="chart-card__body">{children}</div>
    </section>
  );
}

export function ChartEmpty({ message = 'No data available yet.' }: { message?: string }) {
  return <p className="chart-empty">{message}</p>;
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

const TREND_WIDTH = 720;
const TREND_HEIGHT = 220;
const TREND_PADDING = { top: 12, right: 12, bottom: 26, left: 40 };

export interface TrendPoint {
  readonly date: string;
  readonly value: number;
}

/**
 * A trend line over time.
 *
 * Uses a `viewBox` with no fixed width so it scales to its container - the
 * reason it works at phone width without a resize observer.
 *
 * THE Y-AXIS ALWAYS STARTS AT ZERO. Starting it at the minimum would make a
 * jitter of three submissions look like a surge, which for a dashboard used to
 * decide where to send people is actively misleading.
 */
export function TrendChart({
  points,
  unit = 'submissions',
  emptyMessage,
}: {
  points: readonly TrendPoint[];
  unit?: string;
  emptyMessage?: string;
}) {
  const titleId = useId();

  if (points.length === 0)
    return <ChartEmpty {...(emptyMessage ? { message: emptyMessage } : {})} />;

  const max = Math.max(...points.map((point) => point.value), 1);
  const innerWidth = TREND_WIDTH - TREND_PADDING.left - TREND_PADDING.right;
  const innerHeight = TREND_HEIGHT - TREND_PADDING.top - TREND_PADDING.bottom;

  // A single point has no span to divide by; place it at the left edge.
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coordinates = points.map((point, index) => ({
    x: TREND_PADDING.left + index * stepX,
    y: TREND_PADDING.top + innerHeight - (point.value / max) * innerHeight,
    point,
  }));

  const line = coordinates
    .map((c, index) => `${index === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  const area =
    `${line} L${(coordinates.at(-1)?.x ?? TREND_PADDING.left).toFixed(1)},` +
    `${TREND_PADDING.top + innerHeight} L${TREND_PADDING.left},${TREND_PADDING.top + innerHeight} Z`;

  const total = points.reduce((sum, point) => sum + point.value, 0);
  const first = points[0];
  const last = points.at(-1);

  return (
    <figure className="trend">
      <svg
        className="trend__svg"
        viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
      >
        <title id={titleId}>
          {`${unit} from ${first?.date.slice(0, 10) ?? ''} to ${last?.date.slice(0, 10) ?? ''}.` +
            ` ${total} in total, peaking at ${max}.`}
        </title>

        {/* Gridlines at 0, half and full scale: enough to read a value from, */}
        {/* few enough not to compete with the data. */}
        {[0, 0.5, 1].map((fraction) => {
          const y = TREND_PADDING.top + innerHeight - fraction * innerHeight;
          return (
            <g key={fraction}>
              <line
                x1={TREND_PADDING.left}
                x2={TREND_WIDTH - TREND_PADDING.right}
                y1={y}
                y2={y}
                className="trend__grid"
              />
              <text x={0} y={y + 4} className="trend__axis-label">
                {Math.round(max * fraction)}
              </text>
            </g>
          );
        })}

        <path d={area} className="trend__area" />
        <path d={line} className="trend__line" />

        {coordinates.map((c) => (
          <circle key={c.point.date} cx={c.x} cy={c.y} r={2.5} className="trend__dot">
            <title>{`${c.point.date.slice(0, 10)}: ${c.point.value} ${unit}`}</title>
          </circle>
        ))}

        {first ? (
          <text x={TREND_PADDING.left} y={TREND_HEIGHT - 6} className="trend__axis-label">
            {first.date.slice(5, 10)}
          </text>
        ) : null}
        {last && points.length > 1 ? (
          <text
            x={TREND_WIDTH - TREND_PADDING.right}
            y={TREND_HEIGHT - 6}
            textAnchor="end"
            className="trend__axis-label"
          >
            {last.date.slice(5, 10)}
          </text>
        ) : null}
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Ranked bars
// ---------------------------------------------------------------------------

/**
 * A ranked horizontal bar list.
 *
 * Preferred over a pie chart for category, source and area breakdowns:
 * comparing arc lengths is measurably harder than comparing bar lengths, and
 * this shape has room for the label and the exact number next to each row.
 *
 * Percentages are computed against the TOTAL OF ALL BUCKETS, not the visible
 * top ten, so "38%" means 38% of submissions rather than 38% of what fitted.
 */
export function RankedBars({
  buckets,
  total,
  emptyMessage,
  unit = '',
}: {
  buckets: readonly ChartBucket[];
  total?: number;
  emptyMessage?: string;
  unit?: string;
}) {
  if (buckets.length === 0)
    return <ChartEmpty {...(emptyMessage ? { message: emptyMessage } : {})} />;

  const denominator = total ?? buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);

  return (
    <ul className="ranked-bars">
      {buckets.map((bucket) => {
        const share = denominator > 0 ? (bucket.value / denominator) * 100 : 0;
        return (
          <li key={bucket.key} className="ranked-bars__row">
            <span className="ranked-bars__label" title={bucket.label}>
              {bucket.label}
            </span>
            <span className="ranked-bars__track">
              <span
                className="ranked-bars__fill"
                style={{ width: `${(bucket.value / max) * 100}%` }}
                aria-hidden="true"
              />
            </span>
            <span className="ranked-bars__value">
              {bucket.value.toLocaleString()} {unit}
              <span className="ranked-bars__share">{share.toFixed(0)}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/**
 * Vertical columns, for ORDERED categories such as status lifecycle or a timing
 * distribution.
 *
 * Kept in the caller's order rather than ranked: "under a day … over 30 days"
 * is the information, and sorting it by size would destroy the shape the chart
 * exists to show.
 */
export function ColumnChart({
  buckets,
  emptyMessage,
}: {
  buckets: readonly ChartBucket[];
  emptyMessage?: string;
}) {
  if (buckets.length === 0)
    return <ChartEmpty {...(emptyMessage ? { message: emptyMessage } : {})} />;

  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);

  return (
    <ul className="columns">
      {buckets.map((bucket) => (
        <li key={bucket.key} className="columns__item">
          <span className="columns__value">{bucket.value.toLocaleString()}</span>
          <span className="columns__track">
            <span
              className="columns__fill"
              style={{ height: `${Math.max(2, (bucket.value / max) * 100)}%` }}
              aria-hidden="true"
            />
          </span>
          <span className="columns__label">{bucket.label}</span>
        </li>
      ))}
    </ul>
  );
}
