'use client';

import { useEffect } from 'react';
import { initAnalytics } from '@/lib/analytics';

/**
 * Mounts once in the root layout and initializes PostHog.
 * Safely no-ops when NEXT_PUBLIC_POSTHOG_KEY is missing.
 */
export function AnalyticsInit() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}
