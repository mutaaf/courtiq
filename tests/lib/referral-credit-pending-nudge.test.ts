/**
 * Ticket 0085 — buildPendingNudgeMessage helper.
 *
 * Pure helper. Given the first names of the pending (signed-up-but-not-
 * yet-qualifying) referrals and a flag for whether the inviting coach is
 * on the FREE tier, returns the respectful share-template body the
 * on-deck "Text them a nudge" button forwards to the native share sheet.
 *
 * Voice contract (AGENTS.md / LESSONS#0023): no banned hype word. The
 * verbatim ban-list is NEVER embedded in the helper jsdoc (LESSONS#0034 /
 * #0088).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { buildPendingNudgeMessage } from '@/lib/referral-credit-utils';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

describe('buildPendingNudgeMessage (ticket 0085)', () => {
  it('renders the one-name salutation (paid inviter)', () => {
    const msg = buildPendingNudgeMessage({
      pendingFirstNames: ['James'],
      isFreeInviter: false,
    });
    expect(msg).toContain('James');
    expect(msg.startsWith('Hey James')).toBe(true);
  });

  it('renders the two-name salutation with "and" (paid inviter)', () => {
    const msg = buildPendingNudgeMessage({
      pendingFirstNames: ['James', 'Lin'],
      isFreeInviter: false,
    });
    expect(msg.startsWith('Hey James and Lin')).toBe(true);
  });

  it('renders the three-name Oxford-comma salutation (paid inviter)', () => {
    const msg = buildPendingNudgeMessage({
      pendingFirstNames: ['James', 'Lin', 'Riya'],
      isFreeInviter: false,
    });
    expect(msg.startsWith('Hey James, Lin, and Riya')).toBe(true);
  });

  it('renders the FREE-inviter variant when isFreeInviter is true (distinct copy)', () => {
    const paid = buildPendingNudgeMessage({
      pendingFirstNames: ['James'],
      isFreeInviter: false,
    });
    const free = buildPendingNudgeMessage({
      pendingFirstNames: ['James'],
      isFreeInviter: true,
    });
    expect(paid).not.toBe(free);
    // The free-tier amplification reads as the inviter working toward
    // their next free month — distinct from the paid-tier "saw you
    // signed up" line.
    expect(free.toLowerCase()).toContain('free month');
  });

  it('contains no AGENTS.md banned hype word across the name-count × tier matrix', () => {
    const counts: string[][] = [
      ['James'],
      ['James', 'Lin'],
      ['James', 'Lin', 'Riya'],
    ];
    for (const names of counts) {
      for (const isFree of [false, true]) {
        const msg = buildPendingNudgeMessage({
          pendingFirstNames: names,
          isFreeInviter: isFree,
        });
        const text = msg.toLowerCase();
        for (const banned of BANNED_HYPE) {
          expect(text, `names=${names.length} free=${isFree} contains banned "${banned}"`).not.toContain(banned);
        }
      }
    }
  });

  it('uses a literal space for the first-name join (no \\s+ surname-shape false positives — LESSONS#0061)', () => {
    const msg = buildPendingNudgeMessage({
      pendingFirstNames: ['James', 'Lin'],
      isFreeInviter: false,
    });
    // Defensive surname scan: a first-name followed by a literal space
    // and a capitalized word (a surname-shape) must not appear. The
    // join uses "and" / commas, not a bare space, so the scan stays
    // clean (LESSONS#0061 — literal space, not \s+).
    expect(/James [A-Z][a-z]+/.test(msg)).toBe(false);
    expect(/Lin [A-Z][a-z]+/.test(msg)).toBe(false);
  });

  it('falls back to an empty string when the pending name list is empty (defensive)', () => {
    const msg = buildPendingNudgeMessage({
      pendingFirstNames: [],
      isFreeInviter: false,
    });
    expect(msg).toBe('');
  });
});
