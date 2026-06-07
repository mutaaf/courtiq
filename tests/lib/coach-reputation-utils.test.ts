/**
 * Ticket 0073 — pure helper for coach reputation aggregation.
 *
 * Every case maps to one acceptance-criteria expectation in the ticket.
 * The helper is pure (no DB, no clock — `nowMs` injected). The 28-day
 * window is the v1 cadence per the ticket; we pin it via injection so
 * the test never drifts past the boundary (LESSONS#0087 — assertion-
 * time clocks beat module-load clocks).
 *
 * The helper derives `cloneCount`, `distinctProgramCount`, and
 * `distinctCoachCount` from the union of plan-clone + drill-clone rows,
 * filtering out self-clones (the published coach cloning their own work
 * does not credit themselves). Numbers only — no banned-word scan
 * needed per LESSONS#0023.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import {
  computeCoachReputation,
  type PlanCloneRow,
  type DrillCloneRow,
} from '@/lib/coach-reputation-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = Date.parse('2026-06-07T20:00:00Z');

function daysAgoIso(days: number): string {
  return new Date(NOW_MS - days * DAY_MS).toISOString();
}

const PUBLISHED = 'coach-maya';
const PROG_A = 'org-A';
const PROG_B = 'org-B';
const PROG_C = 'org-C';
const PROG_D = 'org-D';
const SRC_PLAN = 'plan-source-1';
const SRC_DRILL = 'drill-share-1';

function planClone(args: {
  cloning_coach_id: string;
  cloning_team_id?: string;
  cloning_org_id?: string | null;
  daysAgo?: number;
  source?: string;
}): PlanCloneRow {
  return {
    source_plan_id: args.source ?? SRC_PLAN,
    cloning_coach_id: args.cloning_coach_id,
    cloning_team_id: args.cloning_team_id ?? `team-${args.cloning_coach_id}`,
    cloning_org_id: args.cloning_org_id === undefined ? PROG_A : args.cloning_org_id,
    created_at: daysAgoIso(args.daysAgo ?? 5),
  };
}

function drillClone(args: {
  cloning_coach_id: string;
  cloning_team_id?: string;
  cloning_org_id?: string | null;
  daysAgo?: number;
  source?: string;
}): DrillCloneRow {
  return {
    source_drill_share_id: args.source ?? SRC_DRILL,
    cloning_coach_id: args.cloning_coach_id,
    cloning_team_id: args.cloning_team_id ?? `team-${args.cloning_coach_id}`,
    cloning_org_id: args.cloning_org_id === undefined ? PROG_A : args.cloning_org_id,
    created_at: daysAgoIso(args.daysAgo ?? 5),
  };
}

describe('computeCoachReputation (ticket 0073)', () => {
  it('returns zeros when no clones are passed', () => {
    const out = computeCoachReputation({
      publishedCoachId: PUBLISHED,
      planClones: [],
      drillClones: [],
      nowMs: NOW_MS,
    });
    expect(out.cloneCount).toBe(0);
    expect(out.distinctProgramCount).toBe(0);
    expect(out.distinctCoachCount).toBe(0);
  });

  it('5 plan clones all from ONE program → { 5, 1, 5 }', () => {
    const plans = [1, 2, 3, 4, 5].map((i) =>
      planClone({ cloning_coach_id: `coach-${i}`, cloning_org_id: PROG_A }),
    );
    const out = computeCoachReputation({
      publishedCoachId: PUBLISHED,
      planClones: plans,
      drillClones: [],
      nowMs: NOW_MS,
    });
    expect(out.cloneCount).toBe(5);
    expect(out.distinctProgramCount).toBe(1);
    expect(out.distinctCoachCount).toBe(5);
  });

  it('5 plan + 3 drill clones across 3 programs with one self-clone → { 7, 3, 7 } (self filtered)', () => {
    const planClones = [
      planClone({ cloning_coach_id: 'coach-1', cloning_org_id: PROG_A }),
      planClone({ cloning_coach_id: 'coach-2', cloning_org_id: PROG_A }),
      planClone({ cloning_coach_id: 'coach-3', cloning_org_id: PROG_B }),
      planClone({ cloning_coach_id: 'coach-4', cloning_org_id: PROG_B }),
      // Self-clone — must be filtered.
      planClone({ cloning_coach_id: PUBLISHED, cloning_org_id: PROG_A }),
    ];
    const drillClones = [
      drillClone({ cloning_coach_id: 'coach-5', cloning_org_id: PROG_C }),
      drillClone({ cloning_coach_id: 'coach-6', cloning_org_id: PROG_C }),
      drillClone({ cloning_coach_id: 'coach-7', cloning_org_id: PROG_A }),
    ];
    const out = computeCoachReputation({
      publishedCoachId: PUBLISHED,
      planClones,
      drillClones,
      nowMs: NOW_MS,
    });
    // 4 valid plan clones + 3 drill clones = 7.
    expect(out.cloneCount).toBe(7);
    // 3 programs: A, B, C.
    expect(out.distinctProgramCount).toBe(3);
    // 7 distinct cloning coaches (the published self-clone was filtered).
    expect(out.distinctCoachCount).toBe(7);
  });

  it('clones outside windowDays (default 28) are excluded', () => {
    const insideWindow = [
      planClone({ cloning_coach_id: 'coach-1', daysAgo: 10, cloning_org_id: PROG_A }),
      planClone({ cloning_coach_id: 'coach-2', daysAgo: 27, cloning_org_id: PROG_B }),
    ];
    const outsideWindow = [
      // 35 days ago — outside the 28-day window.
      planClone({ cloning_coach_id: 'coach-3', daysAgo: 35, cloning_org_id: PROG_C }),
      // 60 days ago — far outside.
      drillClone({ cloning_coach_id: 'coach-4', daysAgo: 60, cloning_org_id: PROG_D }),
    ];
    const out = computeCoachReputation({
      publishedCoachId: PUBLISHED,
      planClones: [...insideWindow, ...outsideWindow.filter((r): r is PlanCloneRow => 'source_plan_id' in r)],
      drillClones: outsideWindow.filter((r): r is DrillCloneRow => 'source_drill_share_id' in r),
      nowMs: NOW_MS,
    });
    expect(out.cloneCount).toBe(2);
    expect(out.distinctProgramCount).toBe(2);
    expect(out.distinctCoachCount).toBe(2);
  });

  it('12 clones across 4 programs from 8 distinct cloning coaches → { 12, 4, 8 } (the seed-extension shape)', () => {
    const planClones = [
      planClone({ cloning_coach_id: 'c1', cloning_org_id: PROG_A }),
      planClone({ cloning_coach_id: 'c1', cloning_org_id: PROG_A, source: 'plan-2' }),
      planClone({ cloning_coach_id: 'c2', cloning_org_id: PROG_A }),
      planClone({ cloning_coach_id: 'c3', cloning_org_id: PROG_B }),
      planClone({ cloning_coach_id: 'c4', cloning_org_id: PROG_B }),
      planClone({ cloning_coach_id: 'c4', cloning_org_id: PROG_B, source: 'plan-2' }),
      planClone({ cloning_coach_id: 'c5', cloning_org_id: PROG_C }),
      planClone({ cloning_coach_id: 'c5', cloning_org_id: PROG_C, source: 'plan-2' }),
      planClone({ cloning_coach_id: 'c6', cloning_org_id: PROG_C }),
      planClone({ cloning_coach_id: 'c7', cloning_org_id: PROG_D }),
      planClone({ cloning_coach_id: 'c8', cloning_org_id: PROG_D }),
      planClone({ cloning_coach_id: 'c8', cloning_org_id: PROG_D, source: 'plan-2' }),
    ];
    const out = computeCoachReputation({
      publishedCoachId: PUBLISHED,
      planClones,
      drillClones: [],
      nowMs: NOW_MS,
    });
    expect(out.cloneCount).toBe(12);
    expect(out.distinctProgramCount).toBe(4);
    expect(out.distinctCoachCount).toBe(8);
  });

  it('a clone with org_id NULL counts toward cloneCount but NOT toward distinctProgramCount', () => {
    const planClones = [
      planClone({ cloning_coach_id: 'coach-1', cloning_org_id: PROG_A }),
      planClone({ cloning_coach_id: 'coach-2', cloning_org_id: null }),
      planClone({ cloning_coach_id: 'coach-3', cloning_org_id: PROG_B }),
    ];
    const out = computeCoachReputation({
      publishedCoachId: PUBLISHED,
      planClones,
      drillClones: [],
      nowMs: NOW_MS,
    });
    expect(out.cloneCount).toBe(3);
    expect(out.distinctProgramCount).toBe(2);
    expect(out.distinctCoachCount).toBe(3);
  });

  it('is deterministic across input order', () => {
    const a = planClone({ cloning_coach_id: 'c1', cloning_org_id: PROG_A });
    const b = planClone({ cloning_coach_id: 'c2', cloning_org_id: PROG_B });
    const c = drillClone({ cloning_coach_id: 'c3', cloning_org_id: PROG_C });
    const out1 = computeCoachReputation({
      publishedCoachId: PUBLISHED,
      planClones: [a, b],
      drillClones: [c],
      nowMs: NOW_MS,
    });
    const out2 = computeCoachReputation({
      publishedCoachId: PUBLISHED,
      planClones: [b, a],
      drillClones: [c],
      nowMs: NOW_MS,
    });
    expect(out2).toEqual(out1);
  });
});
