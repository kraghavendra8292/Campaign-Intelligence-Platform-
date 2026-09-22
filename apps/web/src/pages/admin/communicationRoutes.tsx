import type { RouteObject } from 'react-router-dom';

/**
 * Communication centre route, mounted under `/admin` inside the Phase 2 guard.
 *
 * Loaded on demand, matching every other admin console. The public tracking
 * page is what a citizen loads on mobile data, and it must not carry the staff
 * console with it.
 */
export const COMMUNICATION_ROUTES: RouteObject[] = [
  {
    path: 'communications',
    lazy: async () => {
      const { CommunicationCenterPage } = await import('./communications/CommunicationCenterPage');
      return { Component: CommunicationCenterPage };
    },
  },
];
