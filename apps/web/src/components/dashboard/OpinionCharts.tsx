import { useId } from 'react';
import type { SiteFeedbackCampaignPulse, SiteFeedbackSummary } from '../../features/siteFeedback/siteFeedbackQueries';

/**
 * Opinion visuals for the homepage-feedback pulse.
 *
 * Hand-drawn SVG (same rationale as analytics/charts.tsx): tiny bundle, text
 * alongside geometry for a11y, and design-token colours so the panel matches
 * the rest of the console.
 */

export type OpinionTone = 'great' | 'ok' | 'worst';

export const OPINION_TONES: Array<{
  key: OpinionTone;
  label: string;
  countKey: 'greatCount' | 'okCount' | 'worstCount';
  percentKey: 'greatPercent' | 'okPercent' | 'worstPercent';
}> = [
  { key: 'great', label: 'Great', countKey: 'greatCount', percentKey: 'greatPercent' },
  { key: 'ok', label: 'Ok', countKey: 'okCount', percentKey: 'okPercent' },
  { key: 'worst', label: 'Worst', countKey: 'worstCount', percentKey: 'worstPercent' },
];

/** Weighted 0–100 score: Great=100, Ok=50, Worst=0. */
export function sentimentScore(summary: SiteFeedbackSummary): number | null {
  if (summary.total <= 0) return null;
  const weighted = summary.greatCount * 100 + summary.okCount * 50;
  return Math.round(weighted / summary.total);
}

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
 * Donut mix of Great / Ok / Worst with the total in the centre.
 */
export function OpinionDonut({
  summary,
  label,
}: {
  summary: SiteFeedbackSummary;
  label: string;
}) {
  const titleId = useId();
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 68;
  const stroke = 18;

  const slices = OPINION_TONES.map((tone) => ({
    ...tone,
    count: summary[tone.countKey],
    percent: summary[tone.percentKey],
  })).filter((slice) => slice.count > 0);

  let cursor = 0;
  const arcs =
    summary.total === 0
      ? []
      : slices.map((slice) => {
          const sweep = (slice.count / summary.total) * 360;
          // Full circle needs a tiny gap avoided — use 359.99 for single slice.
          const start = cursor;
          const end = cursor + Math.min(sweep, 359.99);
          cursor += sweep;
          return { ...slice, start, end };
        });

  return (
    <figure className="opinion-donut">
      <svg
        className="opinion-donut__svg"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          {`${label}: ${summary.total} responses. Great ${summary.greatCount}, Ok ${summary.okCount}, Worst ${summary.worstCount}.`}
        </title>
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          className="opinion-donut__track"
          fill="none"
          strokeWidth={stroke}
        />
        {arcs.length === 0 ? null : arcs.length === 1 && arcs[0] ? (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            className={`opinion-donut__slice opinion-donut__slice--${arcs[0].key}`}
            fill="none"
            strokeWidth={stroke}
          />
        ) : (
          arcs.map((arc) => (
            <path
              key={arc.key}
              d={arcPath(cx, cy, radius, arc.start, arc.end)}
              className={`opinion-donut__slice opinion-donut__slice--${arc.key}`}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="butt"
            >
              <title>{`${arc.label}: ${arc.count} (${arc.percent}%)`}</title>
            </path>
          ))
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" className="opinion-donut__value">
          {summary.total.toLocaleString()}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="opinion-donut__caption">
          responses
        </text>
      </svg>
      <figcaption className="visually-hidden">{label}</figcaption>
    </figure>
  );
}

/**
 * Semi-circle sentiment gauge (0–100) derived from the reaction mix.
 */
export function SentimentGauge({ summary }: { summary: SiteFeedbackSummary }) {
  const titleId = useId();
  const score = sentimentScore(summary);
  const width = 220;
  const height = 130;
  const cx = width / 2;
  const cy = 108;
  const radius = 86;
  const stroke = 14;
  const clamped = score ?? 0;
  const end = -90 + (clamped / 100) * 180;

  const toneClass =
    score === null
      ? 'is-empty'
      : score >= 67
        ? 'is-great'
        : score >= 40
          ? 'is-ok'
          : 'is-worst';

  return (
    <figure className={`opinion-gauge ${toneClass}`}>
      <svg
        className="opinion-gauge__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          {score === null
            ? 'Sentiment score unavailable — no responses yet.'
            : `Sentiment score ${score} out of 100.`}
        </title>
        <path
          d={arcPath(cx, cy, radius, -90, 90)}
          className="opinion-gauge__track"
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {score !== null ? (
          <path
            d={arcPath(cx, cy, radius, -90, end)}
            className="opinion-gauge__fill"
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        ) : null}
        <text x={cx} y={cy - 18} textAnchor="middle" className="opinion-gauge__value">
          {score === null ? '—' : score}
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle" className="opinion-gauge__label">
          Sentiment
        </text>
      </svg>
      <p className="opinion-gauge__hint">Great = 100 · Ok = 50 · Worst = 0</p>
    </figure>
  );
}

/**
 * Grouped columns: this campaign vs overall for each reaction.
 */
export function OpinionCompareColumns({
  current,
  overall,
}: {
  current: SiteFeedbackSummary;
  overall: SiteFeedbackSummary;
}) {
  const titleId = useId();
  const width = 360;
  const height = 168;
  const pad = { top: 16, right: 12, bottom: 28, left: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(
    current.greatCount,
    current.okCount,
    current.worstCount,
    overall.greatCount,
    overall.okCount,
    overall.worstCount,
    1,
  );

  const groupW = innerW / 3;
  const barW = groupW * 0.32;

  return (
    <figure className="opinion-compare">
      <svg
        className="opinion-compare__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          Reaction counts for this campaign versus all campaigns.
        </title>
        {[0, 0.5, 1].map((fraction) => {
          const y = pad.top + innerH - fraction * innerH;
          return (
            <g key={fraction}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                className="opinion-compare__grid"
              />
              <text x={4} y={y + 3} className="opinion-compare__axis">
                {Math.round(max * fraction)}
              </text>
            </g>
          );
        })}
        {OPINION_TONES.map((tone, index) => {
          const groupX = pad.left + index * groupW;
          const currentH = (current[tone.countKey] / max) * innerH;
          const overallH = (overall[tone.countKey] / max) * innerH;
          return (
            <g key={tone.key}>
              <rect
                className={`opinion-compare__bar opinion-compare__bar--${tone.key}`}
                x={groupX + groupW * 0.18}
                y={pad.top + innerH - currentH}
                width={barW}
                height={Math.max(currentH, current[tone.countKey] > 0 ? 2 : 0)}
                rx={3}
              >
                <title>{`This campaign · ${tone.label}: ${current[tone.countKey]}`}</title>
              </rect>
              <rect
                className={`opinion-compare__bar opinion-compare__bar--${tone.key} is-muted`}
                x={groupX + groupW * 0.18 + barW + 4}
                y={pad.top + innerH - overallH}
                width={barW}
                height={Math.max(overallH, overall[tone.countKey] > 0 ? 2 : 0)}
                rx={3}
              >
                <title>{`All campaigns · ${tone.label}: ${overall[tone.countKey]}`}</title>
              </rect>
              <text
                x={groupX + groupW / 2}
                y={height - 8}
                textAnchor="middle"
                className="opinion-compare__axis"
              >
                {tone.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="opinion-compare__legend">
        <li>
          <span className="opinion-compare__swatch is-solid" aria-hidden="true" />
          This campaign
        </li>
        <li>
          <span className="opinion-compare__swatch is-muted" aria-hidden="true" />
          All campaigns
        </li>
      </ul>
    </figure>
  );
}

/**
 * Horizontal stacked bars ranking campaigns by response volume.
 */
export function CampaignPulseBars({
  campaigns,
}: {
  campaigns: readonly SiteFeedbackCampaignPulse[];
}) {
  if (campaigns.length === 0) {
    return <p className="chart-empty">No campaign breakdown yet.</p>;
  }

  const max = Math.max(...campaigns.map((c) => c.total), 1);

  return (
    <ul className="opinion-rank">
      {campaigns.map((campaign) => {
        const widthPct = (campaign.total / max) * 100;
        return (
          <li
            key={campaign.organizationId}
            className={`opinion-rank__row${campaign.isActive ? ' is-active' : ''}`}
          >
            <div className="opinion-rank__meta">
              <span className="opinion-rank__name">{campaign.organizationName}</span>
              <span className="opinion-rank__total">{campaign.total.toLocaleString()}</span>
            </div>
            <div className="opinion-rank__track" aria-hidden="true">
              <div className="opinion-rank__stack" style={{ width: `${widthPct}%` }}>
                {campaign.total > 0 ? (
                  <>
                    <span
                      className="opinion-rank__seg opinion-rank__seg--great"
                      style={{ flexGrow: Math.max(campaign.greatCount, 0) }}
                    />
                    <span
                      className="opinion-rank__seg opinion-rank__seg--ok"
                      style={{ flexGrow: Math.max(campaign.okCount, 0) }}
                    />
                    <span
                      className="opinion-rank__seg opinion-rank__seg--worst"
                      style={{ flexGrow: Math.max(campaign.worstCount, 0) }}
                    />
                  </>
                ) : null}
              </div>
            </div>
            <p className="opinion-rank__legend">
              Great {campaign.greatCount} · Ok {campaign.okCount} · Worst {campaign.worstCount}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function OpinionLegend() {
  return (
    <ul className="opinion-legend">
      {OPINION_TONES.map((tone) => (
        <li key={tone.key} className={`opinion-legend__item opinion-legend__item--${tone.key}`}>
          <span className="opinion-legend__dot" aria-hidden="true" />
          {tone.label}
        </li>
      ))}
    </ul>
  );
}
