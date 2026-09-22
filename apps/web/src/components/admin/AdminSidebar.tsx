import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Badge, Icon } from '@rk/ui';
import { env } from '../../config/env';
import { ADMIN_NAV } from '../../config/adminNav';
import { useAdminI18n } from '../../features/admin/AdminI18nContext';
import { useMediaQuery } from '../../lib/useMediaQuery';

/**
 * Campaign console navigation.
 *
 * ONE component serves both layouts. Below `lg` it is a drawer over the page;
 * from `lg` up it is a permanent column, and the drawer machinery switches off
 * rather than being duplicated in a second component that would drift.
 *
 * On fine-pointer desktops the column auto-hides: it slides closed when the
 * pointer leaves, and reopens when the pointer approaches the start edge. Touch
 * and coarse pointers keep the permanent column so the nav stays reachable.
 *
 * The structure is header / scrolling nav / footer inside a viewport-height
 * column. That is the fix for the console's worst bug: the sidebar was given
 * `height: 100vh` with no overflow handling, so eighteen links overflowed the
 * box and painted OUTSIDE it, where a pale-grey-on-navy link colour landed on
 * the light page background at roughly 1.4:1 and read as disabled.
 */

/** Matches the `@media (min-width: 1024px)` rule that makes this a column. */
export const DESKTOP_SIDEBAR_QUERY = '(min-width: 1024px)';

/** Auto-hide only where hover is reliable; touch keeps the permanent column. */
const FINE_HOVER_QUERY = '(hover: hover) and (pointer: fine)';

/** Pointer within this many CSS pixels of the start edge reopens the panel. */
const EDGE_OPEN_PX = 20;

/** Delay before collapse so the pointer can cross the panel edge without flicker. */
const CLOSE_DELAY_MS = 220;

const FOCUSABLE = 'a[href], button:not([disabled])';

export interface AdminSidebarProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** Focus returns here when the drawer closes. */
  toggleRef: RefObject<HTMLButtonElement | null>;
}

export function AdminSidebar({ id, open, onClose, toggleRef }: AdminSidebarProps) {
  const { t } = useAdminI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  /*
   * `inert` is a DOM attribute, so CSS cannot scope it to a breakpoint.
   *
   * The fallback is `true` deliberately: where `matchMedia` is missing the
   * sidebar must behave as the permanent desktop column, because assuming
   * "drawer" would make a closed, inert sidebar the default and hide the whole
   * navigation from keyboards and tests.
   */
  const isDesktop = useMediaQuery(DESKTOP_SIDEBAR_QUERY, true);
  /*
   * Fine-hover fallback is `false`: without the API, keep the permanent column
   * so jsdom and touch-first environments never start with a hidden nav.
   */
  const fineHover = useMediaQuery(FINE_HOVER_QUERY, false);
  const autoHide = isDesktop && fineHover;
  const isDrawer = !isDesktop;
  const hidden = isDrawer && !open;

  const [desktopOpen, setDesktopOpen] = useState(false);
  const desktopOpenRef = useRef(desktopOpen);
  desktopOpenRef.current = desktopOpen;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openDesktop = useCallback(() => {
    clearCloseTimer();
    setDesktopOpen(true);
  }, [clearCloseTimer]);

  const scheduleDesktopClose = useCallback(() => {
    if (closeTimerRef.current != null) return;
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setDesktopOpen(false);
    }, CLOSE_DELAY_MS);
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  /*
   * When auto-hide is off, the panel is always shown. When it turns on (resize
   * onto a fine pointer), start closed so content gets the full width until the
   * pointer approaches the edge.
   */
  useEffect(() => {
    if (!autoHide) {
      clearCloseTimer();
      setDesktopOpen(true);
      return;
    }
    setDesktopOpen(false);
  }, [autoHide, clearCloseTimer]);

  /*
   * One pointer listener drives open/close.
   *
   * Relying on mouseenter alone glitches: opening from the edge slides the
   * panel under a stationary cursor, and browsers do not fire mouseenter for
   * that. Hit-testing the panel bounds on pointermove stays in sync with the
   * transform animation and avoids a stuck-open or flicker state.
   */
  useEffect(() => {
    if (!autoHide) return;

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;

      const bounds = panelRef.current?.getBoundingClientRect();
      const overPanel =
        bounds != null &&
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;

      if (event.clientX <= EDGE_OPEN_PX || overPanel) {
        openDesktop();
        return;
      }

      if (desktopOpenRef.current) scheduleDesktopClose();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [autoHide, openDesktop, scheduleDesktopClose]);

  // Focus handling and Escape apply only while it is a drawer that is open.
  useEffect(() => {
    if (!isDrawer || !open) return;

    const trigger = toggleRef.current;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [isDrawer, open, onClose, toggleRef]);

  // The page behind a drawer must not scroll. Never locked on desktop, where
  // the sidebar is simply part of the layout.
  useEffect(() => {
    if (!isDrawer || !open) return;

    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, [isDrawer, open]);

  const desktopExpanded = !autoHide || desktopOpen;

  return (
    <div
      className="admin-sidebar"
      id={id}
      data-open={open}
      data-drawer={isDrawer}
      data-autohide={autoHide}
      data-desktop-open={desktopExpanded}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
    >
      {/* Pointer convenience only; Escape and the close button are the
          accessible routes out, so this is not a control of its own. */}
      <div className="admin-sidebar__scrim" onClick={onClose} aria-hidden="true" />

      <div
        className="admin-sidebar__panel"
        ref={panelRef}
        onFocusCapture={autoHide ? openDesktop : undefined}
      >
        <div className="admin-sidebar__header">
          <Link to="/" className="brand brand--inverse">
            <span className="brand__mark" aria-hidden="true">
              RK
            </span>
            <span className="brand__name">{env.VITE_APP_NAME}</span>
          </Link>

          {isDrawer ? (
            <button
              type="button"
              className="admin-sidebar__close"
              onClick={onClose}
              ref={closeRef}
              aria-label={t('nav.close')}
            >
              <Icon name="close" size={1.25} />
            </button>
          ) : null}
        </div>

        {/*
          The only scrolling region. `min-height: 0` in the stylesheet is what
          lets it actually shrink inside the flex column instead of pushing the
          footer past the bottom of the viewport.
        */}
        <nav className="admin-nav" aria-label={t('nav.label')}>
          {ADMIN_NAV.map((group) => (
            <div className="admin-nav__group" key={group.titleKey}>
              {/*
                A heading, not a paragraph: this labels the list beneath it, so
                a screen reader can move between groups and announce which one
                each link belongs to.
              */}
              <h2 className="admin-nav__group-title">{t(group.titleKey)}</h2>

              <ul className="admin-nav__list">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end ?? false}
                      onClick={onClose}
                      className={({ isActive }) =>
                        isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
                      }
                    >
                      <Icon name={item.icon} size={1.15} />
                      <span className="admin-nav__label">{t(item.labelKey)}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Kept from the previous sidebar: existing content, now pinned below
            the scrolling list instead of being pushed off the viewport. */}
        <div className="admin-sidebar__footer">
          <Badge tone="success">Phase 5</Badge>
          <p className="admin-sidebar__note">
            Public site, CMS, QR campaigns and citizen feedback are live.
          </p>
        </div>
      </div>
    </div>
  );
}
