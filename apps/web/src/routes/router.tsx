import { createBrowserRouter } from 'react-router-dom';
import { routes } from './routes';

/**
 * The browser router used by the running application.
 *
 * A browser router reads the URL from `window.history` once, at creation, so
 * it is instantiated here rather than inside a component - and tests use
 * `createMemoryRouter(routes, ...)` instead of driving this one.
 */
export const router = createBrowserRouter(routes);
