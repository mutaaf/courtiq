'use client';

import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';

export function SyncIndicator() {
  const isOnline = useAppStore((s) => s.isOnline);
  const syncStatus = useAppStore((s) => s.syncStatus);

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
        <CloudOff className="h-3.5 w-3.5" />
        Offline — data saved locally
      </div>
    );
  }

  if (syncStatus === 'syncing') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Syncing...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500">
      <Cloud className="h-3.5 w-3.5" />
      All synced
    </div>
  );
}
