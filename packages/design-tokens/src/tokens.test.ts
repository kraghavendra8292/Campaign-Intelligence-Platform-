import { describe, expect, it } from 'vitest';
import { color, palette } from './tokens';
import { cssVariableEntries, renderTokensCss } from './css';

describe('design tokens', () => {
  it('maps the brand colours from the reference design', () => {
    expect(color.primary).toBe('#16A34A');
    expect(color.accent).toBe('#F59E0B');
    expect(color.brand).toBe('#0F172A');
    expect(color.textMuted).toBe('#64748B');
    expect(color.background).toBe('#F1F5F9');
  });

  it('derives every semantic colour from the palette', () => {
    const paletteValues = new Set(
      Object.values(palette).flatMap((entry) =>
        typeof entry === 'string' ? [entry] : Object.values(entry),
      ),
    );

    const derived = Object.entries(color).filter(([, value]) => !value.startsWith('rgba('));
    for (const [role, value] of derived) {
      expect(paletteValues, `${role} should come from the palette`).toContain(value);
    }
  });
});

describe('css generation', () => {
  it('emits kebab-case custom properties for every semantic group', () => {
    const names = cssVariableEntries().map(([name]) => name);

    expect(names).toContain('--color-primary');
    expect(names).toContain('--color-primary-hover');
    expect(names).toContain('--font-size-md');
    expect(names).toContain('--font-family-sans');
    expect(names).toContain('--spacing-4');
    expect(names).toContain('--radius-lg');
    expect(names).toContain('--shadow-md');
    expect(names).toContain('--breakpoint-md');
    expect(names).toContain('--z-index-modal');
    expect(names).toContain('--size-touch-target');
    expect(names).toContain('--motion-duration-normal');
  });

  it('does not leak raw palette values as custom properties', () => {
    const names = cssVariableEntries().map(([name]) => name);
    expect(names.some((name) => name.startsWith('--palette-'))).toBe(false);
  });

  it('produces unique variable names', () => {
    const names = cssVariableEntries().map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('renders a :root block', () => {
    const css = renderTokensCss();
    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary: #16A34A;');
    expect(css.trimEnd().endsWith('}')).toBe(true);
  });
});
