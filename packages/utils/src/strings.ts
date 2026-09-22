/**
 * Converts arbitrary text into a URL-safe slug.
 *
 * Used for tenant slugs (for example `north-district-campaign`). Diacritics are
 * decomposed by NFKD normalisation and then stripped via the Unicode combining
 * marks property, so accented input degrades to its ASCII base letters.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/** Truncates text for display, appending a single-character ellipsis. */
export function truncate(input: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (input.length <= maxLength) return input;
  return `${input.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
