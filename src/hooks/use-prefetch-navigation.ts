'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/**
 * Routes in the order they appear in both the mobile bottom nav and the
 * desktop sidebar. Used to identify which pages are "adjacent" to the one
 * currently being viewed so they can be prefetched proactively.
 */
const NAV_ROUTES = [
  '/home',
  '/assistant',
  '/capture',
  '/analytics',
  '/roster',
  '/sessions',
  '/calendar',
  '/curriculum',
  '/marketplace',
  '/plans',
  '/drills',
  '/settings',
];

/**
 * Proactively prefetches the pages immediately before and after the current
 * page in the navigation order.  This is especially valuable on mobile where
 * hover-based prefetch never fires — firing router.prefetch() on mount means
 * the most likely "next tap" destinations are already in the cache.
 */
export function usePrefetchAdjacentPages() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const idx = NAV_ROUTES.findIndex((r) => pathname.startsWith(r));
    if (idx === -1) return;

    const prev = NAV_ROUTES[idx - 1];
    const next = NAV_ROUTES[idx + 1];

    if (prev) router.prefetch(prev);
    if (next) router.prefetch(next);
  }, [router, pathname]);
}

/**
 * Returns an event-handler factory that calls router.prefetch(href).
 * Attach the returned handler to onMouseEnter, onFocus, or onTouchStart on
 * any Link or interactive element to give Next.js a head-start fetching the
 * destination route before the user completes the navigation action.
 */
export function usePrefetchOnIntent() {
  const router = useRouter();

  return useCallback(
    (href: string) => () => {
      router.prefetch(href);
    },
    [router]
  );
}
