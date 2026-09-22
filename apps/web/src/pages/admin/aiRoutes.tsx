import type { RouteObject } from 'react-router-dom';

/**
 * AI console routes, mounted under `/admin` inside the Phase 2 route guard.
 *
 * Loaded on demand, matching the CMS, QR and issue consoles. The citizen-facing
 * bundle must not carry admin screens, and this one in particular is only ever
 * opened by a handful of staff.
 *
 * No per-route permission gate, matching every other admin console: the guard
 * establishes that the user is signed in, and the screen renders what the API
 * allows. A user without AI permissions sees the page's access error rather
 * than a redirect, which tells them what they are missing.
 */
export const AI_ROUTES: RouteObject[] = [
  {
    path: 'ai-insights',
    lazy: async () => {
      const { AiInsightsPage } = await import('./ai/AiInsightsPage');
      return { Component: AiInsightsPage };
    },
  },
];
