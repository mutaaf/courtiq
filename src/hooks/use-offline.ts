'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';

export function useOffline() {
  const isOnline = useAppStore((s) => s.isOnline);
  const setIsOnline = useAppStore((s) => s.setIsOnline);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setIsOnline]);

  return { isOnline };
}
