/// <reference types="vite/client" />

// Add PostHog to the Window interface
interface Window {
  posthog?: any;
}