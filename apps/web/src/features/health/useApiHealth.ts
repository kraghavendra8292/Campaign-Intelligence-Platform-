import { useCallback, useEffect, useState } from 'react';
import { HEALTH_QUERY, type HealthQueryResult } from '@rk/graphql';
import { GraphQLRequestError, graphqlRequest } from '../../lib/graphqlClient';

export type ApiHealthState =
  | { status: 'loading' }
  | { status: 'ready'; health: string }
  | { status: 'error'; message: string; correlationId?: string };

/**
 * Queries the API's GraphQL health field.
 *
 * This is the Phase 1 proof that the web application can reach the backend. It
 * also demonstrates the intended separation: data access lives in a hook, and
 * the component that renders it stays purely presentational.
 *
 * The effect deliberately never calls `setState` synchronously in its body -
 * the initial state is already `loading`, and `refetch` resets it from the
 * event handler - so a refetch cannot trigger a cascading render.
 */
export function useApiHealth(): { state: ApiHealthState; refetch: () => void } {
  const [state, setState] = useState<ApiHealthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    graphqlRequest<HealthQueryResult>(HEALTH_QUERY, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', health: data.health });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        if (error instanceof GraphQLRequestError) {
          setState({
            status: 'error',
            message: error.message,
            ...(error.correlationId ? { correlationId: error.correlationId } : {}),
          });
          return;
        }

        setState({ status: 'error', message: 'The API health check failed.' });
      });

    return () => controller.abort();
  }, [attempt]);

  const refetch = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  return { state, refetch };
}
