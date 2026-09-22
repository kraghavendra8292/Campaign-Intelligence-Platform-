import { Link } from 'react-router-dom';
import { Button } from '@rk/ui';
import { useAdminQuery } from '../../features/admin/adminApi';
import {
  SITE_FEEDBACK_OVERVIEW_QUERY,
  type SiteFeedbackOverviewData,
  type SiteFeedbackSummary,
} from '../../features/siteFeedback/siteFeedbackQueries';
import { DashboardWidget } from './DashboardParts';
import {
  CampaignPulseBars,
  OpinionCompareColumns,
  OpinionDonut,
  OpinionLegend,
  OPINION_TONES,
  SentimentGauge,
  sentimentScore,
} from './OpinionCharts';

function PulsePanel({
  title,
  badge,
  summary,
}: {
  title: string;
  badge?: string;
  summary: SiteFeedbackSummary;
}) {
  const score = sentimentScore(summary);

  return (
    <div className="opinion-pulse__panel">
      <div className="opinion-pulse__panel-head">
        <div>
          <h3 className="opinion-pulse__panel-title">{title}</h3>
          {score !== null ? (
            <p className="opinion-pulse__panel-sub">Sentiment {score}/100</p>
          ) : (
            <p className="opinion-pulse__panel-sub">Awaiting first responses</p>
          )}
        </div>
        {badge ? <span className="opinion-pulse__badge">{badge}</span> : null}
      </div>

      <div className="opinion-pulse__viz">
        <OpinionDonut summary={summary} label={title} />
        <div className="opinion-pulse__stat-list">
          {OPINION_TONES.map((tone) => (
            <div key={tone.key} className={`opinion-pulse__stat opinion-pulse__stat--${tone.key}`}>
              <span className="opinion-pulse__stat-label">{tone.label}</span>
              <span className="opinion-pulse__stat-value">
                {summary[tone.countKey].toLocaleString()}
              </span>
              <span className="opinion-pulse__stat-pct">{summary[tone.percentKey]}%</span>
              <span className="opinion-pulse__stat-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(summary[tone.percentKey], 100)}%` }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Homepage opinion pulse for the campaign dashboard.
 *
 * Own query, so missing ISSUE_ANALYTICS_READ only blanks this panel.
 */
export function OpinionPulseWidget() {
  const { state, refetch } = useAdminQuery<SiteFeedbackOverviewData>(SITE_FEEDBACK_OVERVIEW_QUERY);

  return (
    <DashboardWidget
      title="Homepage opinions"
      description="Great / Ok / Worst pulse from the public home page — mix, sentiment and campaign comparison."
      state={state}
      refetch={refetch}
      emptyMessage="No opinions submitted yet."
      isEmpty={(data) =>
        data.siteFeedbackDashboardOverview.current.total === 0 &&
        data.siteFeedbackDashboardOverview.overall.total === 0
      }
      action={
        <Link to="/admin/issues/opinions">
          <Button variant="ghost" size="sm">
            View details
          </Button>
        </Link>
      }
    >
      {(data) => {
        const overview = data.siteFeedbackDashboardOverview;
        const showOverall =
          overview.campaigns.length > 1 || overview.overall.total !== overview.current.total;

        return (
          <div className="opinion-pulse opinion-pulse--pro">
            <OpinionLegend />

            <div
              className={`opinion-pulse__grid${showOverall ? ' opinion-pulse__grid--split' : ''}`}
            >
              <PulsePanel title="This campaign" summary={overview.current} badge="Active" />
              {showOverall ? (
                <PulsePanel title="All campaigns" summary={overview.overall} badge="Overall" />
              ) : null}
            </div>

            <div className="opinion-pulse__charts">
              <section className="opinion-pulse__chart-card" aria-labelledby="opinion-gauge-title">
                <header>
                  <h4 id="opinion-gauge-title">Sentiment gauge</h4>
                  <p>Weighted score from this campaign’s mix.</p>
                </header>
                <SentimentGauge summary={overview.current} />
              </section>

              {showOverall ? (
                <section
                  className="opinion-pulse__chart-card"
                  aria-labelledby="opinion-compare-title"
                >
                  <header>
                    <h4 id="opinion-compare-title">Campaign vs overall</h4>
                    <p>Solid bars = this campaign · tinted = all campaigns.</p>
                  </header>
                  <OpinionCompareColumns current={overview.current} overall={overview.overall} />
                </section>
              ) : (
                <section
                  className="opinion-pulse__chart-card"
                  aria-labelledby="opinion-mix-title"
                >
                  <header>
                    <h4 id="opinion-mix-title">Reaction mix</h4>
                    <p>Share of Great, Ok and Worst for this campaign.</p>
                  </header>
                  <div className="opinion-pulse__mix-only">
                    <OpinionDonut summary={overview.current} label="This campaign" />
                  </div>
                </section>
              )}
            </div>

            {overview.campaigns.length > 0 ? (
              <section className="opinion-pulse__campaigns" aria-labelledby="opinion-rank-title">
                <header className="opinion-pulse__campaigns-head">
                  <h4 id="opinion-rank-title">Per campaign</h4>
                  <p>Stacked volume ranked by total responses.</p>
                </header>
                <CampaignPulseBars campaigns={overview.campaigns.slice(0, 6)} />
              </section>
            ) : null}
          </div>
        );
      }}
    </DashboardWidget>
  );
}
