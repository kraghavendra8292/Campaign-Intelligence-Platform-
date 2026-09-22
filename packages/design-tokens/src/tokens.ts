/**
 * The single source of truth for the RK visual system.
 *
 * Every colour, size and elevation used by the web application, the shared UI
 * primitives and the React Native application originates here. Web consumes
 * these as generated CSS custom properties; React Native consumes the same
 * objects directly as a JS theme. Components must reference semantic tokens
 * (`color.primary`), never raw palette values or literal hex codes, so the
 * brand can be re-themed in one place.
 */

/**
 * Raw palette. Not for direct use in components - always go through the
 * semantic `color` map below, which gives each value a role.
 */
export const palette = {
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
  },
  orange: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  navy: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
  red: {
    100: '#FEE2E2',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
  },
  blue: {
    100: '#DBEAFE',
    500: '#3B82F6',
    600: '#2563EB',
  },
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

/** Semantic colour roles. Components reference these, never `palette`. */
export const color = {
  primary: palette.green[600],
  primaryHover: palette.green[700],
  primaryActive: palette.green[800],
  primarySubtle: palette.green[50],
  onPrimary: palette.white,

  accent: palette.orange[500],
  accentHover: palette.orange[600],
  accentSubtle: palette.orange[50],
  onAccent: palette.navy[900],

  brand: palette.navy[900],
  brandSurface: palette.navy[800],
  onBrand: palette.navy[50],

  background: palette.navy[100],
  surface: palette.white,
  surfaceRaised: palette.white,
  surfaceSubtle: palette.navy[50],

  text: palette.navy[900],
  textMuted: palette.navy[500],
  textInverse: palette.white,

  border: palette.navy[200],
  borderStrong: palette.navy[300],

  focusRing: palette.green[500],

  success: palette.green[600],
  successSubtle: palette.green[100],
  warning: palette.orange[500],
  warningSubtle: palette.orange[100],
  error: palette.red[600],
  errorSubtle: palette.red[100],
  info: palette.blue[600],
  infoSubtle: palette.blue[100],

  disabledSurface: palette.navy[200],
  disabledText: palette.navy[400],

  overlay: 'rgba(15, 23, 42, 0.55)',
} as const;

export const typography = {
  fontFamily: {
    /**
     * Poppins for Latin, Noto Sans Kannada for Kannada.
     *
     * The ORDER is the mechanism, not a preference. A browser resolves a font
     * stack per character: Latin is drawn by Poppins, and Kannada - which
     * Poppins has no glyphs for - falls through to the next family that does.
     * So one stack renders a mixed "ಸುದ್ದಿ / News" string correctly with no
     * language-aware selectors anywhere.
     *
     * Noto Sans Kannada must therefore NOT lead: it ships Latin glyphs of its
     * own, and putting it first would silently replace the campaign's Poppins
     * wordmark everywhere.
     */
    sans: "'Poppins', 'Noto Sans Kannada', 'Nirmala UI', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem',
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.2',
    snug: '1.35',
    normal: '1.55',
    relaxed: '1.75',
  },
  letterSpacing: {
    tight: '-0.02em',
    normal: '0',
    wide: '0.04em',
  },
} as const;

/** 4px base spacing scale. */
export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const;

export const radius = {
  none: '0',
  sm: '0.375rem',
  md: '0.625rem',
  lg: '0.875rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  full: '9999px',
} as const;

export const shadow = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(15, 23, 42, 0.06)',
  md: '0 4px 12px -2px rgba(15, 23, 42, 0.10), 0 2px 4px -2px rgba(15, 23, 42, 0.06)',
  lg: '0 12px 24px -6px rgba(15, 23, 42, 0.12), 0 4px 8px -4px rgba(15, 23, 42, 0.06)',
  focus: '0 0 0 3px rgba(34, 197, 94, 0.35)',
} as const;

/** Mobile-first breakpoints. Public site is designed up from `sm`. */
export const breakpoint = {
  sm: '480px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const zIndex = {
  base: '0',
  dropdown: '1000',
  sticky: '1100',
  overlay: '1200',
  modal: '1300',
  toast: '1400',
} as const;

/** Minimum interactive target size, for pointer and touch accessibility. */
export const size = {
  controlSm: '2rem',
  controlMd: '2.75rem',
  controlLg: '3.25rem',
  touchTarget: '44px',
  contentMaxWidth: '1200px',
} as const;

export const motion = {
  durationFast: '120ms',
  durationNormal: '200ms',
  /** Full-bleed imagery: long enough to read as a dissolve, not a cut. */
  durationSlow: '600ms',
  easingStandard: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/** Button variants understood by the shared UI primitives. */
export const BUTTON_VARIANTS = ['primary', 'secondary', 'accent', 'ghost', 'danger'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

/** Validation states shared by Input and Select. */
export const INPUT_STATES = ['default', 'invalid', 'disabled'] as const;
export type InputState = (typeof INPUT_STATES)[number];

/** Status tones used by Badge and future workflow states. */
export const STATUS_TONES = ['neutral', 'success', 'warning', 'error', 'info'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export const tokens = {
  palette,
  color,
  typography,
  spacing,
  radius,
  shadow,
  breakpoint,
  zIndex,
  size,
  motion,
} as const;

export type Tokens = typeof tokens;
