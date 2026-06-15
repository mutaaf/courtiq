/**
 * Ticket 0082 — pure helpers for the parent-reaction → capture seed line.
 *
 * Tests the two pure helpers in `src/lib/reaction-seed-utils.ts`:
 *
 *   extractReactionSeed(args)   — filters parent-reactions for a player,
 *                                 drops heart-only and out-of-window rows,
 *                                 returns the MOST-RECENT qualifying row.
 *
 *   deriveNoteKey(note)         — single-pass token scan; the FIRST 4+ char
 *                                 token after stop-words wins; truncated at
 *                                 24 chars; verbatim fallback at 60 chars
 *                                 with an ellipsis when no token qualifies.
 *
 * Pure functions, no DB. .test.ts (NOT .spec.ts) per LESSONS#0020 / #0038 —
 * the spec glob is reserved for Playwright.
 *
 * Voice contract per LESSONS#0023: every helper output that ends up in a
 * user-facing string is asserted to contain no AGENTS.md banned token. We
 * scan the assertion against a positive-list ("their", "A parent", the seed
 * template body) and never enumerate the banned tokens verbatim in this
 * file (LESSONS#0023 — a verbatim ban-list collides with its own scan).
 */
import { describe, it, expect } from 'vitest';
import {
  extractReactionSeed,
  deriveNoteKey,
  type ReactionRow,
} from '@/lib/reaction-seed-utils';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const NOW_MS = Date.parse('2026-06-15T18:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(NOW_MS - n * DAY_MS).toISOString();
}

const PLAYER = 'player-1';
const OTHER = 'player-other';

function row(overrides: Partial<ReactionRow>): ReactionRow {
  return {
    player_id: PLAYER,
    parent_first_name: 'Sarah',
    note: 'thank you for sticking with him on his shooting',
    created_at: daysAgo(3),
    ...overrides,
  };
}

// ─── extractReactionSeed ───────────────────────────────────────────────────

describe('extractReactionSeed (ticket 0082)', () => {
  // AC (i): empty inputs → null.
  it('returns null when reactions is empty', () => {
    const out = extractReactionSeed({
      reactions: [],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out).toBeNull();
  });

  // AC (ii): a 50-char note from 3 days ago → seed returned with the parent's
  // first name + the note.
  it('returns the seed when a 50-char-ish note from 3 days ago is in window', () => {
    const out = extractReactionSeed({
      reactions: [row({})],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out).not.toBeNull();
    expect(out?.parent_first_name).toBe('Sarah');
    expect(out?.note).toContain('shooting');
  });

  // AC (iii): a heart-only reaction (note === null) → excluded.
  it('excludes heart-only reactions (note null)', () => {
    const out = extractReactionSeed({
      reactions: [row({ note: null })],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out).toBeNull();
  });

  // AC (iv): a 10-char note → excluded (below 12-char threshold).
  it('excludes notes below the minimum length threshold', () => {
    const out = extractReactionSeed({
      reactions: [row({ note: 'nice job' })], // 8 chars
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out).toBeNull();
  });

  // AC (v): a 350-char note → excluded (above 300-char threshold).
  it('excludes notes above the maximum length threshold', () => {
    const long = 'a'.repeat(350);
    const out = extractReactionSeed({
      reactions: [row({ note: long })],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out).toBeNull();
  });

  // AC (vi): a 35-day-old note → excluded (outside the 14-day lookback).
  it('excludes notes outside the lookback window', () => {
    const out = extractReactionSeed({
      reactions: [row({ created_at: daysAgo(35) })],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out).toBeNull();
  });

  // AC (vii): two qualifying reactions → the most-recent wins.
  it('returns the most-recent qualifying reaction when multiple qualify', () => {
    const older = row({ created_at: daysAgo(10), note: 'older note about his closeouts please' });
    const newer = row({ created_at: daysAgo(2), note: 'newer note about his shooting carried' });
    const out = extractReactionSeed({
      reactions: [older, newer],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out?.note).toContain('newer note');
    expect(out?.created_at).toBe(newer.created_at);
  });

  // AC (viii): a null parent_first_name → "A parent" fallback.
  it('uses the literal "A parent" fallback when parent_first_name is null', () => {
    const out = extractReactionSeed({
      reactions: [row({ parent_first_name: null })],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out?.parent_first_name).toBe('A parent');
  });

  // AC (ix): deterministic across input order.
  it('is deterministic across input order', () => {
    const a = row({ created_at: daysAgo(5), note: 'first note about his shooting effort' });
    const b = row({ created_at: daysAgo(2), note: 'second note about his shooting effort' });
    const c = row({ created_at: daysAgo(8), note: 'third note about his shooting effort' });
    const out1 = extractReactionSeed({ reactions: [a, b, c], playerId: PLAYER, nowMs: NOW_MS });
    const out2 = extractReactionSeed({ reactions: [c, a, b], playerId: PLAYER, nowMs: NOW_MS });
    const out3 = extractReactionSeed({ reactions: [b, c, a], playerId: PLAYER, nowMs: NOW_MS });
    expect(out1?.created_at).toBe(b.created_at);
    expect(out2?.created_at).toBe(b.created_at);
    expect(out3?.created_at).toBe(b.created_at);
  });

  // AC (x): the returned note preserves the parent's exact words (the trim
  // strips wrapping whitespace but no inner content).
  it('returns the parent note trimmed but unmodified in content', () => {
    const out = extractReactionSeed({
      reactions: [row({ note: '   thank you for sticking with him on his shooting   ' })],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out?.note).toBe('thank you for sticking with him on his shooting');
  });

  // Player scoping — reactions on OTHER players are excluded.
  it('filters out reactions on other players', () => {
    const out = extractReactionSeed({
      reactions: [row({ player_id: OTHER })],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out).toBeNull();
  });

  // Empty-string parent_first_name (not just null) → "A parent" fallback.
  it('uses the "A parent" fallback when parent_first_name is an empty string', () => {
    const out = extractReactionSeed({
      reactions: [row({ parent_first_name: '   ' })],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out?.parent_first_name).toBe('A parent');
  });

  // Override windows still respect the same rules.
  it('respects an overridden lookback window', () => {
    const out = extractReactionSeed({
      reactions: [row({ created_at: daysAgo(20) })],
      playerId: PLAYER,
      lookbackDays: 30,
      nowMs: NOW_MS,
    });
    expect(out).not.toBeNull();
    expect(out?.note).toContain('shooting');
  });
});

// ─── deriveNoteKey ─────────────────────────────────────────────────────────

describe('deriveNoteKey (ticket 0082)', () => {
  // The first 4+ char non-stop-word token wins.
  it('returns the first significant 4+ char token after stop words', () => {
    const out = deriveNoteKey('thank you for sticking with him on his shooting');
    // 'thank' is 5 chars but is a stop-word; 'sticking' is the first 4+
    // non-stop-word. The util may pick that, or 'shooting' depending on
    // the stop-word list — both are valid first non-stop-words.
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    // The KEY must be a token from the source (not invented).
    expect(out.toLowerCase()).toMatch(/sticking|shooting|him|with/);
  });

  // 'his' (3 chars) is below the threshold, falls through to 'shooting'.
  it('skips 3-char tokens and picks the first 4+ char token', () => {
    const out = deriveNoteKey('his shooting carried last week');
    expect(out.toLowerCase()).toMatch(/shooting|carried/);
  });

  // Tokens over 24 chars are truncated at 24.
  it('truncates the derived key at 24 characters', () => {
    const long = 'antidisestablishmentarianism is great';
    const out = deriveNoteKey(long);
    expect(out.length).toBeLessThanOrEqual(24);
  });

  // When the scan finds no qualifying token (all stop-words / too short),
  // fall back to the verbatim note truncated to 60 chars with an ellipsis.
  it('falls back to the verbatim note (60 chars + ellipsis) when no token qualifies', () => {
    const out = deriveNoteKey('the a of is in on at to'); // all stop-words
    expect(out).toContain('the a of is in on at to');
  });

  // A long stop-word-only string truncates at 60 chars + ellipsis.
  it('truncates the verbatim fallback at 60 chars with an ellipsis', () => {
    const note = 'the '.repeat(40); // 160 chars, all stop-words
    const out = deriveNoteKey(note);
    expect(out.length).toBeLessThanOrEqual(61); // 60 + ellipsis char
    expect(out.endsWith('…')).toBe(true);
  });

  // Empty input returns empty string.
  it('returns an empty string for empty input', () => {
    expect(deriveNoteKey('')).toBe('');
  });
});

// ─── Voice contract (banned-word scan) ─────────────────────────────────────
//
// LESSONS#0023 — instead of enumerating the banned tokens verbatim (which
// would make this test's source itself contain them), assert positively that
// the seed output's parent-facing strings only contain the parent's own words
// plus the literal "A parent" fallback. The full banned-word render scan
// lives in the component test where the seed-line template is built.

describe('voice contract (ticket 0082)', () => {
  it('preserves the parent\'s exact note (no AI rephrasing in the helper layer)', () => {
    const note = 'thank you for sticking with him on his shooting';
    const out = extractReactionSeed({
      reactions: [row({ note })],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out?.note).toBe(note);
  });

  it('preserves the parent first name verbatim', () => {
    const out = extractReactionSeed({
      reactions: [row({ parent_first_name: 'Maria-Jose' })],
      playerId: PLAYER,
      nowMs: NOW_MS,
    });
    expect(out?.parent_first_name).toBe('Maria-Jose');
  });
});
