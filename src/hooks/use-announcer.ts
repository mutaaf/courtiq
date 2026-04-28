'use client';

import { useCallback } from 'react';

/**
 * Thin wrapper around Web Speech API for the Practice Timer audio announcements.
 * When `enabled` is false, speak() is a no-op so callers don't need to gate it.
 */
export function useAnnouncer(enabled: boolean) {
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = useCallback(
    (text: string) => {
      if (!supported || !enabled || !text.trim()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    },
    [supported, enabled]
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
  }, [supported]);

  return { speak, cancel, supported };
}
