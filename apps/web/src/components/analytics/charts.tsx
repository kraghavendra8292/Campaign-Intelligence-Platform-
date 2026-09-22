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
const TREND_HEIGHT = 260;
const TREND_PADDING = { top: 16, right: 16, bottom: 28, left: 44 };

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

  const gradientId = `${titleId}-fill`;

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

        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="trend__gradient-start" />
            <stop offset="100%" className="trend__gradient-end" />
          </linearGradient>
        </defs>

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
              <text x={4} y={y + 4} className="trend__axis-label">
                {Math.round(max * fraction).toLocaleString()}
              </text>
            </g>
          );
        })}

        <path d={area} style={{ fill: `url(#${gradientId})` }} />
        <path d={line} className="trend__line" />

        {coordinates.map((c) => (
          <circle key={c.point.date} cx={c.x} cy={c.y} r={3} className="trend__dot">
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

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

/**
 * Tiny inline trend for KPI cards. Always starts at zero on the Y axis so a
 * flat jitter cannot look like a surge.
 */
export function Sparkline({
  values,
  label = 'Trend',
}: {
  values: readonly number[];
  label?: string;
}) {
  if (values.length < 2) return null;

  const width = 72;
  const height = 28;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
    >
      <polyline points={points} className="sparkline__line" fill="none" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Donut
// ---------------------------------------------------------------------------

const DONUT_PALETTE = [
  'var(--color-primary)',
  'var(--color-info)',
  'var(--color-accent)',
  'var(--color-brand)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-error)',
  'var(--color-text-muted)',
] as const;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

/**
 * Category mix as a donut with a centre total and a legend of exact counts.
 * Prefer this over pie charts when the mix (not ranking) is the question.
 */
export function DonutChart({
  buckets,
  unit = '',
  emptyMessage,
  centreLabel,
}: {
  buckets: readonly ChartBucket[];
  unit?: string;
  emptyMessage?: string;
  centreLabel?: string;
}) {
  const titleId = useId();

  if (buckets.length === 0)
    return <ChartEmpty {...(emptyMessage ? { message: emptyMessage } : {})} />;

  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  if (total === 0)
    return <ChartEmpty {...(emptyMessage ? { message: emptyMessage } : {})} />;

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 64;
  const stroke = 16;

  let cursor = 0;
  const arcs = buckets
    .filter((bucket) => bucket.value > 0)
    .map((bucket, index) => {
      const sweep = (bucket.value / total) * 360;
      const start = cursor;
      const end = cursor + Math.min(sweep, 359.99);
      cursor += sweep;
      return {
        ...bucket,
        start,
        end,
        share: (bucket.value / total) * 100,
        color: DONUT_PALETTE[index % DONUT_PALETTE.length]!,
      };
    });

  return (
    <div className="donut">
      <figure className="donut__figure">
        <svg
          className="donut__svg"
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>
            {`${total.toLocaleString()} ${unit}`.trim() +
              `. ` +
              arcs.map((arc) => `${arc.label} ${arc.value}`).join(', ')}
          </title>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            className="donut__track"
            fill="none"
            strokeWidth={stroke}
          />
          {arcs.length === 1 && arcs[0] ? (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              stroke={arcs[0].color}
            />
          ) : (
            arcs.map((arc) => (
              <path
                key={arc.key}
                d={arcPath(cx, cy, radius, arc.start, arc.end)}
                fill="none"
                stroke={arc.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
              >
                <title>{`${arc.label}: ${arc.value.toLocaleString()} (${arc.share.toFixed(0)}%)`}</title>
              </path>
            ))
          )}
          <text x={cx} y={cy - 4} textAnchor="middle" className="donut__value">
            {total.toLocaleString()}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="donut__caption">
            {centreLabel ?? unit}
          </text>
        </svg>
      </figure>
      <ul className="donut__legend">
        {arcs.map((arc) => (
          <li key={arc.key} className="donut__legend-row">
            <span className="donut__swatch" style={{ backgroundColor: arc.color }} aria-hidden="true" />
            <span className="donut__legend-label">{arc.label}</span>
            <span className="donut__legend-value">
              {arc.value.toLocaleString()}
              <span className="donut__legend-share">{arc.share.toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
