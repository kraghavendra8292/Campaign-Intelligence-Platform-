import type { RouteObject } from 'react-router-dom';

/**
 * Loads one exported page component as a route.
 *
 * Every CMS screen is code-split: the public site must not ship the editing
 * console, and a citizen on mobile data opening the feedback form must not pay
 * for screens they can never reach.
 */
function page<K extends string>(
  load: () => Promise<Record<K, React.ComponentType>>,
  name: K,
): () => Promise<{ Component: React.ComponentType }> {
  return async () => ({ Component: (await load())[name] });
}

/**
 * CMS routes, mounted under `/admin` inside the Phase 2 route guard.
 *
 * No per-route permission gate: the guard establishes that the user is signed
 * in, and each screen renders what the API allows. A CMS user without
 * CONTENT_READ_UNPUBLISHED sees an explanatory message from `CmsBoundary`
 * rather than being bounced to a generic forbidden page, which is more useful
 * and keeps the API as the single authority on access.
 */
export const CMS_ROUTES: RouteObject[] = [
  {
    path: 'content/candidate',
    lazy: page(() => import('./cms/SiteContentPages'), 'CmsCandidatePage'),
  },
  { path: 'content/vision', lazy: page(() => import('./cms/SiteContentPages'), 'CmsVisionPage') },
  {
    path: 'content/priorities',
    lazy: page(() => import('./cms/CollectionsPages'), 'CmsPrioritiesPage'),
  },

  { path: 'content/projects', lazy: page(() => import('./cms/ProjectsPages'), 'CmsProjectsPage') },
  {
    path: 'content/projects/new',
    lazy: page(() => import('./cms/ProjectsPages'), 'CmsProjectFormPage'),
  },
  {
    path: 'content/projects/:id',
    lazy: page(() => import('./cms/ProjectsPages'), 'CmsProjectFormPage'),
  },

  {
    path: 'content/achievements',
    lazy: page(() => import('./cms/AchievementsPages'), 'CmsAchievementsPage'),
  },
  {
    path: 'content/achievements/new',
    lazy: page(() => import('./cms/AchievementsPages'), 'CmsAchievementFormPage'),
  },
  {
    path: 'content/achievements/:id',
    lazy: page(() => import('./cms/AchievementsPages'), 'CmsAchievementFormPage'),
  },

  { path: 'content/news', lazy: page(() => import('./cms/EditorialPages'), 'CmsNewsPage') },
  { path: 'content/news/new', lazy: page(() => import('./cms/EditorialPages'), 'CmsNewsFormPage') },
  { path: 'content/news/:id', lazy: page(() => import('./cms/EditorialPages'), 'CmsNewsFormPage') },

  { path: 'content/events', lazy: page(() => import('./cms/EditorialPages'), 'CmsEventsPage') },
  {
    path: 'content/events/new',
    lazy: page(() => import('./cms/EditorialPages'), 'CmsEventFormPage'),
  },
  {
    path: 'content/events/:id',
    lazy: page(() => import('./cms/EditorialPages'), 'CmsEventFormPage'),
  },

  { path: 'content/gallery', lazy: page(() => import('./cms/CollectionsPages'), 'CmsGalleryPage') },
  { path: 'content/media', lazy: page(() => import('./cms/CollectionsPages'), 'CmsMediaPage') },
  { path: 'content/contact', lazy: page(() => import('./cms/SiteContentPages'), 'CmsContactPage') },
];
