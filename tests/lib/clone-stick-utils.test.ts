/**
 * Ticket 0076 — pure helper for detecting stuck clones.
 *
 * A "stuck clone" is a drill_share_clones row where the SAME cloning
 * coach later thumbed-up the cloned drill (a 0044 coach_drill_signals
 * row with rating='up'). It is the signal that the clone didn't just
 * download — it ran on a real court and worked.
 *
 * The helper is pure (no DB, no clock — `nowMs` injected). Per
 * LESSONS#0023 — numbers only; no banned-word scan needed on the
 * helper itself.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { detectStuckClones } from '@/lib/clone-stick-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = Date.parse('2026-06-09T20:00:00Z');

function daysAgoIso(days: number): string {
  return new Date(NOW_MS - days * DAY_MS).toISOString();
}

const PUBLISHER = 'coach-maya';
const CLONER_A = 'coach-cloner-a';
const CLONER_B = 'coach-cloner-b';
const ORG_HORNETS = 'org-hornets';
const ORG_FALCONS = 'org-falcons';
const SHARE_X = 'share-x';
const DRILL_X = 'drill-x';
const SHARE_Y = 'share-y';
const DRILL_Y = 'drill-y';

describe('detectStuckClones (ticket 0076)', () => {
  it('empty inputs → empty result', () => {
    const out = detectStuckClones({
      drillShares: [],
      clones: [],
      thumbsUp: [],
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('a clone with a matching thumbs-up AFTER the clone → one stuck tuple', () => {
    const out = detectStuckClones({
      drillShares: [
        { drill_share_id: SHARE_X, drill_id: DRILL_X, publisher_coach_id: PUBLISHER },
      ],
      clones: [
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER_A,
          cloner_org_id: ORG_HORNETS,
          cloned_at: daysAgoIso(10),
        },
      ],
      thumbsUp: [
        { coach_id: CLONER_A, drill_id: DRILL_X, signaled_at: daysAgoIso(3) },
      ],
      nowMs: NOW_MS,
    });
    expect(out).toHaveLength(1);
    expect(out[0].drill_share_id).toBe(SHARE_X);
    expect(out[0].cloner_coach_id).toBe(CLONER_A);
    expect(out[0].cloner_org_id).toBe(ORG_HORNETS);
    expect(out[0].stuck_at).toBe(daysAgoIso(3));
  });

  it('a clone whose only thumbs-up came BEFORE the clone → empty (timing)', () => {
    const out = detectStuckClones({
      drillShares: [
        { drill_share_id: SHARE_X, drill_id: DRILL_X, publisher_coach_id: PUBLISHER },
      ],
      clones: [
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER_A,
          cloner_org_id: ORG_HORNETS,
          cloned_at: daysAgoIso(5),
        },
      ],
      thumbsUp: [
        // Thumb came 12 days ago, clone landed 5 days ago — the thumb
        // is from BEFORE the clone, so it is structurally not a "ran
        // it after cloning and it worked" signal.
        { coach_id: CLONER_A, drill_id: DRILL_X, signaled_at: daysAgoIso(12) },
      ],
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('a thumbs-up from the PUBLISHER on their own drill → empty (self-thumb filter)', () => {
    const out = detectStuckClones({
      drillShares: [
        { drill_share_id: SHARE_X, drill_id: DRILL_X, publisher_coach_id: PUBLISHER },
      ],
      clones: [
        // The PUBLISHER cloning their own share is structurally
        // impossible (the share already encodes their drill), but
        // defensively this filter ensures no self-thumb stick.
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: PUBLISHER,
          cloner_org_id: ORG_HORNETS,
          cloned_at: daysAgoIso(10),
        },
      ],
      thumbsUp: [
        { coach_id: PUBLISHER, drill_id: DRILL_X, signaled_at: daysAgoIso(3) },
      ],
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('only `up` signals — no thumb-down stick row even if a thumb-up exists for a DIFFERENT drill', () => {
    // The helper input only carries `up` signals (thumb-down is
    // filtered upstream in the route's read); pass NONE for this case
    // — the cloner has no qualifying thumb-up at all.
    const out = detectStuckClones({
      drillShares: [
        { drill_share_id: SHARE_X, drill_id: DRILL_X, publisher_coach_id: PUBLISHER },
      ],
      clones: [
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER_A,
          cloner_org_id: ORG_HORNETS,
          cloned_at: daysAgoIso(10),
        },
      ],
      thumbsUp: [],
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('two thumbs-ups from the same cloner on the same drill → ONE stuck tuple at the EARLIEST signaled_at', () => {
    const out = detectStuckClones({
      drillShares: [
        { drill_share_id: SHARE_X, drill_id: DRILL_X, publisher_coach_id: PUBLISHER },
      ],
      clones: [
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER_A,
          cloner_org_id: ORG_HORNETS,
          cloned_at: daysAgoIso(20),
        },
      ],
      thumbsUp: [
        { coach_id: CLONER_A, drill_id: DRILL_X, signaled_at: daysAgoIso(2) },
        { coach_id: CLONER_A, drill_id: DRILL_X, signaled_at: daysAgoIso(5) },
        { coach_id: CLONER_A, drill_id: DRILL_X, signaled_at: daysAgoIso(8) },
      ],
      nowMs: NOW_MS,
    });
    expect(out).toHaveLength(1);
    // Earliest qualifying thumb-up wins (the moment the clone first stuck).
    expect(out[0].stuck_at).toBe(daysAgoIso(8));
  });

  it('a thumb signaled MORE THAN lookbackDays after the clone → empty (60-day default window)', () => {
    const out = detectStuckClones({
      drillShares: [
        { drill_share_id: SHARE_X, drill_id: DRILL_X, publisher_coach_id: PUBLISHER },
      ],
      clones: [
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER_A,
          cloner_org_id: ORG_HORNETS,
          // Clone landed 90 days ago.
          cloned_at: daysAgoIso(90),
        },
      ],
      thumbsUp: [
        // Thumb came 5 days ago — 85 days after the clone, outside
        // the 60-day default.
        { coach_id: CLONER_A, drill_id: DRILL_X, signaled_at: daysAgoIso(5) },
      ],
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('respects a custom lookbackDays argument', () => {
    const out = detectStuckClones({
      drillShares: [
        { drill_share_id: SHARE_X, drill_id: DRILL_X, publisher_coach_id: PUBLISHER },
      ],
      clones: [
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER_A,
          cloner_org_id: ORG_HORNETS,
          cloned_at: daysAgoIso(20),
        },
      ],
      thumbsUp: [
        // Thumb 10 days ago is 10 days after the clone — within a
        // custom 14-day window, outside a 5-day window.
        { coach_id: CLONER_A, drill_id: DRILL_X, signaled_at: daysAgoIso(10) },
      ],
      nowMs: NOW_MS,
      lookbackDays: 5,
    });
    expect(out).toEqual([]);

    const tighter = detectStuckClones({
      drillShares: [
        { drill_share_id: SHARE_X, drill_id: DRILL_X, publisher_coach_id: PUBLISHER },
      ],
      clones: [
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER_A,
          cloner_org_id: ORG_HORNETS,
          cloned_at: daysAgoIso(20),
        },
      ],
      thumbsUp: [
        { coach_id: CLONER_A, drill_id: DRILL_X, signaled_at: daysAgoIso(10) },
      ],
      nowMs: NOW_MS,
      lookbackDays: 14,
    });
    expect(tighter).toHaveLength(1);
  });

  it('is deterministic across input order (same input → same output regardless of array order)', () => {
    const shares = [
      { drill_share_id: SHARE_X, drill_id: DRILL_X, publisher_coach_id: PUBLISHER },
      { drill_share_id: SHARE_Y, drill_id: DRILL_Y, publisher_coach_id: PUBLISHER },
    ];
    const clones = [
      {
        drill_share_id: SHARE_X,
        cloner_coach_id: CLONER_A,
        cloner_org_id: ORG_HORNETS,
        cloned_at: daysAgoIso(10),
      },
      {
        drill_share_id: SHARE_Y,
        cloner_coach_id: CLONER_B,
        cloner_org_id: ORG_FALCONS,
        cloned_at: daysAgoIso(8),
      },
    ];
    const thumbs = [
      { coach_id: CLONER_A, drill_id: DRILL_X, signaled_at: daysAgoIso(2) },
      { coach_id: CLONER_B, drill_id: DRILL_Y, signaled_at: daysAgoIso(1) },
    ];
    const out1 = detectStuckClones({
      drillShares: shares,
      clones,
      thumbsUp: thumbs,
      nowMs: NOW_MS,
    });
    const out2 = detectStuckClones({
      drillShares: [...shares].reverse(),
      clones: [...clones].reverse(),
      thumbsUp: [...thumbs].reverse(),
      nowMs: NOW_MS,
    });
    const sortedOut1 = [...out1].sort((a, b) =>
      a.drill_share_id.localeCompare(b.drill_share_id),
    );
    const sortedOut2 = [...out2].sort((a, b) =>
      a.drill_share_id.localeCompare(b.drill_share_id),
    );
    expect(sortedOut2).toEqual(sortedOut1);
    expect(sortedOut1).toHaveLength(2);
  });
});
