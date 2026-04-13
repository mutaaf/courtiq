'use client';
import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'courtiq-high-contrast';

function getHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

/**
 * Returns the current high-contrast preference and a toggle function.
 *
 * Preference is stored in localStorage under `courtiq-high-contrast`.
 * The `.high-contrast` class is applied to `<html>` and removed when off.
 * SSR-safe — returns false on the server and hydrates on first client render.
 */
export function useHighContrast() {
  const enabled = useSyncExternalStore(subscribe, getHighContrast, () => false);

  const toggleHighContrast = useCallback(() => {
    const next = !enabled;
    localStorage.setItem(STORAGE_KEY, String(next));
    document.documentElement.classList.toggle('high-contrast', next);
    window.dispatchEvent(new StorageEvent('storage'));
  }, [enabled]);

  // Apply on first render (handles page reload with stored preference)
  if (typeof window !== 'undefined') {
    document.documentElement.classList.toggle('high-contrast', enabled);
  }

  return { highContrast: enabled, toggleHighContrast };
}
