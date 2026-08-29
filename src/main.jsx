import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import './index.css';

// If a tab stays open across a deployment, a lazy-loaded old chunk can be
// removed from the production alias. Reload once to pick up the new manifest
// instead of leaving the user with a 404 and a broken tab.
window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  const reloadKey = 'metapost_chunk_reload_at';
  const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
  if (Date.now() - lastReload > 60_000) {
    sessionStorage.setItem(reloadKey, String(Date.now()));
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
