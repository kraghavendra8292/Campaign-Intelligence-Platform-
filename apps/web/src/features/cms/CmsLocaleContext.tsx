import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from '@rk/types';

/**
 * Which language the CMS is currently editing.
 *
 * Translations are sibling ROWS, not fields: the content tables are keyed
 * `(organizationId, slug, locale)`, so the Kannada version of a project is a
 * separate record with its own publishing status. An editor therefore picks a
 * language and works in it, exactly as they pick a tenant - rather than filling
 * in paired fields on one form, which would force both languages to publish
 * together.
 *
 * The choice lives above the CMS routes so it survives navigation between a
 * list and an editor, and is persisted per browser so it survives a reload.
 * It is NOT a security boundary: the API scopes every row to the caller's
 * tenant regardless of the locale asked for.
 */

interface CmsLocaleState {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
}

const CmsLocaleContext = createContext<CmsLocaleState | null>(null);

const STORAGE_KEY = 'rk.cms.locale';

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'kn' || stored === 'en' ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function CmsLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Remembering the choice is a convenience, not a requirement.
    }
  }, []);

  const value = useMemo<CmsLocaleState>(() => ({ locale, setLocale }), [locale, setLocale]);

  return <CmsLocaleContext.Provider value={value}>{children}</CmsLocaleContext.Provider>;
}

/**
 * The active editing language.
 *
 * Falls back to the default locale outside a provider so a non-CMS admin screen
 * that happens to reuse a CMS component does not crash.
 */
export function useCmsLocale(): CmsLocaleState {
  const context = useContext(CmsLocaleContext);
  if (context) return context;

  return { locale: DEFAULT_LOCALE, setLocale: () => undefined };
}
