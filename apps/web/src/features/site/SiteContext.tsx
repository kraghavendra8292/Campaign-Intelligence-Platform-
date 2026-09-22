import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { type Locale } from '@rk/types';
import { translate, type StringKey } from '../../i18n/strings';
import { env } from '../../config/env';
import { readStoredLocale, writeStoredLocale } from '../../i18n/locale';

/**
 * Public-site context: which candidate site is being rendered, and in which
 * language.
 *
 * TENANT RESOLUTION ON THE CLIENT
 * The browser decides which site to *ask* for; the server decides what that
 * site may show. Resolution order mirrors the API:
 *
 *   1. `?org=<slug>` query parameter  - development and previews
 *   2. subdomain of the current host  - `<slug>.example.com`
 *   3. `VITE_DEFAULT_SITE_SLUG`       - single-tenant deployments
 *
 * Whatever this produces is only a *request*: the API independently validates
 * the slug and returns nothing but that tenant's published content, so a user
 * editing the query string sees a different public site, never private data.
 */

interface SiteState {
  readonly organizationSlug: string | null;
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  /** Translates a UI string in the active locale. */
  readonly t: (key: StringKey, values?: Record<string, string | number>) => string;
}

const SiteContext = createContext<SiteState | null>(null);

/** Reads a tenant slug from the subdomain, if the host has one. */
function slugFromHost(hostname: string): string | null {
  const labels = hostname.split('.');
  if (labels.length < 3) return null;

  const candidate = labels[0]?.toLowerCase();
  if (!candidate || candidate === 'www') return null;

  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(candidate) ? candidate : null;
}

export function resolveSiteSlug(search: string, hostname: string): string | null {
  const fromQuery = new URLSearchParams(search).get('org')?.trim().toLowerCase();
  if (fromQuery) return fromQuery;

  const fromHost = slugFromHost(hostname);
  if (fromHost) return fromHost;

  const configured = import.meta.env.VITE_DEFAULT_SITE_SLUG;
  return typeof configured === 'string' && configured.length > 0 ? configured : null;
}

export function SiteProvider({ children }: { children: ReactNode }) {
  /*
   * A returning reader keeps the language they chose; a first-time reader gets
   * `VITE_DEFAULT_LOCALE`, which is Kannada. The console reads the same key,
   * so the two halves of the product cannot disagree.
   */
  const [locale, setLocaleState] = useState<Locale>(() =>
    readStoredLocale(env.VITE_DEFAULT_LOCALE),
  );

  /*
   * Keeps `html[lang]` in step with the active language.
   *
   * Syncing an external system to React state is exactly what an effect is
   * for. It has to run on MOUNT as well as on change: the stylesheet selects
   * Kannada type metrics on `html[lang="kn"]`, so a first-time visitor - who
   * now gets Kannada without touching the selector - would otherwise read
   * Kannada set to Latin line-heights until they changed something.
   *
   * It also tells assistive technology which language to pronounce.
   */
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const organizationSlug = useMemo(
    () => resolveSiteSlug(window.location.search, window.location.hostname),
    [],
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: StringKey, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale],
  );

  const value = useMemo<SiteState>(
    () => ({ organizationSlug, locale, setLocale, t }),
    [organizationSlug, locale, setLocale, t],
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteState {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSite must be used inside <SiteProvider>.');
  }
  return context;
}
