import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AnalyticsRange } from '@rk/types';
import { ANALYTICS_RANGES } from '@rk/types';
import type { GeoLevel } from './analyticsQueries';

/**
 * Dashboard filter state, held in the URL.
 *
 * THE URL IS THE STATE, not a copy of it. There is no `useState` shadowing
 * these values, because the two would drift the moment somebody used the back
 * button - and this is a page whose whole purpose is to be narrowed down and
 * then shared. "Look at Ward 12's drainage backlog" should be a link somebody
 * can paste into a message, and a reload must land on the same view rather than
 * resetting to the default month.
 *
 * The shape is deliberately flat and string-based, matching what a query string
 * can carry without encoding tricks: repeated keys for lists, ISO dates for the
 * custom range. A filter that cannot survive a round trip through a URL is not
 * offered.
 */

export interface AnalyticsFilterState {
  readonly range: AnalyticsRange;
  readonly from: string | null;
  readonly to: string | null;
  readonly categoryIds: readonly string[];
  readonly statuses: readonly string[];
  readonly priorities: readonly string[];
  readonly sources: readonly string[];
  readonly areas: readonly string[];
  readonly geoLevel: GeoLevel;
  readonly topics: readonly string[];
  readonly themeId: string | null;
}

export const DEFAULT_FILTERS: AnalyticsFilterState = {
  range: 'LAST_30_DAYS',
  from: null,
  to: null,
  categoryIds: [],
  statuses: [],
  priorities: [],
  sources: [],
  areas: [],
  geoLevel: 'WARD',
  topics: [],
  themeId: null,
};

const GEO_LEVELS: readonly GeoLevel[] = ['WARD', 'LOCALITY', 'AREA'];

function isRange(value: string | null): value is AnalyticsRange {
  return value !== null && (ANALYTICS_RANGES as readonly string[]).includes(value);
}

function isGeoLevel(value: string | null): value is GeoLevel {
  return value !== null && (GEO_LEVELS as readonly string[]).includes(value);
}

export function useAnalyticsFilters(): {
  filters: AnalyticsFilterState;
  /** The shape the GraphQL documents expect. Memoised, so it is a stable key. */
  variables: { filter: Record<string, unknown> };
  setFilters: (next: Partial<AnalyticsFilterState>) => void;
  reset: () => void;
  activeCount: number;
} {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<AnalyticsFilterState>(() => {
    const rawRange = params.get('range');
    const rawGeo = params.get('geoLevel');

    return {
      // Anything unrecognised falls back to the default rather than being
      // passed through. A hand-edited URL is untrusted input like any other,
      // and the server would reject it anyway - failing here means the page
      // still renders something sensible instead of an error.
      range: isRange(rawRange) ? rawRange : DEFAULT_FILTERS.range,
      from: params.get('from'),
      to: params.get('to'),
      categoryIds: params.getAll('category'),
      statuses: params.getAll('status'),
      priorities: params.getAll('priority'),
      sources: params.getAll('source'),
      areas: params.getAll('area'),
      geoLevel: isGeoLevel(rawGeo) ? rawGeo : DEFAULT_FILTERS.geoLevel,
      topics: params.getAll('topic'),
      themeId: params.get('theme'),
    };
  }, [params]);

  const setFilters = useCallback(
    (next: Partial<AnalyticsFilterState>) => {
      const merged = { ...filters, ...next };
      const updated = new URLSearchParams();

      if (merged.range !== DEFAULT_FILTERS.range) updated.set('range', merged.range);
      // Custom dates are only meaningful with the CUSTOM preset; carrying them
      // otherwise would put stale dates in a shared link.
      if (merged.range === 'CUSTOM') {
        if (merged.from) updated.set('from', merged.from);
        if (merged.to) updated.set('to', merged.to);
      }

      for (const id of merged.categoryIds) updated.append('category', id);
      for (const value of merged.statuses) updated.append('status', value);
      for (const value of merged.priorities) updated.append('priority', value);
      for (const value of merged.sources) updated.append('source', value);
      for (const value of merged.areas) updated.append('area', value);
      for (const value of merged.topics) updated.append('topic', value);

      if (merged.geoLevel !== DEFAULT_FILTERS.geoLevel) updated.set('geoLevel', merged.geoLevel);
      if (merged.themeId) updated.set('theme', merged.themeId);

      // `replace` so filter fiddling does not fill the history stack - a user
      // pressing back expects to leave the dashboard, not to undo eleven
      // checkbox clicks one at a time.
      setParams(updated, { replace: true });
    },
    [filters, setParams],
  );

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const variables = useMemo(
    () => ({
      filter: {
        range: filters.range,
        from: filters.range === 'CUSTOM' && filters.from ? isoStart(filters.from) : null,
        to: filters.range === 'CUSTOM' && filters.to ? isoStart(filters.to) : null,
        // Empty arrays are sent as null rather than []: an empty `IN` clause
        // would match nothing, turning "no category filter" into "no results".
        categoryIds: nullIfEmpty(filters.categoryIds),
        statuses: nullIfEmpty(filters.statuses),
        priorities: nullIfEmpty(filters.priorities),
        sources: nullIfEmpty(filters.sources),
        areas: nullIfEmpty(filters.areas),
        topics: nullIfEmpty(filters.topics),
        geoLevel: filters.geoLevel,
        themeId: filters.themeId,
      },
    }),
    [filters],
  );

  const activeCount =
    filters.categoryIds.length +
    filters.statuses.length +
    filters.priorities.length +
    filters.sources.length +
    filters.areas.length +
    filters.topics.length +
    (filters.themeId ? 1 : 0);

  return { filters, variables, setFilters, reset, activeCount };
}

function nullIfEmpty(values: readonly string[]): string[] | null {
  return values.length > 0 ? [...values] : null;
}

/** A `yyyy-mm-dd` input value as an ISO instant the API can parse. */
function isoStart(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
