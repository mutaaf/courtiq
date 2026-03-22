'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { startSyncEngine, stopSyncEngine } from '@/lib/sync/engine';

export function useSync() {
  const setSyncStatus = useAppStore((s) => s.setSyncStatus);

  useEffect(() => {
    startSyncEngine(setSyncStatus);
    return () => stopSyncEngine();
  }, [setSyncStatus]);
}
