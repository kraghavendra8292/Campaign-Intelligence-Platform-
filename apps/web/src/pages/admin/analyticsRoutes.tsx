import type { RouteObject } from 'react-router-dom';

/**
 * Decision dashboard route, mounted under `/admin` inside the Phase 2 guard.
 *
 * Loaded on demand, matching every other admin console. The citizen-facing
 * bundle must not carry the dashboard, which is the heaviest admin screen in
 * the product.
 *
 * `/admin/analytics` is a NEW route rather than a replacement for the Phase 5
 * `/admin/issues/analytics` page. That page remains: it is the focused
 * submission view an issue manager opens from the inbox, and this is the
 * cross-cutting decision surface that also carries geography, AI themes,
 * channel attribution and export. Removing the first would break a link staff
 * already use.
 */
export const ANALYTICS_ROUTES: RouteObject[] = [
  {
    path: 'analytics',
    lazy: async () => {
      const { AnalyticsPage } = await import('./analytics/AnalyticsPage');
      return { Component: AnalyticsPage };
    },
  },
];
