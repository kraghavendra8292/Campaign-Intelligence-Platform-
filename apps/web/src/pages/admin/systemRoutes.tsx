import type { RouteObject } from 'react-router-dom';

/**
 * Operations route, mounted under `/admin` inside the Phase 2 guard.
 *
 * Lazy like every other admin console: an operations page is opened rarely and
 * must not be part of the bundle a citizen downloads from a QR poster.
 */
export const SYSTEM_ROUTES: RouteObject[] = [
  {
    path: 'system',
    lazy: async () => {
      const { SystemStatusPage } = await import('./system/SystemStatusPage');
      return { Component: SystemStatusPage };
    },
  },
];
