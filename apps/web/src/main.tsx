import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Token custom properties must load before any component stylesheet that
// consumes them, so the import order here is significant.
import '@rk/design-tokens/tokens.css';
import '@rk/ui/styles.css';
import './styles/global.css';
import './styles/site.css';
import './styles/cms.css';
import './styles/qr.css';
import './styles/issues.css';
import './styles/ai.css';
import './styles/analytics.css';
import './styles/dashboard.css';
import './styles/communication.css';
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
