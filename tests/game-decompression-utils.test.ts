/**
 * Ticket 0069 — pure-helper test for game-decompression-utils.
 *
 *  - validateDecompressionTranscript: bounds + voice scan
 *  - validateDecompressionDuration: 1..60 range
 *  - stripSurnameShape: LITERAL space (LESSONS#0061) — not `\s+`
 *  - isWithinDecompressionWindow: 24h gate using (date, start_time)
 *    composition and the created_at fallback
 *  - isGameLikeSessionType: type allow-list
 *
 *  Critical lesson check (LESSONS#0061): the surname-strip regex MUST use
 *  a literal space, never `\s+`, so a labelled-key newline never trips it
 *  ("Maya\nAge group: …" must NOT match).
 */
import { describe, it, expect } from 'vitest';
import {
  isGameLikeSessionType,
  isWithinDecompressionWindow,
  stripSurnameShape,
  validateDecompressionDuration,
  validateDecompressionTranscript,
} from '@/lib/game-decompression-utils';

describe('validateDecompressionTranscript', () => {
  it('returns the trimmed string on a valid transcript', () => {
    const out = validateDecompressionTranscript('  rebounds and effort  ');
    expect(out).toBe('rebounds and effort');
  });

  it('throws length on empty / whitespace', () => {
    expect(() => validateDecompressionTranscript('')).toThrow(/length/);
    expect(() => validateDecompressionTranscript('   ')).toThrow(/length/);
  });

  it('throws length when over 1200 chars', () => {
    expect(() => validateDecompressionTranscript('a'.repeat(1201))).toThrow(/length/);
  });

  it('throws voice when a banned word appears', () => {
    expect(() => validateDecompressionTranscript('it was an amazing game')).toThrow(/voice/);
    expect(() => validateDecompressionTranscript('what a journey today')).toThrow(/voice/);
  });
});

describe('validateDecompressionDuration', () => {
  it('returns the rounded duration on valid input', () => {
    expect(validateDecompressionDuration(28)).toBe(28);
    expect(validateDecompressionDuration(28.6)).toBe(29);
  });

  it('throws on out-of-range', () => {
    expect(() => validateDecompressionDuration(0)).toThrow(/length/);
    expect(() => validateDecompressionDuration(61)).toThrow(/length/);
    expect(() => validateDecompressionDuration(Number.NaN)).toThrow(/length/);
    expect(() => validateDecompressionDuration('30')).toThrow(/length/);
  });
});

describe('stripSurnameShape (LESSONS#0061)', () => {
  it('strips a "First Last" surname shape', () => {
    expect(stripSurnameShape('Maya Walker outran the press')).toBe('Maya outran the press');
  });

  it('leaves a labelled-key newline alone (LESSONS#0061 — literal space, not \\s+)', () => {
    // The lesson: `\s+` would conflate "Maya\nAge" with a surname; literal
    // space does NOT.
    const input = 'Maya\nAge group: 11-13';
    expect(stripSurnameShape(input)).toBe(input);
  });

  it('leaves a single-word string alone', () => {
    expect(stripSurnameShape('rebounds')).toBe('rebounds');
  });

  it('leaves the empty string alone', () => {
    expect(stripSurnameShape('')).toBe('');
  });
});

describe('isWithinDecompressionWindow', () => {
  it('returns true for a session created within the last 24h', () => {
    const now = new Date('2026-06-05T18:00:00Z');
    expect(
      isWithinDecompressionWindow(
        { date: '2026-06-05', start_time: '11:00:00', created_at: '2026-06-05T11:30:00Z' },
        now,
      ),
    ).toBe(true);
  });

  it('returns false for a session older than 24h', () => {
    const now = new Date('2026-06-05T18:00:00Z');
    expect(
      isWithinDecompressionWindow(
        { date: '2026-06-02', start_time: null, created_at: '2026-06-02T11:00:00Z' },
        now,
      ),
    ).toBe(false);
  });

  it('falls back to created_at when date is absent', () => {
    const now = new Date('2026-06-05T18:00:00Z');
    expect(
      isWithinDecompressionWindow({ created_at: '2026-06-05T12:00:00Z' }, now),
    ).toBe(true);
  });
});

describe('isGameLikeSessionType', () => {
  it('accepts game/scrimmage/tournament', () => {
    expect(isGameLikeSessionType('game')).toBe(true);
    expect(isGameLikeSessionType('scrimmage')).toBe(true);
    expect(isGameLikeSessionType('tournament')).toBe(true);
  });

  it('rejects practice/training/anything else', () => {
    expect(isGameLikeSessionType('practice')).toBe(false);
    expect(isGameLikeSessionType('training')).toBe(false);
    expect(isGameLikeSessionType('')).toBe(false);
    expect(isGameLikeSessionType(null)).toBe(false);
  });
});
