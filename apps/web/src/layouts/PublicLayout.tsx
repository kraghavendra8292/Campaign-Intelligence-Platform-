import { Link, NavLink, Outlet } from 'react-router-dom';
import { env } from '../config/env';

/**
 * Shell for the citizen-facing public website.
 *
 * Mobile-first: navigation wraps rather than collapsing behind a menu, which
 * keeps Phase 1 free of interaction state it does not yet need.
 */
export function PublicLayout() {
  return (
    <div className="layout">
      {/* Keyboard users can jump straight past the navigation. */}
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="public-header">
        <div className="public-header__inner">
          <Link to="/" className="brand" aria-label={`${env.VITE_APP_NAME} home`}>
            <span className="brand__mark" aria-hidden="true">
              RK
            </span>
            <span className="brand__name">{env.VITE_APP_NAME}</span>
          </Link>

          <nav className="public-nav" aria-label="Primary">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/admin" className={navLinkClass}>
              Campaign console
            </NavLink>
          </nav>
        </div>
      </header>

      <main id="main-content" className="public-main">
        <Outlet />
      </main>

      <footer className="public-footer">
        <p>{env.VITE_APP_NAME} — Phase 1 foundation. No campaign content is published yet.</p>
      </footer>
    </div>
  );
}

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'public-nav__link public-nav__link--active' : 'public-nav__link';
}
