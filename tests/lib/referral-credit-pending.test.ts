/**
 * Ticket 0085 — summarizePendingReferrals helper.
 *
 * Forward-looking sibling to 0074's countQualifiedReferrals. Given the
 * caller's converted-coach rows (each with shipped_artifact_count +
 * head_coached_observation_count + first_name + signed_up_at), returns:
 *  - the up-to-5 capped list of pending (signed-up-but-not-yet-qualifying)
 *    coaches with first name + signed-up-at + a rendered "needs to ship X"
 *    line in clipboard voice,
 *  - the count of MORE qualifying coaches needed to cross the next
 *    milestone (3 / 10 / 25 from the existing qualified count),
 *  - the literal milestone-enum key for the next milestone (or null if
 *    the inviter has already crossed qualified_25).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 * Pure helper — no DB, no AI. Mirrors 0074's countQualifiedReferrals.
 */
import { describe, it, expect } from 'vitest';
import {
  summarizePendingReferrals,
  type ConvertedCoachRowWithName,
} from '@/lib/referral-credit-utils';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

function row(
  partial: Partial<ConvertedCoachRowWithName> & {
    id: string;
    first_name: string;
  },
): ConvertedCoachRowWithName {
  return {
    signed_up_at: '2026-06-01T12:00:00Z',
    shipped_artifact_count: 0,
    head_coached_observation_count: 0,
    ...partial,
  };
}

describe('summarizePendingReferrals (ticket 0085)', () => {
  it('returns an empty pending list and nextMilestoneIn:3 when there are no converted rows', () => {
    const out = summarizePendingReferrals({
      convertedCoachRows: [],
      nowMs: Date.now(),
    });
    expect(out.pending).toEqual([]);
    expect(out.nextMilestoneIn).toBe(3);
    expect(out.nextMilestoneKind).toBe('qualified_3');
  });

  it('returns an empty pending list and nextMilestoneIn:1 when 2 converted and ALL qualified', () => {
    const out = summarizePendingReferrals({
      convertedCoachRows: [
        row({ id: 'c-1', first_name: 'Maya', shipped_artifact_count: 1 }),
        row({
          id: 'c-2',
          first_name: 'James',
          head_coached_observation_count: 8,
        }),
      ],
      nowMs: Date.now(),
    });
    expect(out.pending).toEqual([]);
    expect(out.nextMilestoneIn).toBe(1);
    expect(out.nextMilestoneKind).toBe('qualified_3');
  });

  it('returns 2 pending and nextMilestoneIn:3 when 2 converted but NONE qualified (pending coaches do not count toward the threshold)', () => {
    const out = summarizePendingReferrals({
      convertedCoachRows: [
        row({ id: 'c-1', first_name: 'Lin' }),
        row({ id: 'c-2', first_name: 'Riya' }),
      ],
      nowMs: Date.now(),
    });
    expect(out.pending.length).toBe(2);
    expect(out.pending.map((p) => p.firstName)).toEqual(['Lin', 'Riya']);
    expect(out.nextMilestoneIn).toBe(3);
    expect(out.nextMilestoneKind).toBe('qualified_3');
  });

  it('caps the pending list at 5 even when 8 are pending', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ id: `c-${i}`, first_name: `Coach${i}` }),
    );
    const out = summarizePendingReferrals({
      convertedCoachRows: rows,
      nowMs: Date.now(),
    });
    expect(out.pending.length).toBe(5);
  });

  it('mixes 2 qualified + 3 pending → 3 pending, nextMilestoneIn:1 (still need one more qualifying)', () => {
    const out = summarizePendingReferrals({
      convertedCoachRows: [
        row({ id: 'c-1', first_name: 'Maya', shipped_artifact_count: 1 }),
        row({
          id: 'c-2',
          first_name: 'James',
          head_coached_observation_count: 6,
        }),
        row({ id: 'c-3', first_name: 'Lin' }),
        row({ id: 'c-4', first_name: 'Riya' }),
        row({ id: 'c-5', first_name: 'Sam' }),
      ],
      nowMs: Date.now(),
    });
    expect(out.pending.length).toBe(3);
    expect(out.pending.map((p) => p.firstName)).toEqual(['Lin', 'Riya', 'Sam']);
    expect(out.nextMilestoneIn).toBe(1);
    expect(out.nextMilestoneKind).toBe('qualified_3');
  });

  it('returns nextMilestoneKind:qualified_25 and nextMilestoneIn:14 when 11 qualified', () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      row({
        id: `c-${i}`,
        first_name: `Coach${i}`,
        shipped_artifact_count: 1,
      }),
    );
    const out = summarizePendingReferrals({
      convertedCoachRows: rows,
      nowMs: Date.now(),
    });
    expect(out.pending).toEqual([]);
    expect(out.nextMilestoneIn).toBe(14);
    expect(out.nextMilestoneKind).toBe('qualified_25');
  });

  it('returns nextMilestoneKind:null when 25+ qualified', () => {
    const rows = Array.from({ length: 27 }, (_, i) =>
      row({
        id: `c-${i}`,
        first_name: `Coach${i}`,
        shipped_artifact_count: 1,
      }),
    );
    const out = summarizePendingReferrals({
      convertedCoachRows: rows,
      nowMs: Date.now(),
    });
    expect(out.nextMilestoneKind).toBeNull();
  });

  it('every rendered needsToQualify string contains no AGENTS.md banned hype word', () => {
    const out = summarizePendingReferrals({
      convertedCoachRows: [
        row({ id: 'c-1', first_name: 'Lin' }),
        row({ id: 'c-2', first_name: 'Riya' }),
      ],
      nowMs: Date.now(),
    });
    for (const p of out.pending) {
      const text = p.needsToQualify.toLowerCase();
      for (const banned of BANNED_HYPE) {
        expect(text, `pending "${p.firstName}" contains banned "${banned}"`).not.toContain(banned);
      }
    }
  });

  it('returned firstName is surname-stripped on a literal space (LESSONS#0061)', () => {
    const out = summarizePendingReferrals({
      convertedCoachRows: [
        // Pre-stripped is the expected contract — the route does the
        // first-name extraction. Confirm the helper preserves a single
        // word verbatim and does not re-introduce a surname.
        row({ id: 'c-1', first_name: 'Lin' }),
      ],
      nowMs: Date.now(),
    });
    expect(out.pending[0].firstName).toBe('Lin');
    expect(out.pending[0].firstName).not.toContain(' ');
  });

  it('is deterministic across input order', () => {
    const a = summarizePendingReferrals({
      convertedCoachRows: [
        row({ id: 'c-1', first_name: 'Lin' }),
        row({ id: 'c-2', first_name: 'Riya' }),
      ],
      nowMs: Date.now(),
    });
    const b = summarizePendingReferrals({
      convertedCoachRows: [
        row({ id: 'c-2', first_name: 'Riya' }),
        row({ id: 'c-1', first_name: 'Lin' }),
      ],
      nowMs: Date.now(),
    });
    expect(a.pending.length).toBe(b.pending.length);
    expect(a.nextMilestoneIn).toBe(b.nextMilestoneIn);
    expect(a.nextMilestoneKind).toBe(b.nextMilestoneKind);
  });

  it('passes through the signed_up_at timestamp on every pending row', () => {
    const out = summarizePendingReferrals({
      convertedCoachRows: [
        row({
          id: 'c-1',
          first_name: 'Lin',
          signed_up_at: '2026-05-10T08:00:00Z',
        }),
      ],
      nowMs: Date.now(),
    });
    expect(out.pending[0].signedUpAt).toBe('2026-05-10T08:00:00Z');
  });
});
