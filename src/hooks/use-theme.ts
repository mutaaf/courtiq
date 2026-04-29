'use client';
import { useSyncExternalStore, useCallback } from 'react';

function getTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem('courtiq-theme') as 'dark' | 'light') || 'light';
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light' as const);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('courtiq-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.classList.toggle('light', next === 'light');
    window.dispatchEvent(new StorageEvent('storage'));
  }, [theme]);

  // Apply theme on first render
  if (typeof window !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }

  return { theme, toggleTheme };
}
