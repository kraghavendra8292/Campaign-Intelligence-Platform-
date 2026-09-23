import { cx } from '../utils/cx';

/**
 * Line icons.
 *
 * A small hand-drawn set rather than an icon dependency: the product needs a
 * handful of glyphs, and a package would ship thousands. Every glyph shares one
 * 24px grid and a 1.5px stroke so they sit together optically, and all of them
 * paint in `currentColor` so they inherit whatever the surrounding text uses.
 *
 * Icons are decorative by default (`aria-hidden`). When an icon is the only
 * content of a control, label the CONTROL - not the icon.
 */

export const ICON_NAMES = [
  // Interface chrome.
  'search',
  'menu',
  'close',
  'chevronDown',
  'chevronLeft',
  'chevronRight',
  'pause',
  'play',
  'refresh',
  'moreVertical',
  'pencil',
  'trash',
  'columns',
  // Console navigation.
  'dashboard',
  'user',
  'eye',
  'target',
  'folder',
  'trophy',
  'newspaper',
  'calendar',
  'images',
  'media',
  'qrCode',
  'barChart',
  'message',
  'sparkles',
  'shieldCheck',
  'contactCard',
  'checkCircle',
  'clock',
  'building',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

const PATHS: Record<IconName, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.2-4.2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  chevronDown: 'm6 9 6 6 6-6',
  chevronLeft: 'm15 6-6 6 6 6',
  chevronRight: 'm9 6 6 6-6 6',
  pause: 'M10 5v14M15 5v14',
  play: 'M8 5.5v13l11-6.5z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  moreVertical: 'M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5M12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5M12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5',
  pencil: 'M14.5 5.5 18.5 9.5M4 20l1.2-4.4L15.8 5l4 4L9.2 19.6z',
  trash: 'M5 7h14M9.5 7V5.5h5V7M8 7l.7 12h6.6L16 7',
  columns: 'M5 5h4v14H5zM10.5 5h3v14h-3zM15 5h4v14h-4z',

  dashboard: 'M4 4h6v7H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 15h6v5H4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20a7.5 7.5 0 0 1 15 0',
  eye: 'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  target:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  folder: 'M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  trophy:
    'M8 4h8v5a4 4 0 0 1-8 0zM8 5.5H5V7a3 3 0 0 0 3 3M16 5.5h3V7a3 3 0 0 1-3 3M12 13v4M9 20h6M10 17h4',
  newspaper: 'M4 5h12v15H6a2 2 0 0 1-2-2zM16 9h4v9a2 2 0 0 1-2 2M7 9h6M7 12h6M7 15.5h4',
  calendar: 'M4 6h16v14H4zM8 3.5v4M16 3.5v4M4 10.5h16',
  images: 'M9 4h11v11H9zM4 9v9a2 2 0 0 0 2 2h9M20 11.5 17 9l-5 4',
  media: 'M4 5h16v14H4zM10 9.5v5l4.5-2.5z',
  qrCode:
    'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14M17.5 17.5H20V20h-2.5M14 20h2.5M20 14h-2.5',
  barChart: 'M3.5 20h17M7 20v-6M12 20V7M17 20v-9',
  message: 'M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z',
  sparkles:
    'M11 3.5 12.6 8l4.5 1.6-4.5 1.6L11 15.7 9.4 11.2 4.9 9.6 9.4 8zM18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  shieldCheck:
    'M12 3.5 19 6.3V12c0 4.3-2.9 7.3-7 8.5-4.1-1.2-7-4.2-7-8.5V6.3zM9 12.2l2.2 2.2 3.8-4',
  contactCard:
    'M4 5.5h16v13H4zM9.5 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4M6.5 16c0-1.7 1.3-3 3-3s3 1.3 3 3M15 10.5h3M15 13.5h3',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8.5 12.2l2.3 2.3 4.7-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5.5l3.5 2',
  building: 'M4 20h16M6 20V7l6-3 6 3v13M10 10h.01M14 10h.01M10 14h.01M14 14h.01M11 20v-3h2v3',
};

export interface IconProps {
  name: IconName;
  /** Edge length in `em`, so the glyph scales with its surrounding text. */
  size?: number;
  className?: string;
}

export function Icon({ name, size = 1.25, className }: IconProps) {
  return (
    <svg
      className={cx('rk-icon', className)}
      viewBox="0 0 24 24"
      width={`${size}em`}
      height={`${size}em`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
