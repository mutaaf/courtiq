/**
 * Ticket 0091 — pure helper `computeSportWideConvergence`.
 *
 * Given the union of plans across an entire sport in the last 7 days
 * targeting a specific skill, returns the count of distinct programs
 * (orgs) shipping the skill, the total plan count, and the TOP-N
 * programs by plan count (with director first name attached) when the
 * distinctProgramCount meets the `minPrograms` floor (default 25).
 *
 * Pure: deterministic, no I/O, never mutates the input arrays
 * (LESSONS#0070). Voice posture (LESSONS#0023): the helper jsdoc
 * instructs positively, never embeds a verbatim ban-list.
 *
 * Acceptance criteria mapping (from the ticket):
 *  (i)    empty input → eligible: false
 *  (ii)   10 programs, 50 plans → eligible: false, eligibilityReason:
 *         'too_few_programs'
 *  (iii)  25 programs, 60 plans → eligible: true, top 2 named
 *  (iv)   50 programs → eligible, distinctProgramCount: 50, still
 *         only top 2 named
 *  (v)    one named program is opted-out → excluded from
 *         namedPrograms but INCLUDED in distinctProgramCount
 *  (vi)   plan older than 7 days → not counted
 *  (vii)  plan in a different sport → not counted
 *  (viii) plan without the target skill → not counted
 *  (ix)   ties broken alphabetically by program name
 *  (x)    deterministic across input order
 *  (xi)   directorFirstName missing → program excluded from named list
 *  (xii)  planted surname-shaped strings fail the literal-space scan
 *  (xiii) no banned word in any rendered field
 *
 * .test.ts NOT .spec.ts (LESSONS#0038).
 */
import { describe, it, expect } from 'vitest';
import { computeSportWideConvergence } from '@/lib/sport-wide-convergence';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

const SPORT_ID = '00000000-0000-4000-a000-0000000000b1';
const OTHER_SPORT_ID = '00000000-0000-4000-a000-0000000000b2';
const SKILL_ID = 'closeouts';
const NOW_MS = Date.parse('2026-06-19T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function plan(
  orgId: string,
  daysAgo: number,
  opts: { sportId?: string; skills?: string[]; ageGroups?: string[] } = {},
) {
  return {
    id: `${orgId}-p-${daysAgo}`,
    org_id: orgId,
    created_at: new Date(NOW_MS - daysAgo * DAY).toISOString(),
    skills_targeted: opts.skills ?? [SKILL_ID],
    sport_id: opts.sportId ?? SPORT_ID,
    age_groups: opts.ageGroups ?? ['8-10'],
  };
}

function program(id: string, name: string, director?: string, optedOut = false) {
  return {
    id,
    name,
    director_first_name: director,
    opted_out: optedOut,
    age_groups_served: ['8-10'],
  };
}

describe('computeSportWideConvergence (ticket 0091)', () => {
  it('(i) empty input → eligible: false', () => {
    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows: [],
      programRows: [],
      nowMs: NOW_MS,
    });
    expect(result.eligible).toBe(false);
    expect(result.distinctProgramCount).toBe(0);
    expect(result.totalPlanCount).toBe(0);
    expect(result.namedPrograms).toEqual([]);
  });

  it('(ii) 10 programs, 50 plans → eligible: false, eligibilityReason: too_few_programs', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 10; i++) {
      const orgId = `org-${i}`;
      programRows.push(program(orgId, `Program ${String.fromCharCode(65 + i)}`, 'Maya'));
      // 5 plans each from each org (total 50)
      for (let j = 0; j < 5; j++) planRows.push(plan(orgId, j));
    }
    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.eligible).toBe(false);
    expect(result.eligibilityReason).toBe('too_few_programs');
    expect(result.distinctProgramCount).toBe(10);
    expect(result.totalPlanCount).toBe(50);
    expect(result.namedPrograms).toEqual([]);
  });

  it('(iii) 25 programs, 60 plans → eligible: true, top 2 named', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 25; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      planRows.push(plan(orgId, 1));
    }
    // The top 2 shippers: program "Hawks Basketball" and "Riverside U10"
    programRows.push(program('hawks', 'Hawks Basketball', 'Riya'));
    programRows.push(program('riverside', 'Riverside U10', 'Ben'));
    // Hawks ships 4 plans, Riverside ships 3 plans, total 60.
    // Remaining 60 - 25 - 4 - 3 = 28; reuse the first program (already
    // counted in distinctProgramCount but bumps totalPlanCount).
    planRows.push(plan('hawks', 1));
    planRows.push(plan('hawks', 1));
    planRows.push(plan('hawks', 1));
    planRows.push(plan('hawks', 1));
    planRows.push(plan('riverside', 2));
    planRows.push(plan('riverside', 2));
    planRows.push(plan('riverside', 2));
    for (let k = 0; k < 28; k++) planRows.push(plan('org-00', 1));

    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.eligible).toBe(true);
    expect(result.distinctProgramCount).toBe(27); // 25 + hawks + riverside
    expect(result.totalPlanCount).toBe(60);
    expect(result.namedPrograms).toHaveLength(2);
    // org-00 has 29 plans (1 + 28); it's the actual top shipper.
    expect(result.namedPrograms[0].orgId).toBe('org-00');
    expect(result.namedPrograms[0].planCount).toBe(29);
    expect(result.namedPrograms[1].orgId).toBe('hawks');
    expect(result.namedPrograms[1].planCount).toBe(4);
  });

  it('(iv) 50 programs → distinctProgramCount: 50, still only top 2 named', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 50; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      // each ships the same single plan
      planRows.push(plan(orgId, 1));
    }
    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.eligible).toBe(true);
    expect(result.distinctProgramCount).toBe(50);
    expect(result.totalPlanCount).toBe(50);
    // All tied at 1 plan each — ties break alphabetically by name.
    expect(result.namedPrograms).toHaveLength(2);
    expect(result.namedPrograms[0].programName).toBe('Program 00');
    expect(result.namedPrograms[1].programName).toBe('Program 01');
  });

  it('(v) one named program is opted-out → excluded from namedPrograms but INCLUDED in distinctProgramCount', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 25; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      planRows.push(plan(orgId, 1));
    }
    // The TOP shipper is opted out — should drop from named list.
    programRows.push(program('hawks', 'Hawks Basketball', 'Riya', /*optedOut*/ true));
    for (let k = 0; k < 5; k++) planRows.push(plan('hawks', 1));
    // The next-top non-opted is "Riverside" with 3 plans.
    programRows.push(program('riverside', 'Riverside U10', 'Ben'));
    planRows.push(plan('riverside', 1));
    planRows.push(plan('riverside', 1));
    planRows.push(plan('riverside', 1));

    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.eligible).toBe(true);
    expect(result.distinctProgramCount).toBe(27); // 25 + hawks + riverside
    // Hawks is NOT in named programs (opted out) even though it ships
    // the most. Riverside leads the named list.
    expect(result.namedPrograms.map((p) => p.orgId)).not.toContain('hawks');
    expect(result.namedPrograms[0].orgId).toBe('riverside');
    expect(result.namedPrograms[0].planCount).toBe(3);
  });

  it('(vi) plan older than 7 days → not counted', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 25; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      planRows.push(plan(orgId, 1));
    }
    // One program ships ONLY old plans (8+ days ago) — must not count.
    programRows.push(program('old-shop', 'Old Shop', 'Sam'));
    planRows.push(plan('old-shop', 8));
    planRows.push(plan('old-shop', 10));
    planRows.push(plan('old-shop', 30));

    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.distinctProgramCount).toBe(25); // old-shop excluded
    expect(result.namedPrograms.map((p) => p.orgId)).not.toContain('old-shop');
  });

  it('(vii) plan in a different sport → not counted', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 25; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      planRows.push(plan(orgId, 1));
    }
    // Off-sport program — must not count.
    programRows.push(program('off-sport', 'Soccer Program', 'Lin'));
    for (let k = 0; k < 10; k++) planRows.push(plan('off-sport', 1, { sportId: OTHER_SPORT_ID }));

    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.distinctProgramCount).toBe(25);
    expect(result.namedPrograms.map((p) => p.orgId)).not.toContain('off-sport');
  });

  it('(viii) plan without the target skill → not counted', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 25; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      planRows.push(plan(orgId, 1));
    }
    // Off-skill program.
    programRows.push(program('off-skill', 'Off Skill', 'Tara'));
    for (let k = 0; k < 5; k++) {
      planRows.push(plan('off-skill', 1, { skills: ['rebounding'] }));
    }

    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.distinctProgramCount).toBe(25);
    expect(result.namedPrograms.map((p) => p.orgId)).not.toContain('off-skill');
  });

  it('(ix) ties broken alphabetically by programName', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 23; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      planRows.push(plan(orgId, 1));
    }
    // Two programs both ship 5 plans (the tie).
    programRows.push(program('zebra', 'Zebra Crossing', 'Ben'));
    for (let k = 0; k < 5; k++) planRows.push(plan('zebra', 1));
    programRows.push(program('apex', 'Apex Athletics', 'Riya'));
    for (let k = 0; k < 5; k++) planRows.push(plan('apex', 1));

    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.eligible).toBe(true);
    expect(result.namedPrograms).toHaveLength(2);
    // Apex sorts before Zebra alphabetically — wins the tie.
    expect(result.namedPrograms[0].programName).toBe('Apex Athletics');
    expect(result.namedPrograms[1].programName).toBe('Zebra Crossing');
  });

  it('(x) deterministic across input order', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 25; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      planRows.push(plan(orgId, 1));
    }
    programRows.push(program('hawks', 'Hawks Basketball', 'Riya'));
    programRows.push(program('riverside', 'Riverside U10', 'Ben'));
    planRows.push(plan('hawks', 1));
    planRows.push(plan('hawks', 1));
    planRows.push(plan('hawks', 1));
    planRows.push(plan('riverside', 1));
    planRows.push(plan('riverside', 1));

    const first = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    // Reverse the inputs and re-run.
    const second = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows: [...planRows].reverse(),
      programRows: [...programRows].reverse(),
      nowMs: NOW_MS,
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('(xi) directorFirstName missing → program excluded from named list', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 25; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      planRows.push(plan(orgId, 1));
    }
    // Top shipper has no director name attached — excluded from named.
    programRows.push(program('orphan', 'Orphan Program', /*director*/ undefined));
    for (let k = 0; k < 10; k++) planRows.push(plan('orphan', 1));

    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.eligible).toBe(true);
    expect(result.distinctProgramCount).toBe(26);
    expect(result.namedPrograms.map((p) => p.orgId)).not.toContain('orphan');
  });

  it('(xii) rendered director first names pass the literal-space defensive scan (LESSONS#0061)', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 25; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      // PLANTED surname-shaped string — the helper must strip the
      // surname via literal-space split so the rendered first name is
      // surname-free.
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya Walker'));
      planRows.push(plan(orgId, 1));
    }
    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(result.eligible).toBe(true);
    for (const np of result.namedPrograms) {
      // No space anywhere in directorFirstName.
      expect(np.directorFirstName).not.toMatch(/ /);
      expect(np.directorFirstName).toBe('Maya');
    }
  });

  it('(xiii) no banned word in any rendered field', () => {
    const planRows = [];
    const programRows = [];
    for (let i = 0; i < 25; i++) {
      const orgId = `org-${String(i).padStart(2, '0')}`;
      programRows.push(program(orgId, `Program ${String(i).padStart(2, '0')}`, 'Maya'));
      planRows.push(plan(orgId, 1));
    }
    const result = computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    const json = JSON.stringify(result).toLowerCase();
    for (const banned of BANNED_HYPE) {
      expect(json).not.toContain(banned);
    }
  });

  it('does not mutate the input arrays (LESSONS#0070)', () => {
    const planRows = [plan('org-0', 1)];
    const programRows = [program('org-0', 'Program 0', 'Maya')];
    const planRowsClone = JSON.parse(JSON.stringify(planRows));
    const programRowsClone = JSON.parse(JSON.stringify(programRows));
    computeSportWideConvergence({
      skillId: SKILL_ID,
      sportId: SPORT_ID,
      planRows,
      programRows,
      nowMs: NOW_MS,
    });
    expect(planRows).toEqual(planRowsClone);
    expect(programRows).toEqual(programRowsClone);
  });
});
