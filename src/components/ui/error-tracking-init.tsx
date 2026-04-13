'use client';

import { useEffect } from 'react';
import { initErrorTracking } from '@/lib/error-tracking';

/**
 * Mounts once in the root layout and registers:
 *  - window.onerror        — catches synchronous runtime errors
 *  - unhandledrejection   — catches un-caught Promise rejections
 *
 * Renders nothing; cleanup runs automatically on unmount (strict-mode safe).
 */
export function ErrorTrackingInit() {
  useEffect(() => {
    const cleanup = initErrorTracking();
    return cleanup;
  }, []);

  return null;
}
