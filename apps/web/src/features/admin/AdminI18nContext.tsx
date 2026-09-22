import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Locale } from '@rk/types';
import { translateAdmin, type AdminStringKey } from '../../i18n/adminStrings';

/**
 * Interface language for the campaign console.
 *
 * Deliberately independent of the public site's language, in three ways:
 *
 *   - its own storage key, so an administrator reading the console in English
 *     does not flip the public site out of Kannada, or vice versa;
 *   - its own default, ENGLISH, because the console is a bilingual working
 *     tool while the public site is a Kannada-first product;
 *   - its own provider, mounted only inside the console, so none of this code
 *     or its dictionary reaches a public visitor.
 *
 * It is also distinct from `CmsLocaleContext`, which chooses which language's
 * CONTENT ROWS are being edited. That one changes the data on screen; this one
 * changes the words around it.
 */

const STORAGE_KEY = 'rk.admin.locale';

/**
 * English unless the administrator says otherwise.
 *
 * The console is used by staff who work across both languages and by vendors
 * and integrators, so it opens in the language its own labels were designed
 * in. The public site's Kannada-first default is a separate decision.
 */
const DEFAULT_ADMIN_LOCALE: Locale = 'en';

interface AdminI18nState {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: AdminStringKey, values?: Record<string, string | number>) => string;
}

const AdminI18nContext = createContext<AdminI18nState | null>(null);

function readStoredAdminLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'kn' ? stored : DEFAULT_ADMIN_LOCALE;
  } catch {
    // Private browsing or blocked storage: the default is fine.
    return DEFAULT_ADMIN_LOCALE;
  }
}

export function AdminI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredAdminLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persisting the choice is a convenience; failing to is not an error.
    }
  }, []);

  /*
   * Keeps `html[lang]` in step while the console is mounted.
   *
   * Two jobs: it tells a screen reader which language to pronounce, and it is
   * what selects the Kannada type metrics in global.css. Runs on mount as well
   * as on change, because the console can be opened directly at /admin with the
   * document still declaring the public site's language.
   *
   * The public `SiteProvider` does the same for its own subtree. The two never
   * run at once - they are mounted on different branches of the route tree -
   * so whichever is on screen owns the attribute.
   */
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: AdminStringKey, values?: Record<string, string | number>) =>
      translateAdmin(locale, key, values),
    [locale],
  );

  const value = useMemo<AdminI18nState>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <AdminI18nContext.Provider value={value}>{children}</AdminI18nContext.Provider>;
}

export function useAdminI18n(): AdminI18nState {
  const value = useContext(AdminI18nContext);
  if (!value) {
    throw new Error('useAdminI18n must be used inside <AdminI18nProvider>.');
  }
  return value;
}
