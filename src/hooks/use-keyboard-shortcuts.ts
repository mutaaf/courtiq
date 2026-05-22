'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ShortcutOptions {
  /** Called when Cmd/Ctrl+K is pressed — toggle command palette. */
  onCommandPalette?: () => void;
}

/**
 * Global keyboard shortcuts for coach power-users.
 *
 * Cmd/Ctrl+K  — command palette (delegated to caller)
 * Cmd/Ctrl+N  — new session
 * Cmd/Ctrl+.  — voice capture
 *
 * All shortcuts are suppressed when focus is inside a text input, textarea,
 * or contenteditable element so they never clobber typing.
 */
export function useKeyboardShortcuts({ onCommandPalette }: ShortcutOptions = {}) {
  const router = useRouter();

  useEffect(() => {
    function isTyping(e: KeyboardEvent): boolean {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd+K — command palette
      if (e.key === 'k') {
        e.preventDefault();
        onCommandPalette?.();
        return;
      }

      // Skip remaining shortcuts when typing in a form field
      if (isTyping(e)) return;

      // Cmd+N — new session
      if (e.key === 'n') {
        e.preventDefault();
        router.push('/sessions/new');
        return;
      }

      // Cmd+. — quick voice capture (easy to hit on either hand)
      if (e.key === '.') {
        e.preventDefault();
        router.push('/capture');
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router, onCommandPalette]);
}
