/**
 * Ticket 0071 — pure helper that aggregates plan-level skills_targeted across
 * teams in an org and returns the skills that have "rallied" across at least
 * MIN_CONVERGENCE distinct teams in the windowDays bucket.
 *
 * Pure function — reads no DB, no AI. The vitest matrix below is the AC
 * mapping (one case per checkbox in the ticket's first acceptance group).
 *
 * .test.ts (NOT .spec.ts) — per docs/LESSONS.md.
 */
import { describe, it, expect } from 'vitest';
import {
  computeEmergentFocus,
  type PlanRow,
} from '@/lib/emergent-focus-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function plan(teamId: string, skills: string[] | null, daysAgo = 1, idHint?: string): PlanRow {
  return {
    team_id: teamId,
    skills_targeted: skills,
    created_at: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    // id is optional; keeps determinism deterministic across reordering tests.
    ...(idHint ? { id: idHint } : {}),
  };
}

describe('computeEmergentFocus (ticket 0071) — pure aggregation', () => {
  // (i) empty plans → empty result.
  it('returns an empty array when there are no plans at all', () => {
    expect(computeEmergentFocus([])).toEqual([]);
  });

  // (ii) 2 teams on the same skill, MIN=3 → empty.
  it('returns an empty array when fewer than MIN_CONVERGENCE teams converge', () => {
    const plans: PlanRow[] = [
      plan('team-a', ['closeouts']),
      plan('team-b', ['closeouts']),
    ];
    expect(computeEmergentFocus(plans)).toEqual([]);
  });

  // (iii) 3 teams on the same skill → one result with teamCount 3.
  it('returns the converged skill when exactly MIN_CONVERGENCE teams target it', () => {
    const plans: PlanRow[] = [
      plan('team-a', ['closeouts']),
      plan('team-b', ['closeouts']),
      plan('team-c', ['closeouts']),
    ];
    const result = computeEmergentFocus(plans);
    expect(result).toHaveLength(1);
    expect(result[0].skill).toBe('closeouts');
    expect(result[0].teamCount).toBe(3);
    expect(new Set(result[0].teamIds)).toEqual(new Set(['team-a', 'team-b', 'team-c']));
  });

  // (iv) 4 teams on the same skill but 1 team's plan is outside windowDays → 3 teams.
  it('filters out plans older than the windowDays bucket', () => {
    const plans: PlanRow[] = [
      plan('team-a', ['closeouts'], 2),
      plan('team-b', ['closeouts'], 5),
      plan('team-c', ['closeouts'], 13),
      plan('team-d', ['closeouts'], 30), // outside the 14-day window
    ];
    const result = computeEmergentFocus(plans);
    expect(result).toHaveLength(1);
    expect(result[0].teamCount).toBe(3);
    expect(new Set(result[0].teamIds)).toEqual(new Set(['team-a', 'team-b', 'team-c']));
  });

  // (v) a team running 5 plans this week with the same skill counts ONCE.
  it('a team running multiple plans on the same skill counts ONCE per skill', () => {
    const plans: PlanRow[] = [
      plan('team-a', ['closeouts'], 1),
      plan('team-a', ['closeouts'], 2),
      plan('team-a', ['closeouts'], 3),
      plan('team-a', ['closeouts'], 4),
      plan('team-a', ['closeouts'], 5),
      plan('team-b', ['closeouts'], 2),
      plan('team-c', ['closeouts'], 3),
    ];
    const result = computeEmergentFocus(plans);
    expect(result).toHaveLength(1);
    expect(result[0].teamCount).toBe(3);
    expect(result[0].teamIds).toHaveLength(3);
  });

  // (vi) caps at maxFocuses (default 2).
  it('caps the result at the maxFocuses option (default 2)', () => {
    // Three distinct skills, each on 3 different teams. Default maxFocuses=2.
    const plans: PlanRow[] = [
      // closeouts on teams a/b/c
      plan('team-a', ['closeouts']),
      plan('team-b', ['closeouts']),
      plan('team-c', ['closeouts']),
      // spacing on teams d/e/f
      plan('team-d', ['spacing']),
      plan('team-e', ['spacing']),
      plan('team-f', ['spacing']),
      // boxing-out on teams g/h/i
      plan('team-g', ['boxing-out']),
      plan('team-h', ['boxing-out']),
      plan('team-i', ['boxing-out']),
    ];
    const result = computeEmergentFocus(plans);
    expect(result).toHaveLength(2);
    // Custom cap also works.
    const capped = computeEmergentFocus(plans, { maxFocuses: 1 });
    expect(capped).toHaveLength(1);
  });

  // (vii) null skills_targeted is silently skipped.
  it('silently skips plans with null skills_targeted', () => {
    const plans: PlanRow[] = [
      plan('team-a', ['closeouts']),
      plan('team-b', ['closeouts']),
      plan('team-c', null),
    ];
    expect(computeEmergentFocus(plans)).toEqual([]);
  });

  // (viii) the output is deterministic across input order.
  it('produces deterministic output regardless of input order', () => {
    const plansA: PlanRow[] = [
      plan('team-a', ['closeouts']),
      plan('team-b', ['closeouts']),
      plan('team-c', ['closeouts']),
      plan('team-d', ['spacing']),
      plan('team-e', ['spacing']),
      plan('team-f', ['spacing']),
    ];
    const plansB: PlanRow[] = [
      plan('team-f', ['spacing']),
      plan('team-c', ['closeouts']),
      plan('team-a', ['closeouts']),
      plan('team-e', ['spacing']),
      plan('team-d', ['spacing']),
      plan('team-b', ['closeouts']),
    ];
    const a = computeEmergentFocus(plansA);
    const b = computeEmergentFocus(plansB);
    expect(a.map((r) => r.skill).sort()).toEqual(b.map((r) => r.skill).sort());
    expect(a.map((r) => r.teamCount)).toEqual(b.map((r) => r.teamCount));
  });

  it('honours custom minConvergence and windowDays options', () => {
    const plans: PlanRow[] = [
      plan('team-a', ['closeouts'], 1),
      plan('team-b', ['closeouts'], 1),
    ];
    // MIN=2 → the two teams converge.
    const result = computeEmergentFocus(plans, { minConvergence: 2 });
    expect(result).toHaveLength(1);

    // Tight window — only 0.5 days back; both plans fall OUTSIDE the window.
    const tight = computeEmergentFocus(
      [plan('team-a', ['closeouts'], 2), plan('team-b', ['closeouts'], 2), plan('team-c', ['closeouts'], 2)],
      { windowDays: 1 }
    );
    expect(tight).toEqual([]);
  });
});
