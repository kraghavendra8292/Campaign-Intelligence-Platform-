import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Icon } from '@rk/ui';
import { ANALYTICS_RANGES, type AnalyticsRange } from '@rk/types';
import { useAdminQuery } from '../../features/admin/adminApi';
import { useAdminI18n } from '../../features/admin/AdminI18nContext';
import {
  ANALYTICS_BREAKDOWN_QUERY,
  ANALYTICS_OVERVIEW_QUERY,
  ANALYTICS_TREND_QUERY,
  type AnalyticsBreakdownData,
  type AnalyticsOverviewData,
  type AnalyticsTrendData,
} from '../../features/analytics/analyticsQueries';
import { ISSUES_QUERY } from '../../features/issues/issueQueries';
import {
  DASHBOARD_CONTENT_QUERY,
  type DashboardContentData,
} from '../../features/dashboard/dashboardQueries';
import { ChartCard, RankedBars, TrendChart } from '../../components/analytics/charts';
import {
  DashboardWidget,
  KpiCard,
  KpiSkeletonRow,
  WidgetSkeleton,
} from '../../components/dashboard/DashboardParts';
import { OpinionPulseWidget } from '../../components/dashboard/OpinionPulseWidget';
import { StatusPill } from './cms/shared';
import type { AdminStringKey } from '../../i18n/adminStrings';

/**
 * Campaign dashboard.
 *
 * Replaces the Phase 1 placeholder, whose own docstring said it carried "no
 * business data". Every figure here is computed by the SERVER: the browser
 * receives counts and buckets, never rows to add up, so nothing on screen can
 * disagree with the issue console or the analytics page.
 *
 * WIDGETS OWN THEIR QUERIES. Five requests go out in parallel and each section
 * resolves independently, so the fast panels paint immediately and a section
 * the viewer lacks permission for reports that on its own instead of taking the
 * page down. Authorisation is unchanged: these are the same documents the rest
 * of the console uses, and the API applies the same rules to them.
 */

/** Enough to see the shape of recent activity without becoming a table. */
const RECENT_ISSUE_LIMIT = 6;
const RECENT_CONTENT_LIMIT = 3;

/** `CUSTOM` needs a date pair, which belongs on the analytics page, not here. */
const PERIOD_PRESETS = ANALYTICS_RANGES.filter((range) => range !== 'CUSTOM');

interface IssueRow {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  priority: string;
  ward: string | null;
  submittedAt: string;
  category: { id: string; key: string; label: string } | null;
}

interface IssuesData {
  issues: { nodes: IssueRow[]; totalCount: number };
}

export function AdminOverviewPage() {
  const { t, locale } = useAdminI18n();
  const [range, setRange] = useState<AnalyticsRange>('LAST_30_DAYS');

  // One filter object, shared by every analytics document, so a period change
  // refetches them all against identical criteria.
  const filter = useMemo(() => ({ range }), [range]);

  const overview = useAdminQuery<AnalyticsOverviewData>(ANALYTICS_OVERVIEW_QUERY, { filter });
  const trend = useAdminQuery<AnalyticsTrendData>(ANALYTICS_TREND_QUERY, { filter });
  const breakdown = useAdminQuery<AnalyticsBreakdownData>(ANALYTICS_BREAKDOWN_QUERY, { filter });
  const recent = useAdminQuery<IssuesData>(ISSUES_QUERY, {
    filter: { first: RECENT_ISSUE_LIMIT },
  });
  const content = useAdminQuery<DashboardContentData>(DASHBOARD_CONTENT_QUERY, {
    first: RECENT_CONTENT_LIMIT,
  });

  const refreshAll = () => {
    overview.refetch();
    trend.refetch();
    breakdown.refetch();
    recent.refetch();
    content.refetch();
  };

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale === 'kn' ? 'kn-IN' : 'en-IN', { dateStyle: 'medium' }),
    [locale],
  );
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale === 'kn' ? 'kn-IN' : 'en-IN', { timeStyle: 'short' }),
    [locale],
  );

  /*
   * Read defensively.
   *
   * GraphQL can answer partially: a field the viewer lacks permission for, or
   * one whose resolver failed, arrives as null beside data that resolved fine.
   * Reading `.length` off that is how one missing field takes down a page that
   * is otherwise entirely usable, so nothing here assumes presence.
   */
  const row =
    overview.state.status === 'success' ? (overview.state.data.analyticsOverview ?? null) : null;
  const insights =
    overview.state.status === 'success' ? (overview.state.data.analyticsInsights ?? []) : [];

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1 className="dashboard__title">{t('dashboard.title')}</h1>
          <p className="dashboard__subtitle">{t('dashboard.subtitle')}</p>
        </div>

        <div className="dashboard__controls">
          <label className="dashboard__period">
            <span className="visually-hidden">{t('dashboard.period')}</span>
            <select
              className="rk-select__control"
              value={range}
              onChange={(event) => setRange(event.target.value as AnalyticsRange)}
            >
              {PERIOD_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {t(`range.${preset}` as AdminStringKey)}
                </option>
              ))}
            </select>
          </label>

          <Button variant="secondary" size="sm" onClick={refreshAll}>
            <Icon name="chevronDown" size={1} />
            {t('dashboard.refresh')}
          </Button>
        </div>
      </header>

      {/* The generated-at stamp is the server's own query time, not a guess. */}
      {row ? (
        <p className="dashboard__stamp">
          {t('dashboard.lastUpdated', { time: timeFormat.format(new Date(row.generatedAt)) })}
        </p>
      ) : null}

      {/* ---------------------------------------------------------- KPIs -- */}
      {overview.state.status === 'loading' ? <KpiSkeletonRow label={t('state.loading')} /> : null}

      {overview.state.status === 'error' ? (
        <div className="dash-widget__error" role="alert">
          <p>
            {overview.state.code === 'FORBIDDEN'
              ? t('state.forbiddenTitle')
              : overview.state.message}
          </p>
          {overview.state.code !== 'FORBIDDEN' ? (
            <Button variant="secondary" size="sm" onClick={overview.refetch}>
              {t('action.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {row ? (
        <div className="kpi-grid">
          <KpiCard
            icon="message"
            label={t('dashboard.kpi.submissions')}
            value={row.totalInRange}
            changePct={row.changePct}
            caption={t('dashboard.kpi.allTime', { count: row.totalAllTime.toLocaleString() })}
          />
          <KpiCard
            icon="folder"
            label={t('dashboard.kpi.open')}
            value={row.openCount}
            caption={t('dashboard.kpi.awaitingModeration', { count: row.awaitingModeration })}
          />
          <KpiCard
            icon="shieldCheck"
            label={t('dashboard.kpi.resolved')}
            value={row.resolvedInRange}
            changePct={row.resolvedChangePct}
          />
          <KpiCard
            icon="barChart"
            label={t('dashboard.kpi.resolutionRate')}
            /* An em dash, never "0%": a rate with an empty denominator is
               undefined, and the API sends null to say so. */
            value={row.resolutionRatePct === null ? '—' : `${Math.round(row.resolutionRatePct)}%`}
            {...(row.medianResolutionDays !== null
              ? { caption: t('dashboard.kpi.medianDays', { days: row.medianResolutionDays }) }
              : {})}
          />
          <KpiCard
            icon="target"
            label={t('dashboard.kpi.highPriority')}
            value={row.highPriorityOpen}
            tone={row.highPriorityOpen > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            icon="user"
            label={t('dashboard.kpi.unassigned')}
            value={row.unassignedOpen}
            tone={row.unassignedOpen > 0 ? 'warning' : 'default'}
          />
        </div>
      ) : null}

      <OpinionPulseWidget />

      {/* ------------------------------------------------------- Analytics -- */}
      <div className="dashboard__grid dashboard__grid--wide">
        <DashboardWidget
          title={t('dashboard.trend.title')}
          description={t('dashboard.trend.desc')}
          state={trend.state}
          refetch={trend.refetch}
          isEmpty={(data) => (data.analyticsTrend?.points?.length ?? 0) === 0}
          emptyMessage={t('dashboard.empty.submissions')}
        >
          {(data) => (
            <TrendChart
              points={(data.analyticsTrend?.points ?? []).map((point) => ({
                date: point.date,
                value: point.count,
              }))}
            />
          )}
        </DashboardWidget>
      </div>

      <div className="dashboard__grid dashboard__grid--split">
        <DashboardWidget
          title={t('dashboard.status.title')}
          description={t('dashboard.status.desc')}
          state={breakdown.state}
          refetch={breakdown.refetch}
          isEmpty={(data) => (data.analyticsByStatus?.length ?? 0) === 0}
          emptyMessage={t('dashboard.empty.submissions')}
        >
          {(data) => (
            <RankedBars
              buckets={(data.analyticsByStatus ?? []).map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                value: bucket.count,
              }))}
            />
          )}
        </DashboardWidget>

        <DashboardWidget
          title={t('dashboard.category.title')}
          description={t('dashboard.category.desc')}
          state={breakdown.state}
          refetch={breakdown.refetch}
          isEmpty={(data) => (data.analyticsByCategory?.length ?? 0) === 0}
          emptyMessage={t('dashboard.empty.submissions')}
        >
          {(data) => (
            <RankedBars
              buckets={(data.analyticsByCategory ?? []).map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                value: bucket.count,
              }))}
            />
          )}
        </DashboardWidget>
      </div>

      {/* ------------------------------------------------------ Operations -- */}
      <div className="dashboard__grid dashboard__grid--split">
        <DashboardWidget
          title={t('dashboard.recent.title')}
          description={t('dashboard.recent.desc')}
          state={recent.state}
          refetch={recent.refetch}
          isEmpty={(data) => (data.issues?.nodes?.length ?? 0) === 0}
          emptyMessage={t('dashboard.empty.submissions')}
          skeleton={<WidgetSkeleton label={t('dashboard.recent.title')} lines={6} />}
          action={
            <Link className="dash-widget__link" to="/admin/issues">
              {t('dashboard.viewAll')}
            </Link>
          }
        >
          {(data) => (
            <ul className="dash-list">
              {(data.issues?.nodes ?? []).map((issue) => (
                <li key={issue.id}>
                  {/* Straight into the existing issue detail route. */}
                  <Link className="dash-list__row" to={`/admin/issues/${issue.id}`}>
                    <span className="dash-list__main">
                      <span className="dash-list__ref">{issue.referenceNumber}</span>
                      <span className="dash-list__title">{issue.title}</span>
                    </span>
                    <span className="dash-list__meta">
                      {issue.category ? <Badge tone="neutral">{issue.category.label}</Badge> : null}
                      {issue.ward ? <span className="dash-list__ward">{issue.ward}</span> : null}
                      <StatusPill value={issue.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardWidget>

        {/*
          Real insights or nothing. `analyticsInsights` is computed by the API
          from this period's submissions; when it returns none, the panel says
          so rather than inventing an observation.
        */}
        <ChartCard title={t('dashboard.insights.title')} description={t('dashboard.insights.desc')}>
          {insights.length === 0 ? (
            <p className="dash-widget__empty">{t('dashboard.empty.insights')}</p>
          ) : (
            <ul className="dash-insights">
              {insights.map((insight) => (
                <li
                  key={`${insight.kind}-${insight.categoryKey ?? ''}`}
                  data-severity={insight.severity}
                >
                  <p className="dash-insights__headline">{insight.headline}</p>
                  <p className="dash-insights__detail">{insight.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      {/* --------------------------------------------------------- Content -- */}
      <DashboardWidget
        title={t('dashboard.content.title')}
        description={t('dashboard.content.desc')}
        state={content.state}
        refetch={content.refetch}
        isEmpty={(data) =>
          (data.cmsProjects?.totalCount ?? 0) === 0 &&
          (data.cmsNews?.totalCount ?? 0) === 0 &&
          (data.cmsEvents?.totalCount ?? 0) === 0
        }
        emptyMessage={t('dashboard.empty.content')}
      >
        {(data) => (
          <div className="dash-content">
            <ContentColumn
              label={t('dashboard.content.projects')}
              total={data.cmsProjects?.totalCount ?? 0}
              to="/admin/content/projects"
              rows={(data.cmsProjects?.nodes ?? []).map((node) => ({
                id: node.id,
                title: node.title,
                status: node.status,
                meta: node.area,
              }))}
            />
            <ContentColumn
              label={t('dashboard.content.news')}
              total={data.cmsNews?.totalCount ?? 0}
              to="/admin/content/news"
              rows={(data.cmsNews?.nodes ?? []).map((node) => ({
                id: node.id,
                title: node.title,
                status: node.status,
                meta: node.publishedAt ? dateFormat.format(new Date(node.publishedAt)) : null,
              }))}
            />
            <ContentColumn
              label={t('dashboard.content.events')}
              total={data.cmsEvents?.totalCount ?? 0}
              to="/admin/content/events"
              rows={(data.cmsEvents?.nodes ?? []).map((node) => ({
                id: node.id,
                title: node.title,
                status: node.status,
                meta: node.startAt ? dateFormat.format(new Date(node.startAt)) : null,
              }))}
            />
          </div>
        )}
      </DashboardWidget>
    </div>
  );
}

function ContentColumn({
  label,
  total,
  to,
  rows,
}: {
  label: string;
  total: number;
  to: string;
  rows: Array<{ id: string; title: string; status: string; meta: string | null }>;
}) {
  const { t } = useAdminI18n();

  return (
    <section className="dash-content__column">
      <header className="dash-content__head">
        <h3 className="dash-content__label">{label}</h3>
        <p className="dash-content__count">{total.toLocaleString()}</p>
      </header>

      {rows.length === 0 ? (
        <p className="dash-widget__empty">{t('dashboard.empty.content')}</p>
      ) : (
        <ul className="dash-content__list">
          {rows.map((item) => (
            <li key={item.id}>
              <span className="dash-content__title">{item.title}</span>
              <span className="dash-content__meta">
                <StatusPill value={item.status} />
                {item.meta ? <span>{item.meta}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link className="dash-widget__link" to={to}>
        {t('dashboard.viewAll')}
      </Link>
    </section>
  );
}
