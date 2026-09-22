import { useCallback, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Icon } from '@rk/ui';
import { useAuth } from '../features/auth/AuthProvider';
import { AdminSidebar, DESKTOP_SIDEBAR_QUERY } from '../components/admin/AdminSidebar';
import { AdminLanguageSelect } from '../components/admin/AdminLanguageSelect';
import { AdminI18nProvider, useAdminI18n } from '../features/admin/AdminI18nContext';
import { useMediaQuery } from '../lib/useMediaQuery';

/**
 * Shell for the authenticated campaign console.
 *
 * A permanent sidebar from `lg` up; below it, a drawer that starts CLOSED and
 * is opened from the topbar. The navigation itself lives in `AdminSidebar` and
 * its structure in `config/adminNav.ts`.
 *
 * Mounted behind `ProtectedRoute`, so it renders only for a signed-in user.
 * That guard governs rendering; the API authorises every query independently.
 */
const SIDEBAR_ID = 'admin-sidebar';

/**
 * The provider wraps the whole console, so the sidebar, the topbar and every
 * routed page below read one language from one place.
 */
export function AdminLayout() {
  return (
    <AdminI18nProvider>
      <AdminConsole />
    </AdminI18nProvider>
  );
}

function AdminConsole() {
  const { viewer, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isDesktop = useMediaQuery(DESKTOP_SIDEBAR_QUERY, true);

  const { t } = useAdminI18n();

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  /*
   * A route change closes the drawer.
   *
   * The links close it on click, but that only covers navigation that starts
   * inside it - a redirect or the back button would otherwise leave the drawer
   * over a page nobody opened it on. Adjusted during render rather than in an
   * effect so the drawer never paints open over the new page.
   */
  const [renderedPath, setRenderedPath] = useState(location.pathname);
  if (renderedPath !== location.pathname) {
    setRenderedPath(location.pathname);
    setMenuOpen(false);
  }

  /*
   * Crossing to desktop width turns the drawer back into a column.
   *
   * Left open, it would reappear as an open drawer the moment the window
   * narrowed again - a menu the reader never asked for. Adjusted during render
   * rather than from an effect, so there is no second pass to flash through.
   */
  const [wasDesktop, setWasDesktop] = useState(isDesktop);
  if (wasDesktop !== isDesktop) {
    setWasDesktop(isDesktop);
    if (isDesktop) setMenuOpen(false);
  }

  async function handleSignOut(): Promise<void> {
    await signOut();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="admin-layout">
      <a className="skip-link" href="#admin-content">
        {t('console.skip')}
      </a>

      <AdminSidebar id={SIDEBAR_ID} open={menuOpen} onClose={closeMenu} toggleRef={toggleRef} />

      <div className="admin-content-wrapper">
        <header className="admin-topbar">
          <div className="admin-topbar__lead">
            {/* Hidden from `lg` up, where the sidebar is always on screen. */}
            <button
              type="button"
              className="admin-topbar__menu"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls={SIDEBAR_ID}
              aria-label={t('nav.open')}
              ref={toggleRef}
            >
              <Icon name="menu" size={1.35} />
            </button>

            <h1 className="admin-topbar__title">{t('console.title')}</h1>
          </div>

          <div className="admin-topbar__account">
            {viewer?.organization ? <Badge tone="neutral">{viewer.organization.name}</Badge> : null}
            <span className="admin-topbar__email">{viewer?.user.email}</span>
            <AdminLanguageSelect />
            <Button variant="secondary" size="sm" onClick={() => void handleSignOut()}>
              {t('console.signOut')}
            </Button>
          </div>
        </header>

        <main id="admin-content" className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
