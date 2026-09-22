import { useEffect, useRef, type RefObject } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import { PRIMARY_NAV_ITEMS, SECONDARY_NAV_ITEMS, type SiteNavItem } from '../../config/siteNav';

/**
 * Mobile navigation drawer.
 *
 * Closed is the resting state and the component is driven entirely by the
 * `open` prop - there is no internal "is it showing" flag that could disagree
 * with the button's `aria-expanded`.
 *
 * Visibility is expressed with `data-open` plus a transform, NOT with the
 * `hidden` attribute. `hidden` hides only through a user-agent rule that any
 * author `display` declaration outranks, which is the exact trap that left this
 * menu stuck open; a transform cannot be silently defeated the same way, and it
 * animates. While closed the panel is `inert` and `aria-hidden`, so it is
 * unreachable by pointer, keyboard and screen reader even mid-transition.
 */

/** Everything the browser can focus, in DOM order. */
const FOCUSABLE = 'a[href], button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])';

export interface MobileNavDrawerProps {
  id: string;
  open: boolean;
  onClose: () => void;
  siteName: string;
  /** Focus returns here on close, so the keyboard never lands back at the top. */
  toggleRef: RefObject<HTMLButtonElement | null>;
}

export function MobileNavDrawer({ id, open, onClose, siteName, toggleRef }: MobileNavDrawerProps) {
  const { t } = useSite();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus management and the key bindings that only apply while open.
  useEffect(() => {
    if (!open) return;

    // Captured now rather than read in the cleanup: by teardown the ref may
    // already point elsewhere, and the button to restore focus to is the one
    // that was on screen when the drawer opened.
    const trigger = toggleRef.current;

    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      // Tab must cycle inside the drawer: content behind it is inert, so
      // letting focus escape would strand the keyboard on unreachable links.
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
  }, [open, onClose, toggleRef]);

  // The page behind must not scroll under the drawer. The previous value is
  // restored rather than cleared, so this never clobbers another lock.
  useEffect(() => {
    if (!open) return;

    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="site-drawer" data-open={open} aria-hidden={!open} inert={!open || undefined}>
      {/*
        Decorative: closing by clicking away is a convenience for pointer users
        that Escape and the close button already provide accessibly, so this
        does not need to be a control of its own.
      */}
      <div className="site-drawer__scrim" onClick={onClose} aria-hidden="true" />

      <div
        className="site-drawer__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.menu')}
        id={id}
      >
        <div className="site-drawer__header">
          <span className="site-drawer__title">{siteName}</span>
          <button type="button" className="site-drawer__close" onClick={onClose} ref={closeRef}>
            <span className="visually-hidden">{t('nav.close')}</span>
            <Icon name="close" size={1.35} />
          </button>
        </div>

        <nav className="site-drawer__nav" aria-label={t('nav.primary')}>
          {PRIMARY_NAV_ITEMS.map((item) => (
            <DrawerLink key={item.to} item={item} onNavigate={onClose} />
          ))}

          <span className="site-drawer__divider" role="presentation" />

          {SECONDARY_NAV_ITEMS.map((item) => (
            <DrawerLink key={item.to} item={item} onNavigate={onClose} />
          ))}
        </nav>
      </div>
    </div>
  );
}

function DrawerLink({ item, onNavigate }: { item: SiteNavItem; onNavigate: () => void }) {
  const { t } = useSite();

  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      onClick={onNavigate}
      className={({ isActive }) =>
        isActive ? 'site-drawer__link site-drawer__link--active' : 'site-drawer__link'
      }
    >
      {t(item.key)}
    </NavLink>
  );
}
