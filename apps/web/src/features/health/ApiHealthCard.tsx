import { Badge, Card, CardBody, CardHeader, ErrorState, Spinner } from '@rk/ui';
import { useApiHealth } from './useApiHealth';

/**
 * Renders live API connectivity.
 *
 * Presentation only - every fetch concern lives in `useApiHealth`.
 */
export function ApiHealthCard() {
  const { state, refetch } = useApiHealth();

  return (
    <Card>
      <CardHeader
        title="API connectivity"
        description="Live result of the GraphQL health query against the backend."
      />
      <CardBody>
        {state.status === 'loading' ? (
          <span className="health-row">
            <Spinner size="sm" label="Checking the API" />
            <span className="health-row__text">Checking…</span>
          </span>
        ) : null}

        {state.status === 'ready' ? (
          <span className="health-row">
            <Badge tone="success" withDot>
              {state.health}
            </Badge>
            <span className="health-row__text">
              The web application reached the GraphQL API successfully.
            </span>
          </span>
        ) : null}

        {state.status === 'error' ? (
          <ErrorState
            title="Cannot reach the API"
            description={`${state.message} Start the backend with "npm run dev:api".`}
            {...(state.correlationId ? { correlationId: state.correlationId } : {})}
            onRetry={refetch}
          />
        ) : null}
      </CardBody>
    </Card>
  );
}
