import { Suspense, lazy } from 'react';
import { LoadingState } from '@rk/ui';
import type { RouteObject } from 'react-router-dom';
import { SiteLayout } from '../layouts/SiteLayout';
import { SiteProvider } from '../features/site/SiteContext';
import { CmsLocaleProvider } from '../features/cms/CmsLocaleContext';
import { AdminLayout } from '../layouts/AdminLayout';
import { SiteHomePage } from '../pages/site/HomePage';
import { AchievementsPage, EventsPage, NewsPage } from '../pages/site/ListingPages';
import { AchievementDetailPage, EventDetailPage, NewsDetailPage } from '../pages/site/DetailPages';
// Phase 9 replaces the Phase 3 work listing and detail with a strict superset:
// same content plus verification status, evidence and the proposed / ongoing /
// completed filter. The Phase 3 `publicProjects` query is unchanged and still
// served, so any client still using it keeps working.
import { WorkDetailPage, WorksPage } from '../pages/site/WorksPage';
import { TransparencyPage } from '../pages/site/TransparencyPage';
import {
  AboutPage,
  ContactPage,
  GalleryPage,
  PrivacyPage,
  SearchPage,
  TermsPage,
  VisionPage,
} from '../pages/site/ContentPages';
import { FeedbackPage } from '../pages/site/FeedbackPage';
import { TrackIssuePage } from '../pages/site/TrackIssuePage';
import { ForbiddenPage } from '../pages/admin/ForbiddenPage';

const AdminOverviewPage = lazy(() =>
  import('../pages/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })),
);

/** Holds the console's content area while the dashboard chunk arrives. */
function DashboardFallback() {
  return <LoadingState title="Loading" />;
}
import { LoginPage } from '../pages/auth/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { CMS_ROUTES } from '../pages/admin/cmsRoutes';
import { QR_ROUTES } from '../pages/admin/qrRoutes';
import { ISSUE_ROUTES } from '../pages/admin/issueRoutes';
import { AI_ROUTES } from '../pages/admin/aiRoutes';
import { ANALYTICS_ROUTES } from '../pages/admin/analyticsRoutes';
import { COMMUNICATION_ROUTES } from '../pages/admin/communicationRoutes';
import { VERIFICATION_ROUTES } from '../pages/admin/verificationRoutes';
import { SYSTEM_ROUTES } from '../pages/admin/systemRoutes';

/**
 * Route definitions.
 *
 * Three trees, in order of who they serve:
 *
 *   `/`       the public candidate website - anonymous, read-only
 *   `/login`  authentication
 *   `/admin`  the campaign console and CMS, behind the Phase 2 route guard
 *
 * Kept separate from router creation so the same tree mounts in a browser
 * router for the app and a memory router in tests.
 */
/**
 * The three admin consoles, loaded on demand.
 *
 * WHY THIS MATTERS MOST IN PHASE 5. The public feedback form is opened by a
 * citizen on mobile data, standing next to the problem they are reporting.
 * Without splitting, that request downloads the entire CMS, QR console and
 * issue console alongside it - hundreds of kilobytes of screens they can never
 * reach, on the slowest connection any of this product's users are on.
 *
 * React Router's own `lazy` is used rather than `React.lazy`, so the router
 * resolves the module as part of navigation. No Suspense boundary is needed,
 * and the route guard still runs first: `ProtectedRoute` sits above these, so
 * an anonymous visitor is redirected to the login page without fetching any
 * admin chunk at all.
 */
const ADMIN_CONSOLE_ROUTES: RouteObject[] = [
  ...CMS_ROUTES,
  ...QR_ROUTES,
  ...ISSUE_ROUTES,
  ...AI_ROUTES,
  ...ANALYTICS_ROUTES,
  ...COMMUNICATION_ROUTES,
  ...VERIFICATION_ROUTES,
  ...SYSTEM_ROUTES,
];

export const routes: RouteObject[] = [
  {
    path: '/',
    // Every descendant of this branch - layout, pages, cards, empty states -
    // reads the resolved tenant and locale from `SiteProvider`. It is mounted
    // here rather than at the app root so the admin console cannot accidentally
    // inherit a public-site tenant, and so the provider's `window.location`
    // resolution runs only for the public tree.
    element: (
      <SiteProvider>
        <SiteLayout />
      </SiteProvider>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <SiteHomePage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'vision', element: <VisionPage /> },
      { path: 'work', element: <WorksPage /> },
      { path: 'work/:slug', element: <WorkDetailPage /> },
      // Phase 9: the evidence-backed summary of everything above.
      { path: 'transparency', element: <TransparencyPage /> },
      { path: 'achievements', element: <AchievementsPage /> },
      { path: 'achievements/:slug', element: <AchievementDetailPage /> },
      { path: 'news', element: <NewsPage /> },
      { path: 'news/:slug', element: <NewsDetailPage /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'events/:slug', element: <EventDetailPage /> },
      { path: 'gallery', element: <GalleryPage /> },
      { path: 'contact', element: <ContactPage /> },
      // Phase 5: the citizen's way in, and the way back to check on it.
      { path: 'feedback', element: <FeedbackPage /> },
      { path: 'track', element: <TrackIssuePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/admin',
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        // The CMS edits one language at a time; the choice lives above the
        // routes so it survives navigation between a list and an editor.
        element: (
          <CmsLocaleProvider>
            <AdminLayout />
          </CmsLocaleProvider>
        ),
        children: [
          {
            /*
             * Split with `React.lazy`, NOT the router's `lazy`.
             *
             * A `lazy` route makes the router resolve the chunk before it
             * renders the guard above it, so "checking your session" never
             * paints and the console opens blank. A lazy COMPONENT renders its
             * route element immediately and suspends inside the shell, so the
             * dashboard stays out of the bundle a citizen downloads from a QR
             * poster without costing the console its loading state.
             */
            index: true,
            element: (
              <Suspense fallback={<DashboardFallback />}>
                <AdminOverviewPage />
              </Suspense>
            ),
          },
          { path: 'forbidden', element: <ForbiddenPage /> },
          ...ADMIN_CONSOLE_ROUTES,
        ],
      },
    ],
  },
];
