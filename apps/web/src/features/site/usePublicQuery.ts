import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, graphqlRequest } from '../auth/authClient';
import { useSite } from './SiteContext';

/**
 * Data loading for public pages.
 *
 * Every public page needs the same four states - loading, success, empty and
 * error - so the hook models them explicitly rather than leaving components to
 * juggle `data === undefined` against `error === null`. A page that forgets a
 * state is the usual cause of a blank screen.
 *
 * The site slug and locale are injected here, so no page has to remember to
 * pass them and none can accidentally query the wrong tenant.
 *
 * "Loading" is DERIVED rather than assigned. Each result is stored with the
 * request key that produced it, and anything whose key does not match the
 * current one renders as loading. That avoids a synchronous `setState` inside
 * the effect - which React flags because it causes a second render pass before
 * paint - and it fixes a subtler bug for free: when the variables change, the
 * previous result is never briefly shown as if it were the new one.
 */

export type QueryState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string; code: string };

export interface PublicQueryResult<T> {
  state: QueryState<T>;
  refetch: () => void;
}

type Settled<T> =
  { status: 'success'; data: T } | { status: 'error'; message: string; code: string };

export function usePublicQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { skip?: boolean } = {},
): PublicQueryResult<T> {
  const { organizationSlug, locale } = useSite();
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; value: Settled<T> } | null>(null);

  // Serialised so the effect re-runs on value changes rather than on every
  // render, without the caller having to memoise the object.
  const serialized = JSON.stringify(variables);
  const key = `${query}|${serialized}|${organizationSlug ?? ''}|${locale}|${attempt}`;
  const latestKey = useRef(key);

  useEffect(() => {
    if (options.skip) return;

    const controller = new AbortController();
    latestKey.current = key;

    graphqlRequest<T>(query, {
      variables: {
        ...(JSON.parse(serialized) as Record<string, unknown>),
        input: { organizationSlug, locale },
      },
      signal: controller.signal,
      // The public site is anonymous; a 401 here must not trigger a token
      // refresh cycle intended for the admin app.
      skipAuthRetry: true,
    })
      .then((data) => {
        // Ignore a slow response that a newer request has superseded.
        if (controller.signal.aborted || latestKey.current !== key) return;
        setSettled({ key, value: { status: 'success', data } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || latestKey.current !== key) return;
        // A superseded request can surface as AbortError after the signal flip;
        // never paint that as a user-facing failure.
        if (error instanceof DOMException && error.name === 'AbortError') return;

        if (error instanceof ApiError) {
          setSettled({
            key,
            value: { status: 'error', message: error.message, code: error.code },
          });
          return;
        }

        setSettled({
          key,
          value: {
            status: 'error',
            message: 'This content could not be loaded.',
            code: 'NETWORK_ERROR',
          },
        });
      });

    return () => controller.abort();
  }, [key, query, serialized, organizationSlug, locale, options.skip]);

  const refetch = useCallback(() => setAttempt((value) => value + 1), []);

  const state: QueryState<T> =
    settled && settled.key === key ? settled.value : { status: 'loading' };

  return { state, refetch };
}
