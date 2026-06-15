/**
 * Ticket 0083 — pure helper that aggregates program-scoped Practice Arc
 * memory. Walks the `plans` rows of OTHER teams in the same
 * (org_id, age_group, sport_id) tuple for the prior season(s), groups by
 * `season_week` (the deterministic derivation of `curriculum_week` per
 * LESSONS#0096 schema reconciliation), and returns a week-by-week shape:
 * top-2 skills, team_count, practice_count.
 *
 * Pure function — reads no DB, no AI. Mirrors the
 * `computeEmergentFocus` shape from ticket 0071 (also a pure aggregator
 * over `plans.skills_targeted`).
 *
 * The matrix below is the AC mapping (one case per checkbox in the
 * ticket's first acceptance group, plus determinism + filter scoping).
 *
 * .test.ts (NOT .spec.ts) — per docs/LESSONS.md.
 */
import { describe, it, expect } from 'vitest';
import {
  computeProgramArcShape,
  type ProgramArcPlanRow,
} from '@/lib/program-arc-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
// Anchor "now" to a fixed timestamp so that the season-lookback windows
// (1 season = 365 days back from now) are deterministic across runs and
// not sensitive to clock drift (LESSONS#0087).
const NOW = Date.parse('2026-10-15T00:00:00Z');

const ORG = 'org-hawks';
const AGE = 'U10';
const SPORT = 'sport-basketball';

/** Build a plans row for a team in the program, dated `daysAgo` before NOW.
 *  `seasonWeek` maps to the existing `curriculum_week` column the helper
 *  reads (schema reconciliation in the ticket's Implementation log). */
function plan(
  teamId: string,
  orgId: string,
  ageGroup: string,
  sportId: string,
  skills: string[] | null,
  daysAgo: number,
  seasonWeek: number | null,
): ProgramArcPlanRow {
  return {
    team_id: teamId,
    org_id: orgId,
    age_group: ageGroup,
    sport_id: sportId,
    skills_targeted: skills,
    created_at: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    season_week: seasonWeek,
  };
}

describe('computeProgramArcShape (ticket 0083) — program-scoped arc memory', () => {
  // (i) empty plans → coverage 'thin' + empty weeks.
  it('returns coverage:thin + empty weeks when there are no plans at all', () => {
    const out = computeProgramArcShape({
      plans: [],
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(out.coverage).toBe('thin');
    expect(out.weeks).toEqual([]);
  });

  // (ii) ONE other team with 14 plans across 8 weeks → coverage 'sufficient'
  //      + week-by-week shape.
  it('aggregates one other team with 14 plans across 8 weeks (sufficient coverage)', () => {
    // 14 plans across weeks 1..8, all from team-other in the same program.
    const plans: ProgramArcPlanRow[] = [];
    // Week 2-4: closeouts (3 plans/week)
    for (const wk of [2, 3, 4]) {
      for (let i = 0; i < 2; i++) {
        plans.push(plan('team-other', ORG, AGE, SPORT, ['closeouts'], 200 - wk * 7 + i, wk));
      }
    }
    // Week 5-7: transitions (2 plans/week)
    for (const wk of [5, 6, 7]) {
      for (let i = 0; i < 2; i++) {
        plans.push(plan('team-other', ORG, AGE, SPORT, ['transitions'], 200 - wk * 7 + i, wk));
      }
    }
    // Filler week 1 + week 8: one plan each on a generic skill (total 14)
    plans.push(plan('team-other', ORG, AGE, SPORT, ['warmup'], 200, 1));
    plans.push(plan('team-other', ORG, AGE, SPORT, ['warmup'], 150, 8));

    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });

    expect(out.coverage).toBe('sufficient');
    expect(out.weeks.length).toBe(8);
    // Ordered by week ascending.
    expect(out.weeks.map((w) => w.week_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Weeks 2-4 top skill is closeouts.
    expect(out.weeks.find((w) => w.week_index === 3)?.top_skills).toContain('closeouts');
    // Weeks 5-7 top skill is transitions.
    expect(out.weeks.find((w) => w.week_index === 6)?.top_skills).toContain('transitions');
    // team_count is 1 on every week (only one other team contributed).
    for (const w of out.weeks) expect(w.team_count).toBe(1);
  });

  // (iii) ONE other team with 6 plans → coverage 'thin' (below practice
  //       count bar).
  it('reports thin coverage when practice_count is below the scarcity bar', () => {
    const plans: ProgramArcPlanRow[] = [];
    for (let i = 0; i < 6; i++) {
      plans.push(plan('team-other', ORG, AGE, SPORT, ['closeouts'], 200 - i * 7, 2 + i));
    }
    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(out.coverage).toBe('thin');
  });

  // (iv) THREE other teams with 18 plans → coverage 'sufficient' with
  //      team_count up to 3 on some weeks.
  it('counts distinct teams contributing per week (team_count)', () => {
    const plans: ProgramArcPlanRow[] = [];
    for (const t of ['team-a', 'team-b', 'team-c']) {
      for (const wk of [2, 3, 4, 5, 6, 7]) {
        plans.push(plan(t, ORG, AGE, SPORT, ['closeouts'], 200 - wk * 7, wk));
      }
    }
    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(out.coverage).toBe('sufficient');
    for (const w of out.weeks) {
      expect(w.team_count).toBe(3);
    }
  });

  // (v) the caller's own team is EXCLUDED from the aggregate.
  it('excludes the caller team from the aggregate', () => {
    const plans: ProgramArcPlanRow[] = [];
    // Caller adds 12 plans on "closeouts" — should be excluded.
    for (let i = 0; i < 12; i++) {
      plans.push(plan('team-mine', ORG, AGE, SPORT, ['closeouts'], 200 - i * 7, 2 + (i % 6)));
    }
    // No other team contributes → thin coverage.
    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(out.coverage).toBe('thin');
    expect(out.weeks).toEqual([]);
  });

  // (vi) plans for a DIFFERENT age_group are excluded.
  it('excludes plans whose age_group does not match', () => {
    const plans: ProgramArcPlanRow[] = [];
    for (let i = 0; i < 14; i++) {
      plans.push(plan('team-other', ORG, 'U12', SPORT, ['closeouts'], 200 - i * 7, 2 + (i % 6)));
    }
    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(out.coverage).toBe('thin');
    expect(out.weeks).toEqual([]);
  });

  // (vii) plans for a DIFFERENT org_id are excluded.
  it('excludes plans whose org_id does not match', () => {
    const plans: ProgramArcPlanRow[] = [];
    for (let i = 0; i < 14; i++) {
      plans.push(plan('team-other', 'org-other', AGE, SPORT, ['closeouts'], 200 - i * 7, 2 + (i % 6)));
    }
    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(out.coverage).toBe('thin');
    expect(out.weeks).toEqual([]);
  });

  // (viii) plans for a DIFFERENT sport_id are excluded.
  it('excludes plans whose sport_id does not match', () => {
    const plans: ProgramArcPlanRow[] = [];
    for (let i = 0; i < 14; i++) {
      plans.push(plan('team-other', ORG, AGE, 'sport-soccer', ['closeouts'], 200 - i * 7, 2 + (i % 6)));
    }
    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(out.coverage).toBe('thin');
    expect(out.weeks).toEqual([]);
  });

  // (ix) seasonLookback = 2 aggregates two seasons of plans.
  it('respects seasonLookback when widening to two seasons', () => {
    const plans: ProgramArcPlanRow[] = [];
    // Last-season plans (within 1 season window): 7 plans.
    for (let i = 0; i < 7; i++) {
      plans.push(plan('team-other', ORG, AGE, SPORT, ['closeouts'], 100 + i, 2 + (i % 6)));
    }
    // Two-seasons-ago plans (outside 1 season window, within 2 season window):
    // 7 more plans, brings total to 14.
    for (let i = 0; i < 7; i++) {
      plans.push(plan('team-other', ORG, AGE, SPORT, ['transitions'], 500 + i, 2 + (i % 6)));
    }
    // 1-season lookback → 7 plans → thin.
    const oneSeason = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      seasonLookback: 1,
      nowMs: NOW,
    });
    expect(oneSeason.coverage).toBe('thin');
    // 2-season lookback → 14 plans → sufficient.
    const twoSeasons = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      seasonLookback: 2,
      nowMs: NOW,
    });
    expect(twoSeasons.coverage).toBe('sufficient');
  });

  // (x) top_skills ordered by frequency descending, capped at 2.
  it('ranks top_skills by frequency descending and caps at 2', () => {
    const plans: ProgramArcPlanRow[] = [];
    // Week 3: 4 plans on closeouts (top), 2 plans on rebounding (second),
    //         1 plan on warmup (third — should NOT appear).
    for (let i = 0; i < 4; i++) {
      plans.push(plan('team-a', ORG, AGE, SPORT, ['closeouts'], 200, 3));
    }
    for (let i = 0; i < 2; i++) {
      plans.push(plan('team-b', ORG, AGE, SPORT, ['rebounding'], 200, 3));
    }
    plans.push(plan('team-c', ORG, AGE, SPORT, ['warmup'], 200, 3));
    // 6 filler plans so coverage is sufficient.
    for (let i = 0; i < 7; i++) {
      plans.push(plan('team-a', ORG, AGE, SPORT, ['transitions'], 200, 5));
    }
    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    const w3 = out.weeks.find((w) => w.week_index === 3);
    expect(w3?.top_skills).toEqual(['closeouts', 'rebounding']);
  });

  // (xi) deterministic across input order.
  it('produces the same output regardless of input order', () => {
    const a: ProgramArcPlanRow[] = [];
    for (let i = 0; i < 14; i++) {
      a.push(plan(`team-${i % 3}`, ORG, AGE, SPORT, ['closeouts'], 200 - i * 7, 2 + (i % 6)));
    }
    const b = [...a].reverse();
    const outA = computeProgramArcShape({
      plans: a,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    const outB = computeProgramArcShape({
      plans: b,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(outA).toEqual(outB);
  });

  // Defensive: plans with null skills_targeted contribute to practice_count
  // (the plan happened) but not to top_skills.
  it('counts plans with null skills_targeted toward practice_count, not top_skills', () => {
    const plans: ProgramArcPlanRow[] = [];
    for (let i = 0; i < 7; i++) {
      plans.push(plan('team-other', ORG, AGE, SPORT, null, 200 - i * 7, 2 + i));
    }
    for (let i = 0; i < 7; i++) {
      plans.push(plan('team-other', ORG, AGE, SPORT, ['closeouts'], 100 - i * 7, 2 + i));
    }
    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(out.coverage).toBe('sufficient');
    // Practice count totals across weeks should be 14 (7 null-skill + 7 with skills).
    const totalPractices = out.weeks.reduce((acc, w) => acc + w.practice_count, 0);
    expect(totalPractices).toBe(14);
  });

  // Defensive: plans with no `season_week` are dropped (the helper can't
  // place a plan without a week index).
  it('drops plans whose season_week is null (cannot place on the arc)', () => {
    const plans: ProgramArcPlanRow[] = [];
    for (let i = 0; i < 14; i++) {
      plans.push(plan('team-other', ORG, AGE, SPORT, ['closeouts'], 200 - i, null));
    }
    const out = computeProgramArcShape({
      plans,
      callerTeamId: 'team-mine',
      orgId: ORG,
      ageGroup: AGE,
      sportId: SPORT,
      nowMs: NOW,
    });
    expect(out.coverage).toBe('thin');
    expect(out.weeks).toEqual([]);
  });
});
