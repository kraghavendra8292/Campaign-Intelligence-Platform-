import { useState, type ReactNode } from 'react';
import { ANALYTICS_RANGES, type AnalyticsRange } from '@rk/types';
import { Badge, Button, ErrorState, LoadingState } from '@rk/ui';
import type { StatusTone } from '@rk/design-tokens';
import type { AdminQueryState } from '../../features/admin/adminApi';
import { useAdminI18n } from '../../features/admin/AdminI18nContext';

/**
 * Shared chrome for the QR console.
 *
 * Built on the Phase 1 primitives and the Phase 3 CMS patterns rather than
 * beside them: the boundary, the toasts and the confirm dialog behave the same
 * here as in the CMS, which is what makes an admin tool feel like one product.
 */

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * Renders a query's four states.
 *
 * A permission failure gets its own message: "you cannot see this" is
 * actionable (ask an administrator), whereas the generic error tells the reader
 * nothing they can act on. Analytics in particular is behind a permission most
 * roles do not hold, so this path is common rather than exotic.
 */
export function QrBoundary<T>({
  state,
  refetch,
  isEmpty,
  empty,
  children,
}: {
  state: AdminQueryState<T>;
  refetch?: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { t } = useAdminI18n();

  if (state.status === 'loading') return <LoadingState title={t('state.loading')} />;

  if (state.status === 'error') {
    if (state.code === 'FORBIDDEN') {
      return (
        <ErrorState
          title={t('state.forbiddenTitle')}
          description="Your role does not include permission to view this. Ask a campaign administrator if you need it."
        />
      );
    }

    return (
      <ErrorState
        title={t('state.errorTitle')}
        description={state.message}
        retryLabel={t('action.retry')}
        {...(refetch ? { onRetry: refetch } : {})}
      />
    );
  }

  if (isEmpty?.(state.data)) return <>{empty}</>;

  return <>{children(state.data)}</>;
}

/** An explicit empty state with somewhere to go next. */
export function QrEmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="cms-empty">
      <p className="cms-empty__title">{title}</p>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const QR_TONES: Record<string, StatusTone> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'info',
  ARCHIVED: 'neutral',
};

/** Status as words plus tone, never tone alone. */
export function QrStatusBadge({ value }: { value: string }) {
  return (
    <Badge tone={QR_TONES[value] ?? 'neutral'} withDot>
      {value.replace(/_/g, ' ').toLowerCase()}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * A headline figure.
 *
 * `value` is a string so the caller decides the formatting - and so an
 * unavailable figure can be rendered as an em dash rather than as a zero.
 * Reporting "0 unique visits" when the number is simply not available would be
 * a claim the data cannot support.
 *
 * Optional `sparkline` / `delta` keep the card scannable at a glance without
 * turning every KPI into a chart.
 */
export function StatCard({
  label,
  value,
  hint,
  tone,
  sparkline,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'primary' | 'accent' | 'neutral' | 'info';
  sparkline?: ReactNode;
  delta?: string;
}) {
  return (
    <div className={`stat-card${tone ? ` stat-card--${tone}` : ''}`}>
      <div className="stat-card__top">
        <p className="stat-card__label">{label}</p>
        {delta ? <span className="stat-card__delta">{delta}</span> : null}
      </div>
      <div className="stat-card__body">
        <p className="stat-card__value">{value}</p>
        {sparkline ? <div className="stat-card__spark">{sparkline}</div> : null}
      </div>
      {hint ? <p className="stat-card__hint">{hint}</p> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

export interface RangeSelection {
  readonly range: AnalyticsRange;
  readonly from: string | null;
  readonly to: string | null;
}

export const DEFAULT_RANGE: RangeSelection = { range: 'LAST_30_DAYS', from: null, to: null };

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  LAST_7_DAYS: 'Last 7 days',
  LAST_30_DAYS: 'Last 30 days',
  LAST_90_DAYS: 'Last 90 days',
  THIS_MONTH: 'This month',
  PREVIOUS_MONTH: 'Previous month',
  CUSTOM: 'Custom range',
};

/**
 * Date range control.
 *
 * Presets are the primary interface because they are the questions people
 * actually ask. The custom fields only appear once CUSTOM is chosen, so the
 * common case is one click rather than two date pickers.
 *
 * A custom range is applied on submit rather than on change: applying it
 * half-typed would fire a query for the year 0002 on the way to 2026.
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: RangeSelection;
  onChange: (next: RangeSelection) => void;
}) {
  const { t } = useAdminI18n();
  const [draftFrom, setDraftFrom] = useState(value.from ?? '');
  const [draftTo, setDraftTo] = useState(value.to ?? '');

  return (
    <div className="range-picker">
      <label className="range-picker__preset">
        <span className="visually-hidden">{t('filter.dateRange')}</span>
        <select
          className="rk-select__control"
          value={value.range}
          onChange={(event) => {
            const next = event.target.value as AnalyticsRange;
            if (next === 'CUSTOM') {
              onChange({ range: 'CUSTOM', from: draftFrom || null, to: draftTo || null });
            } else {
              onChange({ range: next, from: null, to: null });
            }
          }}
        >
          {ANALYTICS_RANGES.map((range) => (
            <option key={range} value={range}>
              {RANGE_LABELS[range]}
            </option>
          ))}
        </select>
      </label>

      {value.range === 'CUSTOM' ? (
        <form
          className="range-picker__custom"
          onSubmit={(event) => {
            event.preventDefault();
            onChange({ range: 'CUSTOM', from: draftFrom || null, to: draftTo || null });
          }}
        >
          <label>
            <span className="visually-hidden">{t('filter.from')}</span>
            <input
              className="rk-input rk-input--sm"
              type="date"
              value={draftFrom}
              onChange={(event) => setDraftFrom(event.target.value)}
            />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span className="visually-hidden">{t('filter.to')}</span>
            <input
              className="rk-input rk-input--sm"
              type="date"
              value={draftTo}
              onChange={(event) => setDraftTo(event.target.value)}
            />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Apply
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** Horizontal bar for filters and range controls above a dataset. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="cms-filters">{children}</div>;
}
