import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '@rk/ui';
import { LOCALES, type Locale } from '@rk/types';
import { useSite } from '../features/site/SiteContext';
import { usePublicQuery } from '../features/site/usePublicQuery';
import { SITE_QUERY } from '../features/site/queries';
import { useQrReferrerCapture } from '../features/site/useIssueSubmission';
import { MobileNavDrawer } from '../components/site/MobileNavDrawer';
import { SiteFeedbackPrompt } from '../components/site/SiteFeedbackPrompt';
import { PRIMARY_NAV_ITEMS } from '../config/siteNav';
import type { PublicOrganization } from '../features/site/types';

/**
 * Public website shell.
 *
 * Mobile-first: the header is a compact bar - brand, search, language, menu -
 * and the navigation lives in a drawer that is CLOSED on load. From `2xl` up
 * the drawer is gone entirely and navigation is a horizontal bar.
 */

const MOBILE_NAV_ID = 'site-mobile-nav';

/**
 * The width at which the desktop bar replaces the drawer.
 *
 * Must stay in step with the matching `@media (min-width: 1536px)` block in
 * site.css - the stylesheet decides what is on screen, and this only keeps the
 * open/closed STATE honest when the viewport crosses that line.
 */
const DESKTOP_NAV_QUERY = '(min-width: 1536px)';

export function SiteLayout() {
  const { t, locale, setLocale } = useSite();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  /*
   * Remembers which printed QR code brought this visitor, for this tab only.
   *
   * Mounted on the SHELL rather than on the feedback page, because a scan lands
   * on a content page - "/work/road-project?rk_qr=…" - and the citizen only
   * navigates to the form afterwards, by which point the query string is gone.
   *
   * Session-scoped, so it is forgotten when the tab closes and never follows
   * anybody between visits. It records which poster worked, never anything
   * about the person who scanned it.
   */
  useQrReferrerCapture();

  // Keep the public site query warm so org-scoped pages share a cached shell response.
  usePublicQuery<{ publicSite: PublicOrganization }>(SITE_QUERY);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  /*
   * A route change always closes the drawer.
   *
   * The links close it themselves on click, but that only covers navigation
   * that STARTS in the drawer. Back/forward, a redirect, or a programmatic
   * navigation would otherwise leave the overlay sitting over a page the
   * visitor never asked to see it on.
   *
   * Adjusted during render rather than from an effect: React finishes this
   * render before committing, so the drawer never paints open over the new
   * page and there is no second pass to flash through.
   */
  const [renderedPath, setRenderedPath] = useState(location.pathname);
  if (renderedPath !== location.pathname) {
    setRenderedPath(location.pathname);
    setMenuOpen(false);
  }

  /*
   * Growing past the drawer's breakpoint closes it.
   *
   * The drawer is display:none from `2xl` up, so a menu left open while a
   * window is widened would vanish visually while the scroll lock and
   * `aria-expanded` stayed on - state disagreeing with what is on screen.
   */
  useEffect(() => {
    // Feature-detected rather than assumed: this is a progressive nicety, and
    // no environment without `matchMedia` should lose the drawer over it.
    if (!menuOpen || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(DESKTOP_NAV_QUERY);
    const onChange = () => {
      if (query.matches) setMenuOpen(false);
    };

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [menuOpen]);

  // New pages should open at the top. Work-detail feed URL sync opts out via
  // `state.preserveScroll` so scrolling through works does not jump.
  useEffect(() => {
    const state = location.state as { preserveScroll?: boolean } | null;
    if (state?.preserveScroll) return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname, location.key, location.state]);

  const brandLabel = t('home.identity');
  const brandName = t('home.identityName');
  const brandRole = t('home.identityRole');

  return (
    <div className="site">
      <a className="skip-link" href="#main-content">
        {t('nav.skip')}
      </a>

      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="site-brand" aria-label={brandLabel}>
            <span className="site-brand__mark" aria-hidden="true">
              <VidhanaSoudhaIcon />
            </span>
            <span className="site-brand__text">
              <span className="site-brand__name">{brandName}</span>
              <span className="site-brand__role">{brandRole}</span>
            </span>
          </Link>

          <nav className="site-nav site-nav--desktop" aria-label={t('nav.primary')}>
            {PRIMARY_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>

          <div className="site-header__actions">
            <Link to="/search" className="site-icon-button" aria-label={t('nav.search')}>
              <Icon name="search" size={1.25} />
            </Link>

            <label className="site-locale">
              <span className="visually-hidden">Language</span>
              <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
                {LOCALES.map((value) => (
                  <option key={value} value={value}>
                    {value === 'en' ? 'English' : 'ಕನ್ನಡ'}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="site-icon-button site-nav__toggle"
              aria-expanded={menuOpen}
              aria-controls={MOBILE_NAV_ID}
              onClick={() => setMenuOpen((open) => !open)}
              ref={toggleRef}
            >
              {/*
                The label stays put and `aria-expanded` carries the state, as a
                disclosure button should. The icon does not morph into an X
                either, because the open drawer covers this button with its
                scrim - the close affordance the visitor can actually reach is
                the one inside the drawer.
              */}
              <span className="visually-hidden">{t('nav.menu')}</span>
              <Icon name="menu" size={1.35} />
            </button>
          </div>
        </div>
      </header>

      <MobileNavDrawer
        id={MOBILE_NAV_ID}
        open={menuOpen}
        onClose={closeMenu}
        siteName={brandLabel}
        toggleRef={toggleRef}
      />

      <main id="main-content" className="site-main">
        <Outlet />
      </main>

      <SiteFeedbackPrompt />

      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  const { t } = useSite();
  const year = new Date().getFullYear();
  const brandLabel = t('home.identity');
  const brandName = t('home.identityName');
  const brandRole = t('home.identityRole');

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <span className="site-brand__mark" aria-hidden="true">
            <VidhanaSoudhaIcon />
          </span>
          <p className="site-footer__name">{brandName}</p>
          <p className="site-footer__role">{brandRole}</p>
          <p className="site-footer__note">{t('footer.demoNotice')}</p>
        </div>

        <nav className="site-footer__links" aria-label={t('footer.quickLinks')}>
          <h2 className="site-footer__heading">{t('footer.quickLinks')}</h2>
          <Link to="/work">{t('nav.work')}</Link>
          <Link to="/achievements">{t('nav.achievements')}</Link>
          <Link to="/news">{t('nav.news')}</Link>
          <Link to="/events">{t('nav.events')}</Link>
          <Link to="/gallery">{t('nav.gallery')}</Link>
        </nav>

        <nav className="site-footer__links" aria-label={t('footer.legal')}>
          <h2 className="site-footer__heading">{t('footer.legal')}</h2>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/contact">{t('nav.contact')}</Link>
        </nav>
      </div>

      <div className="site-footer__bottom">
        <p>
          © {year} {brandLabel}. {t('footer.rights')}
        </p>
      </div>
    </footer>
  );
}

/** Simplified Vidhana Soudha silhouette for the site brand mark. */
function VidhanaSoudhaIcon() {
  return (
    <svg
      className="site-brand__icon"
      viewBox="0 0 48 48"
      width="28"
      height="28"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      aria-hidden="true"
    >
      {/* Central dome + finial */}
      <circle cx="24" cy="8.5" r="1.4" />
      <path d="M24 5.5c0 0 0-1.5 0-1.5M22.8 10.2c.4-.7 1.2-1.1 2.2-1.1s1.8.4 2.2 1.1c.3.5-.1 1.1-.7 1.1h-3c-.6 0-1-.6-.7-1.1Z" />
      <path d="M18 12.5h12l1.5 3.5H16.5L18 12.5Z" />
      {/* Upper attic */}
      <rect x="14" y="16" width="20" height="3.5" rx="0.6" />
      {/* Main colonnade body */}
      <rect x="11" y="20" width="26" height="16" rx="0.8" />
      {/* Columns */}
      <rect x="14" y="21.5" width="2.2" height="13" rx="0.4" opacity="0.35" />
      <rect x="18.6" y="21.5" width="2.2" height="13" rx="0.4" opacity="0.35" />
      <rect x="23.2" y="21.5" width="2.2" height="13" rx="0.4" opacity="0.35" />
      <rect x="27.8" y="21.5" width="2.2" height="13" rx="0.4" opacity="0.35" />
      <rect x="32.4" y="21.5" width="2.2" height="13" rx="0.4" opacity="0.35" />
      {/* Side wings */}
      <rect x="5" y="24" width="6" height="12" rx="0.6" />
      <rect x="37" y="24" width="6" height="12" rx="0.6" />
      {/* Base plinth */}
      <rect x="3.5" y="36" width="41" height="3" rx="0.5" />
      <rect x="2" y="39.5" width="44" height="3" rx="0.6" />
    </svg>
  );
}
