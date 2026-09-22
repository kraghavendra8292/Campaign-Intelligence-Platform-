import { RouterProvider } from 'react-router-dom';
import { router } from './routes/router';
import { AuthProvider } from './features/auth/AuthProvider';

/**
 * Application root. Composition only - no layout, no data access.
 *
 * `AuthProvider` sits outside the router so session restoration runs once for
 * the whole app rather than per navigation.
 */
export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
