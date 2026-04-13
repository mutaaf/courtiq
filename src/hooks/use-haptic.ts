'use client';

import { useCallback } from 'react';

/**
 * Returns true if the user has requested reduced motion *right now*.
 * Reads the media query synchronously (safe inside event handlers / effects).
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useHaptic() {
  const vibrate = useCallback((pattern: number | number[] = 50) => {
    // Haptic feedback is a form of sensory motion; skip it when the OS
    // reduced-motion preference is active.
    if (prefersReducedMotion()) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  return {
    tap: () => vibrate(50),
    success: () => vibrate([50, 50, 50]),
    error: () => vibrate([100, 50, 100]),
    recording: () => vibrate(100),
  };
}
