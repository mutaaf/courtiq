'use client';

import { useState, useEffect } from 'react';

/**
 * Returns true when the user has opted into reduced motion via the OS/browser
 * `prefers-reduced-motion: reduce` media query.
 *
 * Safe for SSR — returns false on the server and updates on the client after
 * the first render when the media query is available.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}
