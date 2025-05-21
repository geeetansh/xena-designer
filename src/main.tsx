import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { initPostHog } from './lib/posthog.ts';

// Initialize PostHog
initPostHog();

// Reload feature flags after initial load
document.addEventListener('DOMContentLoaded', () => {
  // Wait for PostHog to initialize first
  setTimeout(() => {
    if (window.posthog) {
      console.log('Reloading PostHog feature flags...');
      window.posthog.reloadFeatureFlags();
    }
  }, 1000);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);