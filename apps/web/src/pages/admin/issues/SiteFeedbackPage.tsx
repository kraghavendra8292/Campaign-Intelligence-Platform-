import { useMemo, useState } from 'react';
import { Button } from '@rk/ui';
import type { SiteFeedbackReaction } from '@rk/types';
import { useAdminQuery } from '../../../features/admin/adminApi';
import { CmsPageHeader } from '../../../components/cms/CmsShell';
import { QrBoundary } from '../../../components/qr/QrShell';
import {
  CampaignPulseBars,
  OpinionCompareColumns,
  OpinionDonut,
  OpinionLegend,
  SentimentGauge,
} from '../../../components/dashboard/OpinionCharts';
import {
  SITE_FEEDBACK_DASHBOARD_QUERY,
  type SiteFeedbackCampaignPulse,
  type SiteFeedbackSummary,
} from '../../../features/siteFeedback/siteFeedbackQueries';

type DashboardData = {
  siteFeedbackDashboardOverview: {
    current: SiteFeedbackSummary;
    overall: SiteFeedbackSummary;
    campaigns: SiteFeedbackCampaignPulse[];
  };
  siteFeedbackList: {
    nodes: Array<{
      id: string;
      reaction: SiteFeedbackReaction;
      comment: string | null;
      submittedAt: string;
      submittedBy: { id: string; fullName: string; email: string } | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

const FILTERS: Array<{ value: SiteFeedbackReaction | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'GREAT', label: 'Great' },
  { value: 'OK', label: 'Ok' },
  { value: 'WORST', label: 'Worst' },
];

function reactionLabel(reaction: SiteFeedbackReaction): string {
  if (reaction === 'GREAT') return 'Great';
  if (reaction === 'OK') return 'Ok';
  return 'Worst';
}

function HeroStat({
  label,
  count,
  percent,
  tone,
}: {
  label: string;
  count: number;
  percent: number;
  tone: 'great' | 'ok' | 'worst' | 'total';
}) {
  return (
    <article className={`opinion-hero-stat opinion-hero-stat--${tone}`}>
      <p className="opinion-hero-stat__label">{label}</p>
      <p className="opinion-hero-stat__value">{count.toLocaleString()}</p>
      {tone !== 'total' ? <p className="opinion-hero-stat__pct">{percent}% of responses</p> : null}
    </article>
  );
}

function CampaignCard({ campaign }: { campaign: SiteFeedbackCampaignPulse }) {
  return (
    <article className={`opinion-campaign-card${campaign.isActive ? ' is-active' : ''}`}>
      <header className="opinion-campaign-card__head">
        <div>
          <h3 className="opinion-campaign-card__title">{campaign.organizationName}</h3>
          <p className="opinion-campaign-card__slug">/{campaign.organizationSlug}</p>
        </div>
        {campaign.isActive ? <span className="opinion-campaign-card__chip">Active</span> : null}
      </header>
      <p className="opinion-campaign-card__total">
        <strong>{campaign.total.toLocaleString()}</strong> responses
      </p>
      <div className="opinion-campaign-card__stack" aria-hidden="true">
        {campaign.total > 0 ? (
          <>
            <span
              className="opinion-campaign-card__seg opinion-campaign-card__seg--great"
              style={{ width: `${campaign.greatPercent}%` }}
            />
            <span
              className="opinion-campaign-card__seg opinion-campaign-card__seg--ok"
              style={{ width: `${campaign.okPercent}%` }}
            />
            <span
              className="opinion-campaign-card__seg opinion-campaign-card__seg--worst"
              style={{ width: `${campaign.worstPercent}%` }}
            />
          </>
        ) : null}
      </div>
      <dl className="opinion-campaign-card__stats">
        <div>
          <dt>Great</dt>
          <dd>
            {campaign.greatCount} <span>({campaign.greatPercent}%)</span>
          </dd>
        </div>
        <div>
          <dt>Ok</dt>
          <dd>
            {campaign.okCount} <span>({campaign.okPercent}%)</span>
          </dd>
        </div>
        <div>
          <dt>Worst</dt>
          <dd>
            {campaign.worstCount} <span>({campaign.worstPercent}%)</span>
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function SiteFeedbackPage() {
  const [reaction, setReaction] = useState<SiteFeedbackReaction | 'ALL'>('ALL');
  const [after, setAfter] = useState<string | null>(null);

  const variables = useMemo(
    () => ({
      first: 20,
      after,
      reaction: reaction === 'ALL' ? null : reaction,
    }),
    [after, reaction],
  );

  const { state, refetch } = useAdminQuery<DashboardData>(SITE_FEEDBACK_DASHBOARD_QUERY, variables);

  return (
    <div className="cms-page opinion-admin">
      <CmsPageHeader
        title="Homepage opinions"
        description="See how many people responded Great, Ok, or Worst — for this campaign and across every campaign you can access."
        backTo="/admin"
        backLabel="Back to dashboard"
      />

      <QrBoundary state={state} refetch={refetch}>
        {(data) => {
          const overview = data.siteFeedbackDashboardOverview;
          const current = overview.current;
          const overall = overview.overall;
          const showOverall =
            overview.campaigns.length > 1 || overall.total !== current.total;

          return (
            <div className="opinion-admin__body">
              <section className="opinion-admin__hero" aria-labelledby="opinion-current-title">
                <div className="opinion-admin__hero-copy">
                  <p className="opinion-admin__eyebrow">Active campaign</p>
                  <h2 id="opinion-current-title" className="opinion-admin__hero-title">
                    This campaign’s pulse
                  </h2>
                  <p className="opinion-admin__hero-sub">
                    Live totals from the public homepage opinion form.
                  </p>
                </div>

                <OpinionLegend />

                <div className="opinion-admin__viz-row">
                  <OpinionDonut summary={current} label="This campaign" />
                  <SentimentGauge summary={current} />
                </div>

                <div className="opinion-hero-stat-grid">
                  <HeroStat
                    label="Total responses"
                    count={current.total}
                    percent={100}
                    tone="total"
                  />
                  <HeroStat
                    label="Great"
                    count={current.greatCount}
                    percent={current.greatPercent}
                    tone="great"
                  />
                  <HeroStat
                    label="Ok"
                    count={current.okCount}
                    percent={current.okPercent}
                    tone="ok"
                  />
                  <HeroStat
                    label="Worst"
                    count={current.worstCount}
                    percent={current.worstPercent}
                    tone="worst"
                  />
                </div>
              </section>

              {showOverall ? (
                <section className="opinion-admin__overall" aria-labelledby="opinion-overall-title">
                  <div className="opinion-admin__section-head">
                    <h2 id="opinion-overall-title">Overall across campaigns</h2>
                    <p>
                      Combined pulse for every campaign organisation you can see (
                      {overview.campaigns.length}).
                    </p>
                  </div>

                  <div className="opinion-admin__viz-row opinion-admin__viz-row--wide">
                    <OpinionDonut summary={overall} label="All campaigns" />
                    <OpinionCompareColumns current={current} overall={overall} />
                  </div>

                  <div className="opinion-hero-stat-grid opinion-hero-stat-grid--compact">
                    <HeroStat
                      label="All responses"
                      count={overall.total}
                      percent={100}
                      tone="total"
                    />
                    <HeroStat
                      label="Great"
                      count={overall.greatCount}
                      percent={overall.greatPercent}
                      tone="great"
                    />
                    <HeroStat
                      label="Ok"
                      count={overall.okCount}
                      percent={overall.okPercent}
                      tone="ok"
                    />
                    <HeroStat
                      label="Worst"
                      count={overall.worstCount}
                      percent={overall.worstPercent}
                      tone="worst"
                    />
                  </div>
                </section>
              ) : null}

              {overview.campaigns.length > 0 ? (
                <section
                  className="opinion-admin__campaigns"
                  aria-labelledby="opinion-campaigns-title"
                >
                  <div className="opinion-admin__section-head">
                    <h2 id="opinion-campaigns-title">Per campaign</h2>
                    <p>Ranked volume with Great / Ok / Worst mix for each organisation.</p>
                  </div>
                  <CampaignPulseBars campaigns={overview.campaigns} />
                  <div className="opinion-campaign-grid">
                    {overview.campaigns.map((campaign) => (
                      <CampaignCard key={campaign.organizationId} campaign={campaign} />
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="opinion-admin__feed" aria-labelledby="opinion-feed-title">
                <div className="opinion-admin__section-head opinion-admin__section-head--row">
                  <div>
                    <h2 id="opinion-feed-title">Recent comments</h2>
                    <p>Newest submissions for this campaign.</p>
                  </div>
                  <div className="opinion-admin__filters" role="group" aria-label="Filter by reaction">
                    {FILTERS.map((filter) => (
                      <Button
                        key={filter.value}
                        type="button"
                        size="sm"
                        variant={reaction === filter.value ? 'primary' : 'secondary'}
                        onClick={() => {
                          setReaction(filter.value);
                          setAfter(null);
                        }}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {data.siteFeedbackList.nodes.length === 0 ? (
                  <p className="cms-empty">No opinions match this filter.</p>
                ) : (
                  <div className="cms-table-wrap">
                    <table className="cms-table">
                      <thead>
                        <tr>
                          <th>Reaction</th>
                          <th>Comment</th>
                          <th>Submitted</th>
                          <th>By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.siteFeedbackList.nodes.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <span
                                className={`opinion-reaction-pill opinion-reaction-pill--${row.reaction.toLowerCase()}`}
                              >
                                {reactionLabel(row.reaction)}
                              </span>
                            </td>
                            <td>{row.comment ?? '—'}</td>
                            <td>{new Date(row.submittedAt).toLocaleString()}</td>
                            <td>{row.submittedBy?.fullName ?? 'Anonymous'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {data.siteFeedbackList.pageInfo.hasNextPage ? (
                  <div className="load-more">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setAfter(data.siteFeedbackList.pageInfo.endCursor)}
                    >
                      Load more
                    </Button>
                  </div>
                ) : null}
              </section>
            </div>
          );
        }}
      </QrBoundary>
    </div>
  );
}
