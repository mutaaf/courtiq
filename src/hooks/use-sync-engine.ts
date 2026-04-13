'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { startSyncEngine, stopSyncEngine, triggerSync } from '@/lib/sync/engine';

/**
 * Wires up the background sync engine for the dashboard.
 * - Monitors online/offline state and updates the global store.
 * - Starts the periodic sync engine on mount, stops on unmount.
 * - Listens for SYNC_OBSERVATIONS messages from the service worker
 *   (fired by the BackgroundSync API when connectivity is restored).
 */
export function useSyncEngine() {
  const setIsOnline = useAppStore((s) => s.setIsOnline);
  const setSyncStatus = useAppStore((s) => s.setSyncStatus);

  useEffect(() => {
    // Initialise from actual navigator state (the store defaults to true)
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // Ask the service worker to register a BackgroundSync tag so the sync
      // fires even if the tab is closed when connectivity returns.
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          // BackgroundSync API is not available in all browsers
          (reg as any).sync?.register('sync-observations').catch(() => {});
        });
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for SYNC_OBSERVATIONS messages posted by the service worker
    // when it processes a BackgroundSync 'sync' event.
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_OBSERVATIONS') {
        triggerSync(setSyncStatus);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    // Start periodic sync (30 s interval + fires on 'online' event internally)
    startSyncEngine(setSyncStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      stopSyncEngine();
    };
  }, [setIsOnline, setSyncStatus]);
}
