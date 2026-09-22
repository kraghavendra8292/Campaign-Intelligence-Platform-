import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { ErrorState } from '@rk/ui';

/**
 * Catches render and loader failures for a route subtree.
 *
 * The underlying error is never rendered: it can contain internal detail and
 * would be meaningless to a citizen. It is logged to the console for the
 * developer and replaced with a safe message for the user.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  if (import.meta.env.DEV) {
    // Developer diagnostics only; never shown to the user.
    console.error('Route error:', error);
  }

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Something went wrong';

  return (
    <section className="section">
      <div className="section__inner">
        <ErrorState
          title={title}
          description="This page could not be displayed. Please reload and try again."
          onRetry={() => window.location.reload()}
          retryLabel="Reload"
        />
      </div>
    </section>
  );
}
