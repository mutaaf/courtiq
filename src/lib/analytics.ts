/**
 * Thin wrapper around PostHog so feature code stays vendor-agnostic.
 *
 * Usage:
 *   import { trackEvent, identifyUser, resetAnalytics } from '@/lib/analytics';
 *   trackEvent('onboarding_started');
 *   trackEvent('onboarding_roster_submitted', { mode: 'paste', count: 12 });
 *
 * No-ops gracefully when NEXT_PUBLIC_POSTHOG_KEY is unset (dev w/o a key, SSR, tests).
 * Initialization happens in <PostHogInit>; calling trackEvent before init queues
 * inside posthog-js itself.
 */

import posthog from 'posthog-js';

export interface EventProps {
  [key: string]: string | number | boolean | null | undefined;
}

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

function isEnabled(): boolean {
  return typeof window !== 'undefined' && !!KEY;
}

export function initAnalytics(): void {
  if (!isEnabled()) return;
  // Idempotent — posthog-js itself guards against re-init, but we double-check
  // because Next.js can re-mount providers in strict mode.
  if ((posthog as unknown as { __loaded?: boolean }).__loaded) return;

  posthog.init(KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: 'history_change',  // SPA-aware
    capture_pageleave: true,
    person_profiles: 'identified_only',  // anonymous events don't create person rows
    autocapture: true,
    // Keep sessions short-ish to avoid bloating free-tier usage
    session_recording: { maskAllInputs: true },
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') ph.debug(false);
    },
  });
}

export function trackEvent(event: string, props?: EventProps): void {
  if (!isEnabled()) return;
  try {
    posthog.capture(event, props as Record<string, unknown> | undefined);
  } catch {
    // Never let analytics throw into product code
  }
}

/**
 * Tie subsequent events to a known user. Call after auth resolves.
 */
export function identifyUser(userId: string, props?: EventProps): void {
  if (!isEnabled()) return;
  try {
    posthog.identify(userId, props as Record<string, unknown> | undefined);
  } catch {}
}

/**
 * Clear identity on sign-out so the next user doesn't inherit the previous one.
 */
export function resetAnalytics(): void {
  if (!isEnabled()) return;
  try {
    posthog.reset();
  } catch {}
}
