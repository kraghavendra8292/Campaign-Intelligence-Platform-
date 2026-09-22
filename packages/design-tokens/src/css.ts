import {
  color,
  motion,
  radius,
  shadow,
  size,
  spacing,
  typography,
  zIndex,
  breakpoint,
} from './tokens';

/**
 * Converts a camelCase or numeric token key into a kebab-case CSS fragment.
 * `fontSize` -> `font-size`, `2xl` -> `2xl`, `controlMd` -> `control-md`.
 */
function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

type TokenGroup = Readonly<Record<string, string>>;
type NestedTokenGroup = Readonly<Record<string, TokenGroup>>;

function flatten(prefix: string, group: TokenGroup): [string, string][] {
  return Object.entries(group).map(([key, value]) => [`--${prefix}-${kebab(key)}`, value]);
}

function flattenNested(group: NestedTokenGroup): [string, string][] {
  return Object.entries(group).flatMap(([groupKey, values]) => flatten(kebab(groupKey), values));
}

/**
 * The full ordered list of CSS custom properties exposed to the web app.
 *
 * The raw `palette` is deliberately NOT emitted: components must consume
 * semantic roles so the brand can be re-themed without touching component CSS.
 */
export function cssVariableEntries(): [string, string][] {
  return [
    ...flatten('color', color),
    ...flattenNested(typography as unknown as NestedTokenGroup),
    ...flatten('spacing', spacing),
    ...flatten('radius', radius),
    ...flatten('shadow', shadow),
    ...flatten('breakpoint', breakpoint),
    ...flatten('z-index', zIndex),
    ...flatten('size', size),
    ...flatten('motion', motion),
  ];
}

/** Renders the design tokens as a `:root` custom-property block. */
export function renderTokensCss(): string {
  const declarations = cssVariableEntries()
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

  return [
    '/**',
    ' * GENERATED FILE - DO NOT EDIT BY HAND.',
    ' *',
    ' * Source of truth: packages/design-tokens/src/tokens.ts',
    ' * Regenerate with: npm run tokens:build',
    ' * Verify freshness: npm run tokens:check',
    ' */',
    ':root {',
    declarations,
    '}',
    '',
  ].join('\n');
}
