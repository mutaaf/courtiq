'use client';

import { useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// Routes that swipe gestures cycle through (mirrors the mobile bottom nav order)
const NAV_ROUTES = ['/home', '/assistant', '/capture', '/plans', '/settings'];

// Minimum horizontal travel required to trigger navigation
const MIN_SWIPE_X = 80;
// Vertical component must stay below this fraction of horizontal travel
// (prevents accidental triggers when scrolling at a slight angle)
const MAX_VERTICAL_RATIO = 0.5;

/**
 * Adds left/right swipe-to-navigate on mobile.
 * Attach `onTouchStart` and `onTouchEnd` to the scrollable content wrapper.
 *
 * Conflicts with pull-to-refresh are avoided because PTR only activates on
 * downward (vertical-dominant) drags, while we require a horizontal-dominant swipe.
 */
export function useSwipeNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const startRef = useRef<{ x: number; y: number } | null>(null);

  // Find which tab we're currently on (-1 if on a sub-page like /roster/[id])
  const currentIndex = NAV_ROUTES.findIndex((r) => pathname.startsWith(r));

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!startRef.current || currentIndex < 0) {
        startRef.current = null;
        return;
      }

      const dx = e.changedTouches[0].clientX - startRef.current.x;
      const dy = e.changedTouches[0].clientY - startRef.current.y;
      startRef.current = null;

      // Must be a clearly horizontal swipe
      if (Math.abs(dx) < MIN_SWIPE_X || Math.abs(dy) > Math.abs(dx) * MAX_VERTICAL_RATIO) return;

      if (dx < 0 && currentIndex < NAV_ROUTES.length - 1) {
        // Swipe left → next tab
        if (navigator.vibrate) navigator.vibrate(30);
        router.push(NAV_ROUTES[currentIndex + 1]);
      } else if (dx > 0 && currentIndex > 0) {
        // Swipe right → previous tab
        if (navigator.vibrate) navigator.vibrate(30);
        router.push(NAV_ROUTES[currentIndex - 1]);
      }
    },
    [router, currentIndex]
  );

  return { onTouchStart, onTouchEnd };
}
