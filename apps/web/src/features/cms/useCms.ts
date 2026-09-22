import { useEffect } from 'react';
import {
  useAdminMutation,
  useAdminQuery,
  type AdminQueryState,
  type MutationState,
} from '../admin/adminApi';

/**
 * CMS data access.
 *
 * The query and mutation hooks themselves live in `features/admin/adminApi.ts`
 * since Phase 4, when the QR console needed the same authenticated GraphQL
 * plumbing. They are re-exported here under their original names so every
 * Phase 3 call site keeps working and nothing about the CMS had to change to
 * accommodate a second consumer.
 */

export type CmsQueryState<T> = AdminQueryState<T>;
export type { MutationState };

export const useCmsQuery = useAdminQuery;
export const useCmsMutation = useAdminMutation;

/**
 * Warns before leaving a form with unsaved changes.
 *
 * Uses `beforeunload`, which covers tab closes, reloads and navigation away
 * from the app, because losing twenty minutes of drafting to a stray click is
 * the single most common way a CMS loses a user's trust.
 *
 * It does NOT cover in-app route changes - `beforeunload` never fires for
 * those. Guarding them needs a router-level block, which is not implemented
 * here; editor screens confirm destructive navigation on the Cancel action
 * instead.
 */
export function useUnsavedChangesWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers ignore custom text now, but a non-empty return still triggers
      // the native confirmation.
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
