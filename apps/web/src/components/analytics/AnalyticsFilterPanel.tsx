import { useState } from 'react';
import { Button } from '@rk/ui';
import { ISSUE_PRIORITIES, ISSUE_SOURCES, ISSUE_STATUSES, type AnalyticsRange } from '@rk/types';
import { useAdminQuery } from '../../features/admin/adminApi';
import {
  ANALYTICS_OPTIONS_QUERY,
  type AnalyticsOptionsData,
  type GeoLevel,
} from '../../features/analytics/analyticsQueries';
import type { AnalyticsFilterState } from '../../features/analytics/useAnalyticsFilters';

/**
 * The dashboard filter panel.
 *
 * COLLAPSED BY DEFAULT ON EVERY VIEWPORT, not only mobile. Eight filter
 * controls above the numbers would push the overview below the fold on a
 * laptop, and the overview is what most visits are for. The period selector
 * stays visible because it is the one control almost every session touches, and
 * a badge shows how many other filters are active so a narrowed view is never
 * mistaken for the whole picture.
 *
 * Options come from the tenant's own data - categories from the Phase 5
 * vocabulary and areas from values citizens actually entered - so the panel
 * never offers a filter that matches nothing.
 *
 * Every control writes through to the URL via `useAnalyticsFilters`; there is
 * no local copy of the filter state here to drift from it.
 */

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: 'TODAY', label: 'Today' },
  { value: 'LAST_7_DAYS', label: 'Last 7 days' },
  { value: 'LAST_30_DAYS', label: 'Last 30 days' },
  { value: 'LAST_90_DAYS', label: 'Last 90 days' },
  { value: 'THIS_MONTH', label: 'This month' },
  { value: 'PREVIOUS_MONTH', label: 'Previous month' },
  { value: 'CUSTOM', label: 'Custom range' },
];

const GEO_OPTIONS: Array<{ value: GeoLevel; label: string }> = [
  { value: 'WARD', label: 'Ward' },
  { value: 'LOCALITY', label: 'Locality' },
  { value: 'AREA', label: 'Area' },
];

export function AnalyticsFilterPanel({
  filters,
  onChange,
  onReset,
  activeCount,
  variables,
}: {
  filters: AnalyticsFilterState;
  onChange: (next: Partial<AnalyticsFilterState>) => void;
  onReset: () => void;
  activeCount: number;
  variables: { filter: Record<string, unknown> };
}) {
  const [open, setOpen] = useState(false);
  const options = useAdminQuery<AnalyticsOptionsData>(ANALYTICS_OPTIONS_QUERY, variables);

  const areaOptions =
    options.state.status === 'success' ? options.state.data.analyticsAreaOptions : [];
  const categoryOptions =
    options.state.status === 'success' ? options.state.data.issueCategories : [];

  return (
    <div className="analytics-filters">
      <div className="analytics-filters__bar">
        <label className="analytics-filters__period">
          <span className="visually-hidden">Period</span>
          <select
            className="rk-select__control"
            value={filters.range}
            onChange={(event) => onChange({ range: event.target.value as AnalyticsRange })}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {filters.range === 'CUSTOM' ? (
          <>
            <label className="analytics-filters__date">
              <span className="visually-hidden">From</span>
              <input
                type="date"
                className="rk-input__control"
                value={filters.from?.slice(0, 10) ?? ''}
                onChange={(event) => onChange({ from: event.target.value || null })}
              />
            </label>
            <label className="analytics-filters__date">
              <span className="visually-hidden">To</span>
              <input
                type="date"
                className="rk-input__control"
                value={filters.to?.slice(0, 10) ?? ''}
                onChange={(event) => onChange({ to: event.target.value || null })}
              />
            </label>
          </>
        ) : null}

        <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide filters' : 'Filters'}
          {activeCount > 0 ? <span className="analytics-filters__badge">{activeCount}</span> : null}
        </Button>

        {activeCount > 0 ? (
          <Button type="button" variant="secondary" onClick={onReset}>
            Clear all
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="analytics-filters__panel">
          <MultiSelect
            label="Category"
            options={categoryOptions.map((category) => ({
              value: category.id,
              label: category.label,
            }))}
            selected={filters.categoryIds}
            onChange={(categoryIds) => onChange({ categoryIds })}
          />

          <MultiSelect
            label="Status"
            options={ISSUE_STATUSES.map((status) => ({ value: status, label: humanise(status) }))}
            selected={filters.statuses}
            onChange={(statuses) => onChange({ statuses })}
          />

          <MultiSelect
            label="Priority"
            options={ISSUE_PRIORITIES.map((priority) => ({
              value: priority,
              label: humanise(priority),
            }))}
            selected={filters.priorities}
            onChange={(priorities) => onChange({ priorities })}
          />

          <MultiSelect
            label="Source"
            options={ISSUE_SOURCES.map((source) => ({ value: source, label: humanise(source) }))}
            selected={filters.sources}
            onChange={(sources) => onChange({ sources })}
          />

          <label className="analytics-filters__field">
            <span className="cms-field__label">Geographic level</span>
            <select
              className="rk-select__control"
              value={filters.geoLevel}
              onChange={(event) =>
                // Areas are values at the OLD level, so they are cleared with
                // the level change. Keeping them would filter on ward names
                // against a locality column and silently return nothing.
                onChange({ geoLevel: event.target.value as GeoLevel, areas: [] })
              }
            >
              {GEO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <MultiSelect
            label="Area"
            options={areaOptions.map((area) => ({ value: area, label: area }))}
            selected={filters.areas}
            onChange={(areas) => onChange({ areas })}
            emptyMessage="No areas recorded yet."
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A checkbox group.
 *
 * Checkboxes rather than a multi-select listbox: a native multi-select requires
 * ctrl-clicking to add a second value, which is undiscoverable, and on touch it
 * is close to unusable. The list is capped in height by CSS and scrolls.
 */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyMessage,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: readonly string[];
  onChange: (next: string[]) => void;
  emptyMessage?: string;
}) {
  const toggle = (value: string): void => {
    onChange(
      selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value],
    );
  };

  return (
    <fieldset className="analytics-filters__field">
      <legend className="cms-field__label">{label}</legend>
      {options.length === 0 ? (
        <p className="cms-muted">{emptyMessage ?? 'Nothing to choose from yet.'}</p>
      ) : (
        <div className="analytics-filters__checkboxes">
          {options.map((option) => (
            <label key={option.value} className="analytics-filters__checkbox">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function humanise(value: string): string {
  const lower = value.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
