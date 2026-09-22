import { httpUrlSchema, parseEnv } from '@rk/config';
import { LOCALES } from '@rk/types';
import { z } from 'zod';

/**
 * Web environment contract.
 *
 * Exported so tests can assert the DEFAULTS this app ships with, independently
 * of whatever the current process happens to have set.
 *
 * Only `VITE_`-prefixed variables are exposed to the browser by Vite. Nothing
 * secret may ever be placed here: everything in this file is compiled into the
 * client bundle and is readable by anyone who loads the page.
 */
export const webEnvSchema = z.object({
  /** Absolute base URL of the API, without a trailing slash. */
  VITE_API_URL: httpUrlSchema.default('http://localhost:4000'),
  VITE_APP_NAME: z.string().min(1).default('RK Campaign'),
  /**
   * Language a first-time visitor sees.
   *
   * Kannada by default, because these sites serve Kannada-speaking
   * constituencies and English-by-default made the interface read as a
   * translation of an English product rather than a Kannada one.
   *
   * Deliberately NOT `DEFAULT_LOCALE` from @rk/types: that constant is shared
   * with the API, where it decides which CMS content rows to resolve. This is a
   * presentation default for the public website alone, and a tenant serving a
   * different audience can change it per deployment.
   */
  VITE_DEFAULT_LOCALE: z.enum(LOCALES).default('kn'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

/**
 * Validated at module load so a misconfigured deployment fails at startup with
 * a named variable rather than as an opaque network error later on.
 */
export const env: WebEnv = parseEnv('@rk/web', webEnvSchema, {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
  VITE_DEFAULT_LOCALE: import.meta.env.VITE_DEFAULT_LOCALE,
});

/** Trailing slashes are stripped so URL joins stay predictable. */
export const apiBaseUrl = env.VITE_API_URL.replace(/\/+$/, '');
