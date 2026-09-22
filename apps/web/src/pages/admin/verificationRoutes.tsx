import type { RouteObject } from 'react-router-dom';

/**
 * Verification console route, mounted under `/admin` inside the Phase 2 guard.
 *
 * Loaded on demand, matching every other admin console. The public transparency
 * and works pages are what a citizen loads from a QR poster on mobile data, and
 * they must not carry the staff console with them.
 */
export const VERIFICATION_ROUTES: RouteObject[] = [
  {
    path: 'verification',
    lazy: async () => {
      const { VerificationQueuePage } = await import('./verification/VerificationQueuePage');
      return { Component: VerificationQueuePage };
    },
  },
];
