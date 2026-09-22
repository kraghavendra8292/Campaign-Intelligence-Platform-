import type { RouteObject } from 'react-router-dom';

/**
 * Issue console routes, mounted under `/admin` inside the Phase 2 route guard.
 *
 * Loaded on demand. The public feedback form is opened by a citizen on mobile
 * data; it must not carry the staff console with it. `ProtectedRoute` sits
 * above these, so an anonymous visitor is redirected to login without fetching
 * any of this.
 *
 * No per-route permission gate, matching the CMS and QR consoles: the guard
 * establishes that the user is signed in, and each screen renders what the API
 * allows. `analytics` is declared before `:id` so it is not swallowed as an id.
 */
export const ISSUE_ROUTES: RouteObject[] = [
  {
    path: 'issues',
    lazy: async () => {
      const { IssuesPage } = await import('./issues/IssuesPage');
      return { Component: IssuesPage };
    },
  },
  {
    path: 'issues/analytics',
    lazy: async () => {
      const { IssueAnalyticsPage } = await import('./issues/IssueAnalyticsPage');
      return { Component: IssueAnalyticsPage };
    },
  },
  {
    path: 'issues/opinions',
    lazy: async () => {
      const { SiteFeedbackPage } = await import('./issues/SiteFeedbackPage');
      return { Component: SiteFeedbackPage };
    },
  },
  {
    path: 'issues/:id',
    lazy: async () => {
      const { IssueDetailPage } = await import('./issues/IssueDetailPage');
      return { Component: IssueDetailPage };
    },
  },
];
