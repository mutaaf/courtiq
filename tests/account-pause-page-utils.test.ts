/**
 * Ticket 0042 — pure helpers for the public `/account/pause?token=…` page.
 *
 * The page itself is a server component (renders + DB-writes via the
 * service-role client). The token-verify + target-derivation logic lives in
 * `src/lib/coach-pause-utils.ts` (`applyPauseToken`) so the path is
 * unit-testable without rendering React.
 *
 * `applyPauseToken({ token, secret, now })` returns:
 *   - { ok: true,  coachId, pausedUntilIso }   on a valid token
 *   - { ok: false, reason }                    otherwise (missing | malformed |
 *                                              invalid_signature | expired)
 *
 * The page writes paused_until = pausedUntilIso when ok; renders the error
 * state with NO DB write otherwise.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { applyPauseToken, signPauseToken } from '@/lib/coach-pause-utils';

const SECRET = 'test-secret-account-pause';
const COACH_ID = '00000000-0000-4000-a000-000000000043';

describe('applyPauseToken', () => {
  it('accepts a freshly-signed token and returns the coach id + target iso', () => {
    const pausedUntilIso = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const token = signPauseToken({ coachId: COACH_ID, pausedUntilIso, secret: SECRET });

    const out = applyPauseToken({ token, secret: SECRET });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.coachId).toBe(COACH_ID);
      expect(out.pausedUntilIso).toBe(pausedUntilIso);
    }
  });

  it("rejects with reason 'missing' when token is falsy", () => {
    const out = applyPauseToken({ token: '', secret: SECRET });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('missing');
  });

  it("rejects with reason 'invalid' when the signature does not verify", () => {
    const out = applyPauseToken({ token: 'a.b.c', secret: SECRET });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('invalid');
  });

  it("rejects with reason 'invalid' when the secret is wrong", () => {
    const pausedUntilIso = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const token = signPauseToken({ coachId: COACH_ID, pausedUntilIso, secret: SECRET });
    const out = applyPauseToken({ token, secret: 'different-secret' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('invalid');
  });
});
