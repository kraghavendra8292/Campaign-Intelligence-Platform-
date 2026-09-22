import type { StringKey } from '../i18n/strings';

/**
 * Public site navigation.
 *
 * Declared once and consumed by both the desktop bar and the mobile drawer, so
 * the two cannot drift apart - before this existed the drawer carried a Gallery
 * link that the desktop bar silently lacked.
 */

export interface SiteNavItem {
  readonly to: string;
  readonly key: StringKey;
  /** Matches the route exactly, so "/" is not active on every page. */
  readonly end?: boolean;
}

/** Primary destinations. Shown in the desktop header bar and in the drawer. */
export const PRIMARY_NAV_ITEMS: readonly SiteNavItem[] = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/work', key: 'nav.work' },
  { to: '/vision', key: 'nav.vision' },
  { to: '/achievements', key: 'nav.achievements' },
  { to: '/transparency', key: 'nav.transparency' },
  { to: '/news', key: 'nav.news' },
  { to: '/events', key: 'nav.events' },
  { to: '/about', key: 'nav.about' },
  { to: '/contact', key: 'nav.contact' },
  { to: '/feedback', key: 'nav.feedback' },
];

/**
 * Destinations that do not earn a slot in the desktop bar but are worth
 * surfacing in the drawer, where vertical space is cheap.
 */
export const SECONDARY_NAV_ITEMS: readonly SiteNavItem[] = [{ to: '/gallery', key: 'nav.gallery' }];
