import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '@rk/ui';
import { LOCALES, type Locale } from '@rk/types';
import { useSite } from '../features/site/SiteContext';
import { usePublicQuery } from '../features/site/usePublicQuery';
import { SITE_QUERY } from '../features/site/queries';
import { useQrReferrerCapture } from '../features/site/useIssueSubmission';
import { MobileNavDrawer } from '../components/site/MobileNavDrawer';
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

  const { state } = usePublicQuery<{ publicSite: PublicOrganization }>(SITE_QUERY);
  const organization = state.status === 'success' ? state.data.publicSite : null;

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

  const siteName = organization?.name ?? 'RK Campaign';

  return (
    <div className="site">
      <a className="skip-link" href="#main-content">
        {t('nav.skip')}
      </a>

      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="site-brand" aria-label={siteName}>
            <span className="site-brand__mark" aria-hidden="true">
              RK
            </span>
            <span className="site-brand__name">{siteName}</span>
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
        siteName={siteName}
        toggleRef={toggleRef}
      />

      <main id="main-content" className="site-main">
        <Outlet />
      </main>

      <SiteFooter siteName={siteName} />
    </div>
  );
}

function SiteFooter({ siteName }: { siteName: string }) {
  const { t } = useSite();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <span className="site-brand__mark" aria-hidden="true">
            RK
          </span>
          <p className="site-footer__name">{siteName}</p>
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
          © {year} {siteName}. {t('footer.rights')}
        </p>
      </div>
    </footer>
  );
}
