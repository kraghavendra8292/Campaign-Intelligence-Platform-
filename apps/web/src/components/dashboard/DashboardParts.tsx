import type { ReactNode } from 'react';
import { Button, Icon, Skeleton, SkeletonGroup, type IconName } from '@rk/ui';
import { useAdminI18n } from '../../features/admin/AdminI18nContext';
import { useCountUp } from '../../lib/useCountUp';
import type { AdminQueryState } from '../../features/admin/adminApi';

/**
 * Dashboard building blocks.
 *
 * Small and composable so the page reads as a layout rather than as one long
 * component, and so each widget can own its own query - which is what lets a
 * failing section show an inline retry while everything around it keeps
 * working.
 */

/* ------------------------------------------------------------------ KPI -- */

export interface KpiCardProps {
  icon: IconName;
  label: string;
  /** Already-formatted when the figure is not a plain count, e.g. a rate. */
  value: number | string;
  /**
   * Percentage change against the previous period.
   *
   * `null` is meaningful and common: the API returns null when the previous
   * period had no submissions, because a change from zero is undefined. The
   * card says so rather than printing a confident "+100%".
   */
  changePct?: number | null;
  /** Secondary line, e.g. an all-time total or a median. */
  caption?: string;
  tone?: 'default' | 'warning';
}

export function KpiCard({
  icon,
  label,
  value,
  changePct,
  caption,
  tone = 'default',
}: KpiCardProps) {
  const { t } = useAdminI18n();
  const numeric = typeof value === 'number';
  const animated = useCountUp(numeric ? value : 0);

  return (
    <article className="kpi-card" data-tone={tone}>
      <header className="kpi-card__head">
        <span className="kpi-card__icon" aria-hidden="true">
          <Icon name={icon} size={1.1} />
        </span>
        <h3 className="kpi-card__label">{label}</h3>
      </header>

      <p className="kpi-card__value">{numeric ? animated.toLocaleString() : value}</p>

      {changePct === undefined ? null : <DeltaBadge changePct={changePct} />}
      {caption ? <p className="kpi-card__caption">{caption}</p> : null}
      {changePct === null ? (
        <p className="kpi-card__caption">{t('dashboard.noComparison')}</p>
      ) : null}
    </article>
  );
}

/**
 * Direction of travel against the previous period.
 *
 * The arrow and the sign carry the meaning, not the colour alone - and the
 * colour is deliberately NOT "up is good": more submissions is engagement, not
 * a problem, so this states the direction and leaves the judgement to the
 * reader rather than implying a verdict the data does not support.
 */
function DeltaBadge({ changePct }: { changePct: number | null }) {
  const { t } = useAdminI18n();
  if (changePct === null) return null;

  const rounded = Math.round(changePct * 10) / 10;
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';

  return (
    <p className="kpi-card__delta" data-direction={direction}>
      <span aria-hidden="true">{direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'}</span>
      <span>
        {rounded > 0 ? '+' : ''}
        {rounded}%
      </span>
      <span className="kpi-card__delta-label">{t('dashboard.vsPrevious')}</span>
    </p>
  );
}

/* --------------------------------------------------------------- Widget -- */

/**
 * One dashboard section, with its own loading, error and empty handling.
 *
 * Deliberately per-widget rather than per-page: a dashboard that blanks itself
 * because one aggregation timed out is worse than one that shows five working
 * panels and a retry button on the sixth.
 */
export function DashboardWidget<T>({
  title,
  description,
  state,
  refetch,
  action,
  isEmpty,
  emptyMessage,
  skeleton,
  children,
}: {
  title: string;
  description?: string;
  state: AdminQueryState<T>;
  refetch?: () => void;
  action?: ReactNode;
  isEmpty?: (data: T) => boolean;
  emptyMessage?: string;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { t } = useAdminI18n();

  return (
    <section className="dash-widget">
      <header className="dash-widget__head">
        <div>
          <h2 className="dash-widget__title">{title}</h2>
          {description ? <p className="dash-widget__description">{description}</p> : null}
        </div>
        {action ? <div className="dash-widget__action">{action}</div> : null}
      </header>

      <div className="dash-widget__body">
        {state.status === 'loading' ? (skeleton ?? <WidgetSkeleton label={title} />) : null}

        {state.status === 'error' ? (
          <div className="dash-widget__error" role="alert">
            <p>{state.code === 'FORBIDDEN' ? t('state.forbiddenTitle') : state.message}</p>
            {refetch && state.code !== 'FORBIDDEN' ? (
              <Button variant="secondary" size="sm" onClick={refetch}>
                {t('action.retry')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {state.status === 'success' ? (
          isEmpty?.(state.data) ? (
            <p className="dash-widget__empty">{emptyMessage ?? t('state.empty')}</p>
          ) : (
            children(state.data)
          )
        ) : null}
      </div>
    </section>
  );
}

export function WidgetSkeleton({ label, lines = 4 }: { label: string; lines?: number }) {
  return (
    <SkeletonGroup label={label}>
      <div className="dash-skeleton">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} height="1.1rem" width={index === lines - 1 ? '55%' : '100%'} />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** KPI placeholders that hold the real grid, so nothing shifts when data lands. */
export function KpiSkeletonRow({ label, count = 4 }: { label: string; count?: number }) {
  return (
    <SkeletonGroup label={label}>
      <div className="kpi-grid">
        {Array.from({ length: count }, (_, index) => (
          <div className="kpi-card" key={index}>
            <Skeleton height="0.85rem" width="55%" />
            <Skeleton height="2rem" width="45%" />
            <Skeleton height="0.8rem" width="70%" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
