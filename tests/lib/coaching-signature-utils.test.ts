/**
 * Ticket 0037 — the pure coaching-signature builder.
 *
 * `buildCoachingSignature(plans)` derives a compact, prompt-safe summary of how a
 * coach actually runs practice across ALL their teams, from the coach's OWN
 * persisted `plans` rows: their most-frequent `skills_targeted`, the
 * recurring drill names pulled from `content_structured` (practice plans AND
 * practice arcs), and a typical session length. It returns `null` for a
 * cold-start coach with too few plans, and bounds every list so the block stays
 * small enough to thread into a prompt.
 *
 * The helper touches ONLY `plans`-derived fields — never a `players` row, never
 * per-child observation text — so the signature can carry no minor data (COPPA /
 * data minimization).
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the Playwright spec glob (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import {
  buildCoachingSignature,
  MIN_PLANS_FOR_SIGNATURE,
  MAX_SIGNATURE_SKILLS,
  MAX_SIGNATURE_DRILLS,
  type CoachPlanRow,
} from '@/lib/coaching-signature-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A practice plan row: drill names live under content_structured.warmup + drills[]. */
function practicePlan(
  skills: string[],
  drillNames: string[],
  durationMinutes: number,
  warmupName?: string,
): CoachPlanRow {
  return {
    type: 'practice',
    skills_targeted: skills,
    content_structured: {
      title: 'Practice',
      duration_minutes: durationMinutes,
      warmup: warmupName ? { name: warmupName, duration_minutes: 5, description: 'x' } : undefined,
      drills: drillNames.map((name) => ({ name, duration_minutes: 10, description: 'y' })),
    },
  };
}

/** A practice-arc row: drill names live under content_structured.sessions[].drills[]. */
function practiceArc(skills: string[], drillNames: string[], sessionMinutes: number): CoachPlanRow {
  return {
    type: 'practice_arc',
    skills_targeted: skills,
    content_structured: {
      arc_title: 'Arc',
      primary_focus: skills,
      sessions: [
        {
          session_number: 1,
          duration_minutes: sessionMinutes,
          warmup: { name: 'Arc warmup', duration_minutes: 5, description: 'z' },
          drills: drillNames.map((name) => ({ name, duration_minutes: 10, description: 'w' })),
        },
      ],
    },
  };
}

// ─── AC1: many plans → ranked summary ────────────────────────────────────────

describe('buildCoachingSignature — ranked summary from a coach with history', () => {
  it('ranks the most frequent skills_targeted across all the coach plans', () => {
    const plans: CoachPlanRow[] = [
      practicePlan(['Defense', 'Passing'], ['Closeout Drill'], 60),
      practicePlan(['Defense', 'Spacing'], ['Shell Drill'], 60),
      practicePlan(['Defense'], ['Closeout Drill'], 60),
      practicePlan(['Passing'], ['Monkey in the Middle'], 60),
      practicePlan(['Spacing'], ['5-Out Motion'], 60),
    ];

    const sig = buildCoachingSignature(plans);
    expect(sig).not.toBeNull();
    // Defense (3) is the clear leader, then Passing (2) and Spacing (2).
    expect(sig!.top_skills[0]).toBe('Defense');
    expect(sig!.top_skills).toContain('Passing');
    expect(sig!.top_skills).toContain('Spacing');
  });

  it('extracts recurring drill names from content_structured, ranked by recurrence', () => {
    const plans: CoachPlanRow[] = [
      practicePlan(['Defense'], ['Closeout Drill', 'Shell Drill'], 60, 'Dynamic Warmup'),
      practicePlan(['Defense'], ['Closeout Drill'], 60, 'Dynamic Warmup'),
      practicePlan(['Passing'], ['Closeout Drill', 'Monkey in the Middle'], 60),
      practiceArc(['Spacing'], ['Shell Drill', '5-Out Motion'], 60),
      practicePlan(['Effort'], ['Suicides'], 60),
    ];

    const sig = buildCoachingSignature(plans);
    expect(sig).not.toBeNull();
    // "Closeout Drill" recurs the most (3 plans) → first.
    expect(sig!.recurring_drills[0]).toBe('Closeout Drill');
    // A drill that only appears in a practice ARC is still picked up.
    expect(sig!.recurring_drills).toContain('Shell Drill');
  });

  it('derives a typical session length from the plans (representative, not the max outlier)', () => {
    const plans: CoachPlanRow[] = [
      practicePlan(['Defense'], ['A'], 60),
      practicePlan(['Defense'], ['B'], 60),
      practicePlan(['Passing'], ['C'], 60),
      practicePlan(['Spacing'], ['D'], 90),
      practicePlan(['Effort'], ['E'], 45),
    ];

    const sig = buildCoachingSignature(plans);
    expect(sig).not.toBeNull();
    // 60 is the most common session length → it is the typical one (not 90).
    expect(sig!.typical_session_minutes).toBe(60);
  });
});

// ─── AC1: <N plans → null (cold start) ───────────────────────────────────────

describe('buildCoachingSignature — cold-start coach returns null', () => {
  it('returns null when the coach has fewer than the minimum number of plans', () => {
    const tooFew = Array.from({ length: MIN_PLANS_FOR_SIGNATURE - 1 }, () =>
      practicePlan(['Defense'], ['Closeout Drill'], 60),
    );
    expect(buildCoachingSignature(tooFew)).toBeNull();
  });

  it('returns null for an empty plan list', () => {
    expect(buildCoachingSignature([])).toBeNull();
  });

  it('returns null when there are enough rows but none carry usable plan signal', () => {
    // Enough rows, but no skills and no drills to rank → no honest signature.
    const empty: CoachPlanRow[] = Array.from({ length: MIN_PLANS_FOR_SIGNATURE + 2 }, () => ({
      type: 'practice',
      skills_targeted: [],
      content_structured: null,
    }));
    expect(buildCoachingSignature(empty)).toBeNull();
  });
});

// ─── AC1: bounded length ─────────────────────────────────────────────────────

describe('buildCoachingSignature — bounded, prompt-safe size', () => {
  it('caps top_skills and recurring_drills to a small bound', () => {
    const manySkills = Array.from({ length: 20 }, (_, i) => `Skill${i}`);
    const manyDrills = Array.from({ length: 20 }, (_, i) => `Drill${i}`);
    // Repeat each plan so every skill/drill recurs (rank is stable) and we clear N.
    const plans: CoachPlanRow[] = [];
    for (let r = 0; r < 3; r++) {
      manySkills.forEach((s, i) => plans.push(practicePlan([s], [manyDrills[i]], 60)));
    }

    const sig = buildCoachingSignature(plans);
    expect(sig).not.toBeNull();
    expect(sig!.top_skills.length).toBeLessThanOrEqual(MAX_SIGNATURE_SKILLS);
    expect(sig!.recurring_drills.length).toBeLessThanOrEqual(MAX_SIGNATURE_DRILLS);
  });
});

// ─── AC7: COPPA — only coach-plan-derived aggregates, no minor data ───────────

describe('buildCoachingSignature — COPPA / data minimization', () => {
  it('the signature object has only coach-plan-derived aggregate keys', () => {
    const plans: CoachPlanRow[] = [
      practicePlan(['Defense'], ['Closeout Drill'], 60),
      practicePlan(['Defense'], ['Shell Drill'], 60),
      practicePlan(['Passing'], ['Monkey in the Middle'], 60),
      practicePlan(['Spacing'], ['5-Out Motion'], 60),
      practicePlan(['Effort'], ['Suicides'], 60),
    ];

    const sig = buildCoachingSignature(plans)!;
    expect(Object.keys(sig).sort()).toEqual(
      ['recurring_drills', 'top_skills', 'typical_session_minutes'].sort(),
    );
  });

  it('never surfaces player names or observation text even if a plan row carries them', () => {
    // A maliciously-shaped plan row carrying minor data must NOT leak it into the
    // signature — the builder only reads skills_targeted + drill/warmup names.
    const poisoned: CoachPlanRow[] = Array.from({ length: 6 }, () => ({
      type: 'practice',
      skills_targeted: ['Defense'],
      content_structured: {
        // Real plan fields the builder uses:
        drills: [{ name: 'Closeout Drill', duration_minutes: 10, description: 'x' }],
        duration_minutes: 60,
        // Minor data that must never appear in the output:
        player_name: 'Maya Johnson',
        players: [{ name: 'Maya Johnson', date_of_birth: '2013-04-01' }],
        observations: [{ text: 'Maya struggled with closeouts', player_name: 'Maya Johnson' }],
      },
    }));

    const sig = buildCoachingSignature(poisoned)!;
    const serialized = JSON.stringify(sig);
    expect(serialized).not.toContain('Maya Johnson');
    expect(serialized).not.toContain('date_of_birth');
    expect(serialized).not.toContain('observations');
    expect(serialized).not.toContain('player_name');
    // It still produced the legitimate drill-derived signal.
    expect(sig.recurring_drills).toContain('Closeout Drill');
  });
});
