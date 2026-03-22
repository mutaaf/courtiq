'use client';

import { useCallback } from 'react';

export function useHaptic() {
  const vibrate = useCallback((pattern: number | number[] = 50) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  return {
    tap: () => vibrate(50),
    success: () => vibrate([50, 50, 50]),
    error: () => vibrate([100, 50, 100]),
    recording: () => vibrate(100),
  };
}
