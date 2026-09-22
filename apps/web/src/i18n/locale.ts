import type { Locale } from '@rk/types';

/**
 * Where the reader's language choice lives.
 *
 * One module owns the key and the parsing so the public site and the campaign
 * console cannot end up disagreeing about which language the reader picked -
 * they are one product, and switching language on the site should not leave the
 * console in the other one.
 */

const STORAGE_KEY = 'rk.locale';

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'kn';
}

/** The stored choice, or `fallback` for a first-time reader. */
export function readStoredLocale(fallback: Locale): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : fallback;
  } catch {
    // Private browsing or blocked storage: the default is fine.
    return fallback;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // A per-reader convenience; failing to persist it is not an error.
  }
}
