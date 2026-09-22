/**
 * Console stylesheets (CMS, QR, issues, dashboard, …).
 *
 * Kept out of `main.tsx` so the public homepage does not download ~90 KB of
 * admin CSS before first paint. Imported once when `/admin` or `/login` mounts.
 */
let loaded = false;

export function loadConsoleStyles(): void {
  if (loaded) return;
  loaded = true;

  void import('./cms.css');
  void import('./qr.css');
  void import('./issues.css');
  void import('./ai.css');
  void import('./analytics.css');
  void import('./dashboard.css');
  void import('./communication.css');
}
