/**
 * Ticket 0042 — pure helpers for the coach-pause primitive.
 *
 * Three concerns under one file, mirroring the way weekly-digest-utils.test.ts
 * covers its sibling pure helpers:
 *   (a) isCoachPaused: returns true ONLY when paused_until is a real future
 *       ISO timestamp; null / past / epoch-zero / malformed → false.
 *   (b) signPauseToken + verifyPauseToken: HMAC roundtrip with a CRON_SECRET
 *       reuse; tamper / wrong secret / wrong coach all rejected; shape errors
 *       handled without throwing.
 *   (c) The token payload carries coachId + pausedUntilIso so the page can set
 *       paused_until atomically without re-deriving the target on the server.
 *
 * .test.ts (NOT .spec.ts) — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import {
  isCoachPaused,
  signPauseToken,
  verifyPauseToken,
} from '@/lib/coach-pause-utils';

const SECRET = 'test-secret-for-coach-pause-utils';
const COACH_ID = '00000000-0000-4000-a000-000000000042';

// ── isCoachPaused ──────────────────────────────────────────────────────────

describe('isCoachPaused', () => {
  it('returns false when paused_until is null', () => {
    expect(isCoachPaused({ paused_until: null })).toBe(false);
  });

  it('returns true when paused_until is a future ISO timestamp', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCoachPaused({ paused_until: future })).toBe(true);
  });

  it('returns false when paused_until is a past ISO timestamp', () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCoachPaused({ paused_until: past })).toBe(false);
  });

  it('returns false on epoch zero', () => {
    expect(isCoachPaused({ paused_until: '1970-01-01T00:00:00.000Z' })).toBe(false);
  });

  it('returns false for a malformed timestamp string', () => {
    expect(isCoachPaused({ paused_until: 'not-a-date' })).toBe(false);
  });

  it('uses the optional `now` parameter for deterministic tests', () => {
    const fixed = new Date('2026-06-01T00:00:00.000Z');
    expect(
      isCoachPaused({ paused_until: '2026-06-15T00:00:00.000Z' }, fixed),
    ).toBe(true);
    expect(
      isCoachPaused({ paused_until: '2026-05-01T00:00:00.000Z' }, fixed),
    ).toBe(false);
  });
});

// ── signPauseToken + verifyPauseToken ──────────────────────────────────────

describe('signPauseToken / verifyPauseToken', () => {
  const pausedUntilIso = '2026-06-25T00:00:00.000Z';

  it('roundtrips a valid token', () => {
    const token = signPauseToken({
      coachId: COACH_ID,
      pausedUntilIso,
      secret: SECRET,
    });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);

    const result = verifyPauseToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.coachId).toBe(COACH_ID);
      expect(result.pausedUntilIso).toBe(pausedUntilIso);
    }
  });

  it('rejects a token signed with a different secret', () => {
    const token = signPauseToken({
      coachId: COACH_ID,
      pausedUntilIso,
      secret: SECRET,
    });
    const result = verifyPauseToken(token, 'a-different-secret');
    expect(result.ok).toBe(false);
  });

  it('rejects a token whose payload has been tampered with', () => {
    const token = signPauseToken({
      coachId: COACH_ID,
      pausedUntilIso,
      secret: SECRET,
    });
    // Swap the coachId for a different one but keep the original HMAC ----
    // the verify must recompute over the new payload and reject.
    const fakeCoachId = '00000000-0000-4000-a000-000000009999';
    const tampered = `${fakeCoachId}.${token.slice(COACH_ID.length + 1)}`;
    const result = verifyPauseToken(tampered, SECRET);
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed token (wrong shape)', () => {
    expect(verifyPauseToken('', SECRET).ok).toBe(false);
    expect(verifyPauseToken('a.b', SECRET).ok).toBe(false);
    expect(verifyPauseToken('aaaa', SECRET).ok).toBe(false);
  });

  it('rejects when the secret is empty', () => {
    // Empty secret means anyone can mint tokens — refuse verification.
    const token = signPauseToken({
      coachId: COACH_ID,
      pausedUntilIso,
      secret: SECRET,
    });
    expect(verifyPauseToken(token, '').ok).toBe(false);
  });

  it('does not throw on completely garbage input', () => {
    // Defensive — the public page passes ?token=... straight in, so a stray
    // value (random string, missing dot, base64 without payload) must not throw.
    expect(() => verifyPauseToken('!!!@@@###', SECRET)).not.toThrow();
    expect(() => verifyPauseToken('only-one-segment', SECRET)).not.toThrow();
  });
});
