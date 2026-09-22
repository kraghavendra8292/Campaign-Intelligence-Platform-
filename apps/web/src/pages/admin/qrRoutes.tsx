import type { RouteObject } from 'react-router-dom';

/**
 * QR console routes, mounted under `/admin` inside the Phase 2 route guard.
 *
 * Loaded on demand, so the public site does not ship the staff console. The
 * guard runs first, so an anonymous visitor never fetches these chunks.
 *
 * No per-route permission gate, matching the CMS: the guard establishes that
 * the user is signed in, and each screen renders what the API allows. A user
 * without QR_ANALYTICS_READ gets an explanatory message from `QrBoundary`
 * rather than being bounced to a generic forbidden page - which is more useful
 * and keeps the API as the single authority on access.
 *
 * ORDER MATTERS. `qr-campaigns/new` is declared before `qr-campaigns/:campaignId`
 * so "new" is not swallowed as an id.
 */
function page<K extends string>(
  load: () => Promise<Record<K, React.ComponentType>>,
  name: K,
): () => Promise<{ Component: React.ComponentType }> {
  return async () => ({ Component: (await load())[name] });
}

export const QR_ROUTES: RouteObject[] = [
  {
    path: 'qr-campaigns',
    lazy: page(() => import('./qr/QrCampaignsPage'), 'QrCampaignsPage'),
  },
  {
    path: 'qr-campaigns/new',
    lazy: page(() => import('./qr/QrCampaignFormPage'), 'QrCampaignFormPage'),
  },
  {
    path: 'qr-campaigns/:id/edit',
    lazy: page(() => import('./qr/QrCampaignFormPage'), 'QrCampaignFormPage'),
  },
  {
    path: 'qr-campaigns/:campaignId',
    lazy: page(() => import('./qr/QrCampaignDetailPage'), 'QrCampaignDetailPage'),
  },
  {
    path: 'qr-campaigns/:campaignId/analytics',
    lazy: page(() => import('./qr/QrAnalyticsPage'), 'QrCampaignAnalyticsPage'),
  },
  {
    path: 'qr-campaigns/:campaignId/qr/new',
    lazy: page(() => import('./qr/QrCodeFormPage'), 'QrCodeFormPage'),
  },
  {
    path: 'qr-campaigns/:campaignId/qr/:qrId',
    lazy: page(() => import('./qr/QrCodeDetailPage'), 'QrCodeDetailPage'),
  },
  {
    path: 'qr-campaigns/:campaignId/qr/:qrId/edit',
    lazy: page(() => import('./qr/QrCodeFormPage'), 'QrCodeFormPage'),
  },
  {
    path: 'qr-campaigns/:campaignId/qr/:qrId/print',
    lazy: page(() => import('./qr/QrPrintSheetPage'), 'QrPrintSheetPage'),
  },
  {
    path: 'qr-campaigns/:campaignId/qr/:qrId/analytics',
    lazy: page(() => import('./qr/QrAnalyticsPage'), 'QrCodeAnalyticsPage'),
  },
  {
    path: 'qr-analytics',
    lazy: page(() => import('./qr/QrAnalyticsPage'), 'QrOverviewAnalyticsPage'),
  },
];
