/**
 * Ticket 0047 — pure helper for the referral-conversion celebration card.
 *
 * `referralCelebrationFor` diffs the caller's current vs. last-seen referral
 * count and builds the celebration message. No DB I/O lives here; the routes
 * do the IO and pass values in. Three shapes:
 *
 *   - no new conversions     → { show: false, message: null }
 *   - new + name resolved    → { show: true,  message: "Coach Maya you invited just joined SportsIQ" }
 *   - new + name lookup null → { show: true,  message: "Someone you invited just joined SportsIQ" }
 *
 * Also: regression for currentCount < lastSeenCount (treat as no new
 * conversions; the seen-POST clamps it but defensively the helper still
 * returns show:false).
 *
 * Voice: the rendered message contains NO AGENTS.md banned word
 * (journey / amazing / exciting / elevate / empower / synergy). Per
 * LESSONS#0023 the helper builds the message positively (factual: "Coach X you
 * invited just joined SportsIQ") rather than enumerating banned tokens.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { referralCelebrationFor } from '@/lib/referral-celebration-utils';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

describe('referralCelebrationFor (ticket 0047)', () => {
  it('returns show:false when currentCount equals lastSeenCount', () => {
    expect(
      referralCelebrationFor({ currentCount: 3, lastSeenCount: 3, latestReferral: null }),
    ).toEqual({ show: false, message: null });
  });

  it('returns show:false when currentCount is below lastSeenCount (defensive)', () => {
    expect(
      referralCelebrationFor({ currentCount: 1, lastSeenCount: 5, latestReferral: null }),
    ).toEqual({ show: false, message: null });
  });

  it('returns the named message when a new conversion has a known first name', () => {
    const out = referralCelebrationFor({
      currentCount: 2,
      lastSeenCount: 1,
      latestReferral: { coach_first_name: 'Maya', joined_at: '2026-05-28T00:00:00.000Z' },
    });
    expect(out.show).toBe(true);
    expect(out.message).toBe('Coach Maya you invited just joined SportsIQ');
  });

  it('returns the anonymous-fallback message when latestReferral is null but count advanced', () => {
    const out = referralCelebrationFor({
      currentCount: 1,
      lastSeenCount: 0,
      latestReferral: null,
    });
    expect(out.show).toBe(true);
    expect(out.message).toBe('Someone you invited just joined SportsIQ');
  });

  it('never emits an AGENTS.md banned token in either message path', () => {
    const named = referralCelebrationFor({
      currentCount: 7,
      lastSeenCount: 6,
      latestReferral: { coach_first_name: 'Maya', joined_at: '2026-05-28T00:00:00.000Z' },
    });
    const anon = referralCelebrationFor({
      currentCount: 1,
      lastSeenCount: 0,
      latestReferral: null,
    });
    const both = `${named.message ?? ''} ${anon.message ?? ''}`.toLowerCase();
    for (const banned of BANNED) {
      expect(both).not.toContain(banned);
    }
  });

  it('trims a multi-word first name to the first token (defensive)', () => {
    const out = referralCelebrationFor({
      currentCount: 2,
      lastSeenCount: 1,
      // A coach record might carry a full name; the helper should only use the
      // first token so emails / surnames / full-name leakage is impossible at
      // the message layer even if the route ever passed something wider.
      latestReferral: { coach_first_name: 'Maya Patel', joined_at: '2026-05-28T00:00:00.000Z' },
    });
    expect(out.show).toBe(true);
    expect(out.message).toBe('Coach Maya you invited just joined SportsIQ');
  });
});
