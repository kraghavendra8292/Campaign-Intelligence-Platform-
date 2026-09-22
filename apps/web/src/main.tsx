import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Token custom properties must load before any component stylesheet that
// consumes them, so the import order here is significant.
//
// Public critical CSS only. Console styles (cms/qr/dashboard/…) load on demand
// via `loadConsoleStyles()` when `/admin` or `/login` mounts — that keeps the
// homepage LCP path free of ~90 KB of unused CSS.
import '@rk/design-tokens/tokens.css';
import '@rk/ui/styles.css';
import './styles/global.css';
import './styles/site.css';
import './styles/work.css';

import { App } from './App';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root was not found in index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
