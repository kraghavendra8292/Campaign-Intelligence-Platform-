/**
 * Minimal class-name joiner.
 *
 * Avoids a dependency for what is a three-line helper. Accepts `unknown` so
 * the common `condition && 'class'` idiom type-checks whatever the condition's
 * type is (a `ReactNode` prop can narrow to `0`, `''` or `0n`, none of which a
 * narrower signature would admit). Only non-empty strings survive the filter,
 * so a stray falsy value can never reach the DOM.
 */
export type ClassValue = unknown;

export function cx(...values: ClassValue[]): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}
