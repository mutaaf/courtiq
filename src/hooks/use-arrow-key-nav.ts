'use client';

import { useRef, useCallback } from 'react';

/** Focusable element selectors — matches all natively interactive elements. */
const INTERACTIVE =
  'a[href]:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Enables Up/Down/Home/End arrow-key navigation within a nav container.
 *
 * Usage:
 * ```tsx
 * const { navRef, onKeyDown } = useArrowKeyNav();
 * return (
 *   <nav ref={navRef} onKeyDown={onKeyDown}>
 *     <Link href="/a">A</Link>
 *     <Link href="/b">B</Link>
 *   </nav>
 * );
 * ```
 *
 * - ArrowDown / ArrowUp → move focus to next / previous item (wraps).
 * - Home / End         → jump to first / last item.
 * - Tab still works normally for moving focus out of the nav.
 */
export function useArrowKeyNav() {
  const navRef = useRef<HTMLElement | null>(null);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;

    const container = navRef.current;
    if (!container) return;

    const items = Array.from(
      container.querySelectorAll<HTMLElement>(INTERACTIVE)
    ).filter((el) => {
      // Exclude hidden elements
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    });

    if (items.length === 0) return;

    e.preventDefault(); // prevent page scroll on ArrowDown/Up

    const current = document.activeElement as HTMLElement;
    const currentIndex = items.indexOf(current);

    let nextIndex: number;
    switch (key) {
      case 'ArrowDown':
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'ArrowUp':
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    items[nextIndex]?.focus();
  }, []);

  return { navRef, onKeyDown };
}
