import { color, radius, spacing, typography } from '@rk/design-tokens';

/**
 * React Native theme.
 *
 * Reads the same `@rk/design-tokens` source of truth as the web application,
 * converting only what the platform needs: React Native takes unitless numbers
 * rather than rem strings, so the scales are re-expressed in density-
 * independent pixels here. Colours pass through untouched, which is what keeps
 * the two platforms visually identical.
 */

/** Converts a rem token (`1.25rem`) to React Native units at a 16px base. */
function remToUnits(value: string): number {
  return Math.round(Number.parseFloat(value) * 16);
}

export const theme = {
  color,

  spacing: {
    xs: remToUnits(spacing[1]),
    sm: remToUnits(spacing[2]),
    md: remToUnits(spacing[4]),
    lg: remToUnits(spacing[6]),
    xl: remToUnits(spacing[8]),
    xxl: remToUnits(spacing[12]),
  },

  radius: {
    sm: remToUnits(radius.sm),
    md: remToUnits(radius.md),
    lg: remToUnits(radius.lg),
    xl: remToUnits(radius.xl),
    full: 9999,
  },

  fontSize: {
    xs: remToUnits(typography.fontSize.xs),
    sm: remToUnits(typography.fontSize.sm),
    md: remToUnits(typography.fontSize.md),
    lg: remToUnits(typography.fontSize.lg),
    xl: remToUnits(typography.fontSize.xl),
    xxl: remToUnits(typography.fontSize['2xl']),
    xxxl: remToUnits(typography.fontSize['3xl']),
  },

  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  /** Minimum touch target, per accessibility guidance. */
  touchTarget: 44,
} as const;

export type Theme = typeof theme;
