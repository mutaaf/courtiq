/**
 * Pure utilities for Private Coach Notes.
 * All functions are side-effect free and testable.
 */

import type { PlayerNote } from '@/types/database';

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sort notes: pinned first, then newest-first within each group.
 * Returns a new array without mutating the original.
 */
export function sortNotes(notes: PlayerNote[]): PlayerNote[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ─── Counting ─────────────────────────────────────────────────────────────────

/** Returns the number of pinned notes. */
export function countPinnedNotes(notes: PlayerNote[]): number {
  return notes.filter(n => n.pinned).length;
}

// ─── Display ──────────────────────────────────────────────────────────────────

/**
 * Truncate note content to `maxLen` characters, appending an ellipsis.
 * Trims trailing whitespace before adding '…'.
 */
export function truncateNote(content: string, maxLen = 120): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen).trimEnd() + '\u2026';
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Filter notes whose content includes `queryStr` (case-insensitive).
 * Returns all notes unchanged when `queryStr` is empty or whitespace-only.
 */
export function searchNotes(notes: PlayerNote[], queryStr: string): PlayerNote[] {
  const q = queryStr.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter(n => n.content.toLowerCase().includes(q));
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Maximum allowed note length (characters). */
export const MAX_NOTE_LENGTH = 2000;

/** Returns true when content is valid for saving. */
export function isValidNoteContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NOTE_LENGTH;
}
