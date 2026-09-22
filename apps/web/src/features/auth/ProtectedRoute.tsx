import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Permission } from '@rk/types';
import { LoadingState } from '@rk/ui';
import { useAuth } from './AuthProvider';

export interface ProtectedRouteProps {
  /** Optional permission gate for a subtree. */
  requirePermission?: Permission;
}

/**
 * Route guard.
 *
 * This hides UI; it does not protect data. Every query behind it is
 * independently authorised by the API, so a user who bypasses this guard sees
 * an empty shell and a string of authorization errors - not somebody else's
 * records. Treating it as a security boundary would be the classic mistake.
 */
export function ProtectedRoute({ requirePermission }: ProtectedRouteProps) {
  const { status, can } = useAuth();
  const location = useLocation();

  if (status === 'initialising') {
    return <LoadingState title="Checking your session" />;
  }

  if (status === 'anonymous') {
    // `state.from` lets the login page return the user where they were headed.
    // `replace` keeps the guarded URL out of history, so Back does not bounce.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requirePermission && !can(requirePermission)) {
    return <Navigate to="/admin/forbidden" replace />;
  }

  return <Outlet />;
}
