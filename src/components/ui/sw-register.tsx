'use client';

import { useEffect } from 'react';

/**
 * Registers the SportsIQ service worker for offline app-shell support.
 * Mounted once in the root layout; safe to render on every page.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Register after the page has fully loaded to avoid competing with
    // critical-path network requests.
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          // Check for updates on each navigation
          registration.update().catch(() => {});
        })
        .catch(() => {
          // SW registration failures are non-fatal
        });
    });
  }, []);

  return null;
}
