/**
 * Ticket 0077 — pure helper that computes the director-side cross-program
 * pulse: per neighboring PROGRAM (in the same sport), find the top
 * skill emphasis over the last N days, and return the OTHER programs
 * whose top skill matches the caller's program's top skill.
 *
 * Pure function — reads no DB, no AI. Mirrors the shape of
 * `src/lib/emergent-focus-utils.ts` (0071) and the cross-program sibling
 * `computeCrossProgramEmergentFocus` (0075). The director-side analogue:
 * the dedup key is `org_id` (a program), not `team_id`; the comparison is
 * top-skill-PER-PROGRAM (not "skill targeted by N orgs") because the
 * director persona thinks in "what my program leaned into this week."
 *
 * .test.ts (NOT .spec.ts) — per docs/LESSONS.md.
 */
import { describe, it, expect } from 'vitest';
import {
  computeCrossProgramDirectorPulse,
  type DirectorPulseProgramRow,
  type DirectorPulsePlanRow,
} from '@/lib/cross-program-director-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function plan(orgId: string, skills: string[] | null, daysAgo = 1): DirectorPulsePlanRow {
  return {
    org_id: orgId,
    skills_targeted: skills,
    created_at: new Date(NOW - daysAgo * DAY_MS).toISOString(),
  };
}

function program(
  org_id: string,
  org_name: string,
  sport_id: string,
  director_first_name?: string,
  director_contact_email?: string,
): DirectorPulseProgramRow {
  return { org_id, org_name, sport_id, director_first_name, director_contact_email };
}

const BASKETBALL = 'sport-basketball';
const SOCCER = 'sport-soccer';
const CALLER_ORG = 'org-caller-hawks';

describe('computeCrossProgramDirectorPulse (ticket 0077) — pure aggregation', () => {
  // (i) empty inputs → { topSkill: null, neighborPrograms: [] }
  it('returns empty when programs and plans are both empty', () => {
    const result = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs: [],
      plans: [],
      nowMs: NOW,
    });
    expect(result.topSkill).toBeNull();
    expect(result.neighborPrograms).toEqual([]);
  });

  // (ii) caller has no plans in the window → empty
  it('returns empty when the caller program has no plans in the window', () => {
    const programs = [
      program(CALLER_ORG, 'Hawks Basketball', BASKETBALL),
      program('org-riverside', 'Riverside Basketball', BASKETBALL, 'Anna', 'anna@riverside.test'),
      program('org-westview', 'Westview Hoops', BASKETBALL, 'Ben', 'ben@westview.test'),
    ];
    // Only neighbor plans, no caller plans.
    const plans = [
      plan('org-riverside', ['transitions'], 2),
      plan('org-riverside', ['transitions'], 3),
      plan('org-riverside', ['transitions'], 4),
      plan('org-westview', ['transitions'], 2),
      plan('org-westview', ['transitions'], 3),
      plan('org-westview', ['transitions'], 4),
    ];
    const result = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs,
      plans,
      nowMs: NOW,
    });
    expect(result.topSkill).toBeNull();
    expect(result.neighborPrograms).toEqual([]);
  });

  // (iii) caller top skill is transitions AND two neighbor programs also
  //       top-skill on transitions with 4+ practices each → result populated.
  it('returns the two converged programs when the caller and two neighbors share a top skill', () => {
    const programs = [
      program(CALLER_ORG, 'Hawks Basketball', BASKETBALL),
      program('org-riverside', 'Riverside Basketball', BASKETBALL, 'Anna', 'anna@riverside.test'),
      program('org-westview', 'Westview Hoops', BASKETBALL, 'Ben', 'ben@westview.test'),
    ];
    const plans = [
      // Caller — 5 transitions plans (top skill).
      plan(CALLER_ORG, ['transitions'], 1),
      plan(CALLER_ORG, ['transitions'], 2),
      plan(CALLER_ORG, ['transitions'], 3),
      plan(CALLER_ORG, ['transitions'], 4),
      plan(CALLER_ORG, ['transitions'], 5),
      // Riverside — 4 transitions plans.
      plan('org-riverside', ['transitions'], 1),
      plan('org-riverside', ['transitions'], 2),
      plan('org-riverside', ['transitions'], 3),
      plan('org-riverside', ['transitions'], 4),
      // Westview — 4 transitions plans.
      plan('org-westview', ['transitions'], 1),
      plan('org-westview', ['transitions'], 2),
      plan('org-westview', ['transitions'], 3),
      plan('org-westview', ['transitions'], 4),
    ];
    const result = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs,
      plans,
      nowMs: NOW,
    });
    expect(result.topSkill).toBe('transitions');
    expect(result.neighborPrograms).toHaveLength(2);
    const names = result.neighborPrograms.map((p) => p.org_name).sort();
    expect(names).toEqual(['Riverside Basketball', 'Westview Hoops']);
    // Each neighbor carries the practice_count for the shared top skill.
    for (const p of result.neighborPrograms) {
      expect(p.practice_count).toBeGreaterThanOrEqual(3);
      // Director attribution carried through when known.
      expect(typeof p.director_first_name === 'string').toBe(true);
      expect(typeof p.director_contact_email === 'string').toBe(true);
    }
  });

  // (iv) caller's OWN program is NEVER counted as a neighbor
  it('NEVER includes the callers own program in the neighbor list', () => {
    const programs = [
      program(CALLER_ORG, 'Hawks Basketball', BASKETBALL),
      program('org-riverside', 'Riverside Basketball', BASKETBALL, 'Anna', 'anna@riverside.test'),
      program('org-westview', 'Westview Hoops', BASKETBALL, 'Ben', 'ben@westview.test'),
    ];
    const plans = [
      // Caller has 6 transitions plans — its own top skill is transitions.
      plan(CALLER_ORG, ['transitions'], 1),
      plan(CALLER_ORG, ['transitions'], 2),
      plan(CALLER_ORG, ['transitions'], 3),
      plan(CALLER_ORG, ['transitions'], 4),
      plan(CALLER_ORG, ['transitions'], 5),
      plan(CALLER_ORG, ['transitions'], 6),
      // Neighbors.
      plan('org-riverside', ['transitions'], 1),
      plan('org-riverside', ['transitions'], 2),
      plan('org-riverside', ['transitions'], 3),
      plan('org-westview', ['transitions'], 1),
      plan('org-westview', ['transitions'], 2),
      plan('org-westview', ['transitions'], 3),
    ];
    const result = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs,
      plans,
      nowMs: NOW,
    });
    const orgIds = result.neighborPrograms.map((p) => p.org_id);
    expect(orgIds).not.toContain(CALLER_ORG);
  });

  // (v) only ONE neighbor above threshold (below minNeighborPrograms) → empty
  it('returns empty when only ONE neighbor program is above threshold', () => {
    const programs = [
      program(CALLER_ORG, 'Hawks Basketball', BASKETBALL),
      program('org-riverside', 'Riverside Basketball', BASKETBALL, 'Anna', 'anna@riverside.test'),
      program('org-quiet', 'Quiet Program', BASKETBALL, 'Carl', 'carl@quiet.test'),
    ];
    const plans = [
      // Caller — transitions.
      plan(CALLER_ORG, ['transitions'], 1),
      plan(CALLER_ORG, ['transitions'], 2),
      plan(CALLER_ORG, ['transitions'], 3),
      // Riverside — transitions (above per-program practice threshold).
      plan('org-riverside', ['transitions'], 1),
      plan('org-riverside', ['transitions'], 2),
      plan('org-riverside', ['transitions'], 3),
      // Quiet has 1 plan on rebounds — its top skill differs, OR it has
      // too few practices. Either way it does NOT match.
      plan('org-quiet', ['rebounds'], 1),
    ];
    const result = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs,
      plans,
      nowMs: NOW,
    });
    expect(result.neighborPrograms).toEqual([]);
  });

  // (vi) result is capped at 2 neighbor programs even when 5 are above
  //      threshold (LESSONS#0103 cap)
  it('caps the result at 2 neighbor programs (LESSONS#0103)', () => {
    const programs: DirectorPulseProgramRow[] = [
      program(CALLER_ORG, 'Hawks Basketball', BASKETBALL),
    ];
    const plans: DirectorPulsePlanRow[] = [];
    // Caller — transitions top skill.
    for (let i = 0; i < 4; i++) plans.push(plan(CALLER_ORG, ['transitions'], 1 + i));
    // 5 neighbor programs, each with 4 transitions plans.
    for (let n = 0; n < 5; n++) {
      const orgId = `org-neighbor-${n}`;
      programs.push(program(orgId, `Neighbor ${n}`, BASKETBALL, `N${n}`, `n${n}@x.test`));
      for (let i = 0; i < 4; i++) plans.push(plan(orgId, ['transitions'], 1 + i));
    }
    const result = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs,
      plans,
      nowMs: NOW,
    });
    expect(result.topSkill).toBe('transitions');
    expect(result.neighborPrograms.length).toBeLessThanOrEqual(2);
  });

  // (vii) programs in a DIFFERENT sport are EXCLUDED
  it('excludes programs in a different sport (sport-scoped per the 0075 contract)', () => {
    const programs = [
      program(CALLER_ORG, 'Hawks Basketball', BASKETBALL),
      program('org-riverside', 'Riverside Basketball', BASKETBALL, 'Anna', 'anna@riverside.test'),
      program('org-soccer-1', 'Soccer Stars', SOCCER, 'Diego', 'diego@soccer.test'),
      program('org-soccer-2', 'Soccer Strikers', SOCCER, 'Eve', 'eve@soccer.test'),
    ];
    const plans = [
      // Caller (basketball) — transitions.
      plan(CALLER_ORG, ['transitions'], 1),
      plan(CALLER_ORG, ['transitions'], 2),
      plan(CALLER_ORG, ['transitions'], 3),
      // Riverside (basketball) — transitions.
      plan('org-riverside', ['transitions'], 1),
      plan('org-riverside', ['transitions'], 2),
      plan('org-riverside', ['transitions'], 3),
      // Soccer programs — also on "transitions" but a different sport.
      plan('org-soccer-1', ['transitions'], 1),
      plan('org-soccer-1', ['transitions'], 2),
      plan('org-soccer-1', ['transitions'], 3),
      plan('org-soccer-2', ['transitions'], 1),
      plan('org-soccer-2', ['transitions'], 2),
      plan('org-soccer-2', ['transitions'], 3),
    ];
    const result = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs,
      plans,
      nowMs: NOW,
    });
    // Only one basketball neighbor → below minNeighborPrograms (default 2)
    // → result is empty (not bleeding through soccer matches).
    expect(result.neighborPrograms).toEqual([]);
  });

  // (viii) deterministic across input order
  it('produces deterministic output regardless of input order', () => {
    const programsA = [
      program(CALLER_ORG, 'Hawks Basketball', BASKETBALL),
      program('org-riverside', 'Riverside Basketball', BASKETBALL, 'Anna', 'anna@riverside.test'),
      program('org-westview', 'Westview Hoops', BASKETBALL, 'Ben', 'ben@westview.test'),
    ];
    const programsB = [...programsA].reverse();
    const plansA = [
      plan(CALLER_ORG, ['transitions'], 1),
      plan(CALLER_ORG, ['transitions'], 2),
      plan(CALLER_ORG, ['transitions'], 3),
      plan('org-riverside', ['transitions'], 1),
      plan('org-riverside', ['transitions'], 2),
      plan('org-riverside', ['transitions'], 3),
      plan('org-westview', ['transitions'], 1),
      plan('org-westview', ['transitions'], 2),
      plan('org-westview', ['transitions'], 3),
    ];
    const plansB = [...plansA].reverse();
    const a = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs: programsA,
      plans: plansA,
      nowMs: NOW,
    });
    const b = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs: programsB,
      plans: plansB,
      nowMs: NOW,
    });
    expect(a.topSkill).toBe(b.topSkill);
    expect(a.neighborPrograms.map((p) => p.org_name)).toEqual(
      b.neighborPrograms.map((p) => p.org_name),
    );
  });

  // Window guard — plans older than windowDays are excluded.
  it('excludes plans older than windowDays (default 14)', () => {
    const programs = [
      program(CALLER_ORG, 'Hawks Basketball', BASKETBALL),
      program('org-riverside', 'Riverside Basketball', BASKETBALL, 'Anna', 'anna@riverside.test'),
      program('org-westview', 'Westview Hoops', BASKETBALL, 'Ben', 'ben@westview.test'),
    ];
    const plans = [
      // All plans 30 days old — outside the default 14-day window.
      plan(CALLER_ORG, ['transitions'], 30),
      plan(CALLER_ORG, ['transitions'], 31),
      plan('org-riverside', ['transitions'], 30),
      plan('org-riverside', ['transitions'], 31),
      plan('org-westview', ['transitions'], 30),
      plan('org-westview', ['transitions'], 31),
    ];
    const result = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs,
      plans,
      nowMs: NOW,
    });
    expect(result.topSkill).toBeNull();
    expect(result.neighborPrograms).toEqual([]);
  });

  // Custom thresholds — the helper honors caller-provided options.
  it('honors custom minPracticesPerSkill and minNeighborPrograms', () => {
    const programs = [
      program(CALLER_ORG, 'Hawks Basketball', BASKETBALL),
      program('org-riverside', 'Riverside Basketball', BASKETBALL, 'Anna', 'anna@riverside.test'),
    ];
    const plans = [
      plan(CALLER_ORG, ['transitions'], 1),
      plan(CALLER_ORG, ['transitions'], 2),
      plan('org-riverside', ['transitions'], 1),
      plan('org-riverside', ['transitions'], 2),
    ];
    // Defaults reject (only 1 neighbor).
    const defaults = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs,
      plans,
      nowMs: NOW,
    });
    expect(defaults.neighborPrograms).toEqual([]);

    // Lower the neighbor floor to 1 — the single neighbor surfaces.
    const lenient = computeCrossProgramDirectorPulse({
      callerOrgId: CALLER_ORG,
      callerSportId: BASKETBALL,
      programs,
      plans,
      minNeighborPrograms: 1,
      minPracticesPerSkill: 2,
      nowMs: NOW,
    });
    expect(lenient.topSkill).toBe('transitions');
    expect(lenient.neighborPrograms).toHaveLength(1);
  });
});
