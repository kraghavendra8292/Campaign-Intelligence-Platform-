import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, graphqlRequest } from '../auth/authClient';

/**
 * Authenticated GraphQL access for every admin console feature.
 *
 * These were introduced for the Phase 3 CMS and moved here in Phase 4, when a
 * second feature needed them: nothing about them is CMS-specific, and a QR page
 * importing `useCmsQuery` would have implied a dependency that does not exist.
 * `features/cms/useCms.ts` re-exports them so Phase 3 call sites are unchanged.
 *
 * Requests carry the session's access token and the tenant header, which
 * `authClient` attaches - so no admin screen can accidentally query without a
 * tenant, and none has to remember to pass one.
 */

export type AdminQueryState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string; code: string };

type SettledState<T> =
  { status: 'success'; data: T } | { status: 'error'; message: string; code: string };

/**
 * "Loading" is derived, not assigned: each result is tagged with the request
 * key that produced it, and anything whose key no longer matches renders as
 * loading. That keeps the effect free of a synchronous `setState` (which forces
 * an extra render pass before paint) and guarantees that changing a filter can
 * never briefly show the previous list as if it were the new one.
 */
export function useAdminQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { skip?: boolean } = {},
): { state: AdminQueryState<T>; refetch: () => void } {
  const [settled, setSettled] = useState<{ key: string; value: SettledState<T> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const serialized = JSON.stringify(variables);
  const key = `${query}|${serialized}|${attempt}`;
  const latestKey = useRef(key);

  useEffect(() => {
    if (options.skip) return;

    const controller = new AbortController();
    latestKey.current = key;

    graphqlRequest<T>(query, {
      variables: JSON.parse(serialized) as Record<string, unknown>,
      signal: controller.signal,
    })
      .then((data) => {
        // Drop a slow response that a newer request has already superseded.
        if (controller.signal.aborted || latestKey.current !== key) return;
        setSettled({ key, value: { status: 'success', data } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || latestKey.current !== key) return;

        if (error instanceof ApiError) {
          setSettled({
            key,
            value: { status: 'error', message: error.message, code: error.code },
          });
          return;
        }

        setSettled({
          key,
          value: { status: 'error', message: 'Could not load.', code: 'NETWORK_ERROR' },
        });
      });

    return () => controller.abort();
  }, [key, query, serialized, options.skip]);

  const refetch = useCallback(() => setAttempt((value) => value + 1), []);

  const state: AdminQueryState<T> =
    settled && settled.key === key ? settled.value : { status: 'loading' };

  return { state, refetch };
}

export interface MutationState {
  submitting: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
}

/**
 * Runs a mutation and tracks its lifecycle.
 *
 * Field-level errors are extracted from the API's `details.field`, so a
 * validation failure highlights the offending input instead of only showing a
 * banner the user then has to map onto a form by hand.
 */
export function useAdminMutation<TResult, TVariables extends Record<string, unknown>>(
  mutation: string,
): {
  run: (variables: TVariables) => Promise<TResult | null>;
  state: MutationState;
  reset: () => void;
} {
  const [state, setState] = useState<MutationState>({
    submitting: false,
    error: null,
    fieldErrors: {},
  });

  const reset = useCallback(
    () => setState({ submitting: false, error: null, fieldErrors: {} }),
    [],
  );

  const run = useCallback(
    async (variables: TVariables): Promise<TResult | null> => {
      setState({ submitting: true, error: null, fieldErrors: {} });

      try {
        const result = await graphqlRequest<TResult>(mutation, { variables });
        setState({ submitting: false, error: null, fieldErrors: {} });
        return result;
      } catch (error) {
        if (error instanceof ApiError) {
          const field = error.details?.field;

          setState({
            submitting: false,
            error: error.message,
            fieldErrors: typeof field === 'string' ? { [field]: error.message } : {},
          });
        } else {
          setState({
            submitting: false,
            error: 'Could not save. Please check your connection and try again.',
            fieldErrors: {},
          });
        }

        return null;
      }
    },
    [mutation],
  );

  return { run, state, reset };
}
