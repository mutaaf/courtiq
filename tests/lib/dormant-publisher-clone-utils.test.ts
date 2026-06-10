/**
 * Ticket 0078 — pure helper for dormant-publisher reactivation on clone.
 *
 * Cases mirror the acceptance-criteria checklist 1:1. The helper consumes
 * pre-resolved milestone rows, a coach-last-seen map, and a per-coach
 * cooldown lookup; it reads no DB and never calls Date.now() internally
 * (the caller injects `nowMs` so the boundary cases stay deterministic
 * across slow CI runs per LESSONS#0087).
 *
 * .test.ts NOT .spec.ts — LESSONS#0020 / #38.
 */
import { describe, it, expect } from 'vitest';
import { selectDormantPublishersForClones } from '@/lib/dormant-publisher-clone-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = Date.parse('2026-11-15T20:00:00Z');

function daysAgoIso(days: number): string {
  return new Date(NOW_MS - days * DAY_MS).toISOString();
}

const COACH_SARAH = 'aaaaaaaa-0000-4000-a000-000000000001';
const COACH_BEN = 'aaaaaaaa-0000-4000-a000-000000000002';

describe('selectDormantPublishersForClones (ticket 0078)', () => {
  it('returns empty when there are no milestones', () => {
    const out = selectDormantPublishersForClones({
      milestones: [],
      coachLastSeen: new Map(),
      reactivationSignals: new Map(),
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('excludes a coach who is NOT dormant (last seen 2 days ago)', () => {
    const out = selectDormantPublishersForClones({
      milestones: [
        {
          id: 'ms-1',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(1),
          notified_at: null,
        },
      ],
      coachLastSeen: new Map([[COACH_SARAH, daysAgoIso(2)]]),
      reactivationSignals: new Map(),
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('includes a dormant coach (35 days) with no prior reactivation signal', () => {
    const out = selectDormantPublishersForClones({
      milestones: [
        {
          id: 'ms-1',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(1),
          notified_at: null,
        },
      ],
      coachLastSeen: new Map([[COACH_SARAH, daysAgoIso(35)]]),
      reactivationSignals: new Map(),
      nowMs: NOW_MS,
    });
    expect(out).toEqual([
      {
        milestone_id: 'ms-1',
        published_coach_id: COACH_SARAH,
        milestone_kind: 'clones_3',
      },
    ]);
  });

  it('excludes a dormant coach who was emailed 10 days ago (cooldown floor 60)', () => {
    const out = selectDormantPublishersForClones({
      milestones: [
        {
          id: 'ms-1',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(1),
          notified_at: null,
        },
      ],
      coachLastSeen: new Map([[COACH_SARAH, daysAgoIso(35)]]),
      reactivationSignals: new Map([[COACH_SARAH, daysAgoIso(10)]]),
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('returns the MOST-RECENT qualifying milestone per coach (one email per cron run)', () => {
    const out = selectDormantPublishersForClones({
      milestones: [
        {
          id: 'ms-older',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(2),
          notified_at: null,
        },
        {
          id: 'ms-newer',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'programs_2',
          crossed_at: daysAgoIso(1),
          notified_at: null,
        },
      ],
      coachLastSeen: new Map([[COACH_SARAH, daysAgoIso(35)]]),
      reactivationSignals: new Map(),
      nowMs: NOW_MS,
    });
    expect(out).toEqual([
      {
        milestone_id: 'ms-newer',
        published_coach_id: COACH_SARAH,
        milestone_kind: 'programs_2',
      },
    ]);
  });

  it('excludes milestones where notified_at is already stamped (in-app card consumed)', () => {
    const out = selectDormantPublishersForClones({
      milestones: [
        {
          id: 'ms-consumed',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(1),
          notified_at: daysAgoIso(0.1),
        },
      ],
      coachLastSeen: new Map([[COACH_SARAH, daysAgoIso(35)]]),
      reactivationSignals: new Map(),
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('honors dormancyDays and cooldownDays overrides', () => {
    // With dormancyDays=10 a coach 15 days quiet counts as dormant.
    const out = selectDormantPublishersForClones({
      milestones: [
        {
          id: 'ms-1',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(1),
          notified_at: null,
        },
      ],
      coachLastSeen: new Map([[COACH_SARAH, daysAgoIso(15)]]),
      reactivationSignals: new Map([[COACH_SARAH, daysAgoIso(20)]]),
      dormancyDays: 10,
      cooldownDays: 15,
      nowMs: NOW_MS,
    });
    expect(out).toEqual([
      {
        milestone_id: 'ms-1',
        published_coach_id: COACH_SARAH,
        milestone_kind: 'clones_3',
      },
    ]);
  });

  it('is deterministic across input order', () => {
    const baseArgs = {
      coachLastSeen: new Map([
        [COACH_SARAH, daysAgoIso(40)],
        [COACH_BEN, daysAgoIso(50)],
      ]),
      reactivationSignals: new Map(),
      nowMs: NOW_MS,
    };
    const a = selectDormantPublishersForClones({
      ...baseArgs,
      milestones: [
        {
          id: 'ms-sarah',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(1),
          notified_at: null,
        },
        {
          id: 'ms-ben',
          published_coach_id: COACH_BEN,
          milestone_kind: 'programs_2',
          crossed_at: daysAgoIso(2),
          notified_at: null,
        },
      ],
    });
    const b = selectDormantPublishersForClones({
      ...baseArgs,
      milestones: [
        {
          id: 'ms-ben',
          published_coach_id: COACH_BEN,
          milestone_kind: 'programs_2',
          crossed_at: daysAgoIso(2),
          notified_at: null,
        },
        {
          id: 'ms-sarah',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(1),
          notified_at: null,
        },
      ],
    });
    // Both runs return the same set, sorted by published_coach_id.
    const sortById = (rows: typeof a) =>
      [...rows].sort((x, y) => x.published_coach_id.localeCompare(y.published_coach_id));
    expect(sortById(a)).toEqual(sortById(b));
    expect(sortById(a).map((r) => r.milestone_id)).toEqual(['ms-sarah', 'ms-ben']);
  });

  it('skips a coach with a NULL last_seen entry (treat missing as not-dormant, mirror 0072 isCoachDormant)', () => {
    const out = selectDormantPublishersForClones({
      milestones: [
        {
          id: 'ms-1',
          published_coach_id: COACH_SARAH,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(1),
          notified_at: null,
        },
      ],
      coachLastSeen: new Map(),
      reactivationSignals: new Map(),
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });
});
