/**
 * Tests for Private Coach Notes utilities.
 *
 * Covers:
 *  - sortNotes: pinned notes appear before unpinned
 *  - sortNotes: within pinned group, sorts newest-first
 *  - sortNotes: within unpinned group, sorts newest-first
 *  - sortNotes: handles empty array
 *  - sortNotes: all pinned — sorts newest-first
 *  - sortNotes: no pinned — sorts newest-first
 *  - sortNotes: does not mutate the original array
 *  - countPinnedNotes: returns 0 for empty array
 *  - countPinnedNotes: returns 0 when no pinned notes
 *  - countPinnedNotes: counts only pinned notes
 *  - countPinnedNotes: returns total when all are pinned
 *  - truncateNote: returns original string when within limit
 *  - truncateNote: truncates at maxLen and appends ellipsis
 *  - truncateNote: trims trailing whitespace before appending ellipsis
 *  - truncateNote: handles exact-length string without truncation
 *  - truncateNote: uses custom maxLen when provided
 *  - searchNotes: returns all notes when query is empty string
 *  - searchNotes: returns all notes when query is whitespace only
 *  - searchNotes: matches case-insensitively
 *  - searchNotes: returns empty array when no match
 *  - searchNotes: matches partial content
 *  - isValidNoteContent: returns false for empty string
 *  - isValidNoteContent: returns false for whitespace-only string
 *  - isValidNoteContent: returns true for normal content
 *  - isValidNoteContent: returns false when content exceeds MAX_NOTE_LENGTH
 *  - isValidNoteContent: returns true at exactly MAX_NOTE_LENGTH
 */

import { describe, it, expect } from 'vitest';
import {
  sortNotes,
  countPinnedNotes,
  truncateNote,
  searchNotes,
  isValidNoteContent,
  MAX_NOTE_LENGTH,
} from '@/lib/player-notes-utils';
import type { PlayerNote } from '@/types/database';

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<PlayerNote> = {}): PlayerNote {
  return {
    id: 'note-1',
    player_id: 'player-1',
    team_id: 'team-1',
    coach_id: 'coach-1',
    content: 'Test note content',
    pinned: false,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

// ─── sortNotes ────────────────────────────────────────────────────────────────

describe('sortNotes', () => {
  it('places pinned notes before unpinned notes', () => {
    const unpinned = makeNote({ id: 'a', pinned: false, created_at: '2026-01-03T00:00:00Z' });
    const pinned   = makeNote({ id: 'b', pinned: true,  created_at: '2026-01-01T00:00:00Z' });
    const result = sortNotes([unpinned, pinned]);
    expect(result[0].id).toBe('b');
    expect(result[1].id).toBe('a');
  });

  it('sorts pinned notes newest-first within the pinned group', () => {
    const older = makeNote({ id: 'old', pinned: true, created_at: '2026-01-01T00:00:00Z' });
    const newer = makeNote({ id: 'new', pinned: true, created_at: '2026-01-03T00:00:00Z' });
    const result = sortNotes([older, newer]);
    expect(result[0].id).toBe('new');
    expect(result[1].id).toBe('old');
  });

  it('sorts unpinned notes newest-first within the unpinned group', () => {
    const older = makeNote({ id: 'old', pinned: false, created_at: '2026-01-01T00:00:00Z' });
    const newer = makeNote({ id: 'new', pinned: false, created_at: '2026-01-03T00:00:00Z' });
    const result = sortNotes([older, newer]);
    expect(result[0].id).toBe('new');
    expect(result[1].id).toBe('old');
  });

  it('handles an empty array', () => {
    expect(sortNotes([])).toEqual([]);
  });

  it('sorts all-pinned notes newest-first', () => {
    const notes = [
      makeNote({ id: 'a', pinned: true, created_at: '2026-01-01T00:00:00Z' }),
      makeNote({ id: 'b', pinned: true, created_at: '2026-01-03T00:00:00Z' }),
      makeNote({ id: 'c', pinned: true, created_at: '2026-01-02T00:00:00Z' }),
    ];
    const result = sortNotes(notes);
    expect(result.map(n => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts all-unpinned notes newest-first', () => {
    const notes = [
      makeNote({ id: 'a', pinned: false, created_at: '2026-01-01T00:00:00Z' }),
      makeNote({ id: 'b', pinned: false, created_at: '2026-01-03T00:00:00Z' }),
    ];
    const result = sortNotes(notes);
    expect(result[0].id).toBe('b');
  });

  it('does not mutate the original array', () => {
    const notes = [
      makeNote({ id: 'a', pinned: false }),
      makeNote({ id: 'b', pinned: true }),
    ];
    const original = [...notes];
    sortNotes(notes);
    expect(notes).toEqual(original);
  });
});

// ─── countPinnedNotes ─────────────────────────────────────────────────────────

describe('countPinnedNotes', () => {
  it('returns 0 for an empty array', () => {
    expect(countPinnedNotes([])).toBe(0);
  });

  it('returns 0 when no notes are pinned', () => {
    const notes = [makeNote({ pinned: false }), makeNote({ pinned: false })];
    expect(countPinnedNotes(notes)).toBe(0);
  });

  it('counts only pinned notes', () => {
    const notes = [
      makeNote({ id: 'a', pinned: true }),
      makeNote({ id: 'b', pinned: false }),
      makeNote({ id: 'c', pinned: true }),
    ];
    expect(countPinnedNotes(notes)).toBe(2);
  });

  it('returns total when all notes are pinned', () => {
    const notes = [makeNote({ pinned: true }), makeNote({ pinned: true })];
    expect(countPinnedNotes(notes)).toBe(2);
  });
});

// ─── truncateNote ─────────────────────────────────────────────────────────────

describe('truncateNote', () => {
  it('returns the original string when within the default limit', () => {
    const content = 'Short note';
    expect(truncateNote(content)).toBe(content);
  });

  it('truncates at maxLen and appends ellipsis', () => {
    const content = 'a'.repeat(130);
    const result = truncateNote(content);
    expect(result.length).toBeLessThanOrEqual(121); // 120 chars + '…'
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('trims trailing whitespace before appending ellipsis', () => {
    const content = 'a'.repeat(118) + '  '; // 120 total, ends with spaces
    const result = truncateNote(content + 'b'); // push past limit
    expect(result.endsWith(' \u2026') || result.endsWith('\u2026')).toBe(true);
    // More specifically: the char before '…' must not be a space
    const beforeEllipsis = result.slice(0, -1);
    expect(beforeEllipsis.trimEnd()).toBe(beforeEllipsis);
  });

  it('does not truncate a string of exactly maxLen characters', () => {
    const content = 'x'.repeat(120);
    expect(truncateNote(content)).toBe(content);
  });

  it('respects a custom maxLen', () => {
    const content = 'Hello, world!';
    const result = truncateNote(content, 5);
    expect(result).toBe('Hello\u2026');
  });
});

// ─── searchNotes ──────────────────────────────────────────────────────────────

describe('searchNotes', () => {
  const notes = [
    makeNote({ id: 'a', content: 'Great footwork in Tuesday drill' }),
    makeNote({ id: 'b', content: 'Needs to improve shooting form' }),
    makeNote({ id: 'c', content: 'Parent meeting scheduled for Friday' }),
  ];

  it('returns all notes when query is an empty string', () => {
    expect(searchNotes(notes, '')).toHaveLength(3);
  });

  it('returns all notes when query is whitespace only', () => {
    expect(searchNotes(notes, '   ')).toHaveLength(3);
  });

  it('matches case-insensitively', () => {
    const result = searchNotes(notes, 'FOOTWORK');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns an empty array when no notes match', () => {
    expect(searchNotes(notes, 'defensive rotation')).toHaveLength(0);
  });

  it('matches partial content', () => {
    const result = searchNotes(notes, 'parent');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c');
  });
});

// ─── isValidNoteContent ───────────────────────────────────────────────────────

describe('isValidNoteContent', () => {
  it('returns false for an empty string', () => {
    expect(isValidNoteContent('')).toBe(false);
  });

  it('returns false for a whitespace-only string', () => {
    expect(isValidNoteContent('   \n\t  ')).toBe(false);
  });

  it('returns true for normal content', () => {
    expect(isValidNoteContent('Good effort today')).toBe(true);
  });

  it('returns false when content exceeds MAX_NOTE_LENGTH', () => {
    expect(isValidNoteContent('a'.repeat(MAX_NOTE_LENGTH + 1))).toBe(false);
  });

  it('returns true at exactly MAX_NOTE_LENGTH characters', () => {
    expect(isValidNoteContent('a'.repeat(MAX_NOTE_LENGTH))).toBe(true);
  });
});
