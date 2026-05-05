'use client';

import { useState, useEffect } from 'react';
import { formatElapsed } from '@/lib/elapsed-time-utils';

// Returns a live-updating formatted elapsed time string, refreshed every 30 seconds.
// Returns null when startIso is null (practice not started).
export function useElapsedTime(startIso: string | null): string | null {
  const [elapsed, setElapsed] = useState<string | null>(() => formatElapsed(startIso));

  useEffect(() => {
    setElapsed(formatElapsed(startIso));
    if (!startIso) return;

    const id = setInterval(() => {
      setElapsed(formatElapsed(startIso));
    }, 30_000);

    return () => clearInterval(id);
  }, [startIso]);

  return elapsed;
}
