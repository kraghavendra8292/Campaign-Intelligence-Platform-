/**
 * Mobile environment configuration.
 *
 * Expo inlines `EXPO_PUBLIC_*` variables at build time, so `process.env` reads
 * must use the full literal name - destructuring or dynamic keys are not
 * substituted by the bundler.
 *
 * Nothing secret may live here: every value ends up readable inside the app
 * bundle. Campaign staff credentials are handled by Phase 2 authentication and
 * stored in the device secure store, never in configuration.
 */

interface MobileEnv {
  readonly apiUrl: string;
  readonly appName: string;
}

function required(value: string | undefined, name: string, fallback: string): string {
  if (value && value.trim().length > 0) return value.trim();

  if (__DEV__) {
    // A missing variable is recoverable in development, but must be visible.
    console.warn(`[config] ${name} is not set; falling back to "${fallback}".`);
  }

  return fallback;
}

export const env: MobileEnv = {
  apiUrl: required(
    process.env.EXPO_PUBLIC_API_URL,
    'EXPO_PUBLIC_API_URL',
    'http://localhost:4000',
  ).replace(/\/+$/, ''),

  appName: required(process.env.EXPO_PUBLIC_APP_NAME, 'EXPO_PUBLIC_APP_NAME', 'RK Campaign'),
};
