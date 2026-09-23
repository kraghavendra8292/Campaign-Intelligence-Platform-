import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { LoadingState } from '@rk/ui';
import type { RouteObject } from 'react-router-dom';
import { SiteLayout } from '../layouts/SiteLayout';
import { SiteProvider } from '../features/site/SiteContext';
import { CmsLocaleProvider } from '../features/cms/CmsLocaleContext';
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
import { SiteHomePage } from '../pages/site/HomePage';

/**
 * Route definitions.
 *
 * Three trees, in order of who they serve:
 *
 *   `/`       the public candidate website - anonymous, read-only
 *   `/login`  authentication
 *   `/admin`  the campaign console and CMS, behind the Phase 2 route guard
 *
 * The homepage stays eager so first paint on 2G is one graphQL round-trip away.
 * Every other public page is `React.lazy`-split. Suspense lives in `SiteLayout`.
 */

function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): ComponentType {
  return lazy(async () => ({ default: (await load())[name] }));
}

function Suspend({ children, title = 'Loading' }: { children: ReactNode; title?: string }) {
  return <Suspense fallback={<LoadingState title={title} />}>{children}</Suspense>;
}

const AboutPage = lazyPage(() => import('../pages/site/ContentPages'), 'AboutPage');
const VisionPage = lazyPage(() => import('../pages/site/ContentPages'), 'VisionPage');
const WorksPage = lazyPage(() => import('../pages/site/WorksPage'), 'WorksPage');
const WorkDetailPage = lazyPage(() => import('../pages/site/WorksPage'), 'WorkDetailPage');
const TransparencyPage = lazyPage(() => import('../pages/site/TransparencyPage'), 'TransparencyPage');
const AchievementsPage = lazyPage(() => import('../pages/site/ListingPages'), 'AchievementsPage');
const AchievementDetailPage = lazyPage(
  () => import('../pages/site/DetailPages'),
  'AchievementDetailPage',
);
const NewsPage = lazyPage(() => import('../pages/site/ListingPages'), 'NewsPage');
const NewsDetailPage = lazyPage(() => import('../pages/site/DetailPages'), 'NewsDetailPage');
const EventsPage = lazyPage(() => import('../pages/site/ListingPages'), 'EventsPage');
const EventDetailPage = lazyPage(() => import('../pages/site/DetailPages'), 'EventDetailPage');
const GalleryPage = lazyPage(() => import('../pages/site/ContentPages'), 'GalleryPage');
const ContactPage = lazyPage(() => import('../pages/site/ContentPages'), 'ContactPage');
const FeedbackPage = lazyPage(() => import('../pages/site/FeedbackPage'), 'FeedbackPage');
const TrackIssuePage = lazyPage(() => import('../pages/site/TrackIssuePage'), 'TrackIssuePage');
const SearchPage = lazyPage(() => import('../pages/site/ContentPages'), 'SearchPage');
const PrivacyPage = lazyPage(() => import('../pages/site/ContentPages'), 'PrivacyPage');
const TermsPage = lazyPage(() => import('../pages/site/ContentPages'), 'TermsPage');
const NotFoundPage = lazyPage(() => import('../pages/NotFoundPage'), 'NotFoundPage');

const AdminLayout = lazy(() =>
  import('../layouts/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const LoginPage = lazy(() =>
  import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const AdminOverviewPage = lazy(() =>
  import('../pages/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })),
);
const ForbiddenPage = lazy(() =>
  import('../pages/admin/ForbiddenPage').then((m) => ({ default: m.ForbiddenPage })),
);

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
      { path: 'transparency', element: <TransparencyPage /> },
      { path: 'achievements', element: <AchievementsPage /> },
      { path: 'achievements/:slug', element: <AchievementDetailPage /> },
      { path: 'news', element: <NewsPage /> },
      { path: 'news/:slug', element: <NewsDetailPage /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'events/:slug', element: <EventDetailPage /> },
      { path: 'gallery', element: <GalleryPage /> },
      { path: 'contact', element: <ContactPage /> },
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
    element: (
      <Suspend>
        <LoginPage />
      </Suspend>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/admin',
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: (
          <CmsLocaleProvider>
            <Suspend title="Loading console">
              <AdminLayout />
            </Suspend>
          </CmsLocaleProvider>
        ),
        children: [
          {
            index: true,
            element: (
              <Suspend>
                <AdminOverviewPage />
              </Suspend>
            ),
          },
          {
            path: 'forbidden',
            element: (
              <Suspend>
                <ForbiddenPage />
              </Suspend>
            ),
          },
          ...ADMIN_CONSOLE_ROUTES,
        ],
      },
    ],
  },
];
