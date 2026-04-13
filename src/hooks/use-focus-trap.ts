'use client';

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';

/**
 * CSS selectors for all natively focusable elements.
 * Excludes elements with tabindex="-1" (programmatically focusable only).
 */
const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface UseFocusTrapOptions {
  /** Whether the trap is active. Trap activates on true, deactivates on false. */
  enabled: boolean;
  /** Called when the user presses Escape inside the trap. */
  onEscape?: () => void;
}

/**
 * Traps keyboard focus within a container element while `enabled` is true.
 *
 * - Tab / Shift+Tab cycle through focusable children; wrap at boundaries.
 * - Escape key fires `onEscape` (typically closes the modal).
 * - On activation, focus moves to the first focusable child.
 * - On deactivation (or unmount), focus returns to the element that was
 *   focused before the trap was opened.
 *
 * Usage:
 * ```tsx
 * const trapRef = useFocusTrap<HTMLDivElement>({ enabled: isOpen, onEscape: close });
 * return <div ref={trapRef} role="dialog">...</div>;
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions
) {
  const { enabled, onEscape } = options;
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Keep onEscape in a ref so the effect does not need it as a dependency,
  // preventing unnecessary effect restarts (and spurious focus-restoration)
  // when the consumer passes an inline function.
  const onEscapeRef = useRef(onEscape);
  // Update the ref in a layout effect (not during render) to satisfy lint rules
  // while still ensuring the latest callback is always used.
  useLayoutEffect(() => {
    onEscapeRef.current = onEscape;
  });

  /** Returns all currently visible, focusable descendants of the container. */
  const getFocusable = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Remember what had focus before the trap opened so we can restore it.
    previousFocusRef.current = document.activeElement;

    // Move focus into the modal after the current paint cycle so the DOM is
    // fully rendered (especially important when the element just mounted).
    const raf = requestAnimationFrame(() => {
      const focusable = getFocusable();
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    });

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onEscapeRef.current?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = getFocusable();

      if (focusable.length === 0) {
        // Prevent focus escaping when there are no focusable elements (e.g.
        // while a modal is in a loading/processing state).
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab on the first element → wrap to last.
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab on the last element → wrap to first.
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);

      // Restore focus to where it was before the modal opened.
      const prev = previousFocusRef.current as HTMLElement | null;
      if (prev && typeof prev.focus === 'function') {
        requestAnimationFrame(() => prev.focus());
      }
    };
  }, [enabled, getFocusable]);

  return containerRef;
}
