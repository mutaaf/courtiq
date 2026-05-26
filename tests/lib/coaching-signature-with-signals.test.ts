/**
 * Ticket 0039 — `buildCoachingSignature(plans, options?)` extension.
 *
 * AC6: extends the 0037 helper with an optional `drillSignals` (and a
 * `drill_id_by_name` lookup) so the `recurring_drills` list is RE-RANKED by
 * the coach's own thumbs-up / thumbs-down:
 *   - An upvoted drill outweighs a high-frequency-but-downvoted one.
 *   - A downvoted drill is suppressed from the list.
 *   - When `options` is omitted, the function returns BYTE-IDENTICAL output to
 *     today's behavior so cold callers (and the existing fixture pin) are
 *     unaffected.
 *
 * .test.ts NOT .spec.ts — vitest excludes the Playwright spec glob (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import {
  buildCoachingSignature,
  type CoachPlanRow,
} from '@/lib/coaching-signature-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function plan(skills: string[], drillNames: string[], duration = 60): CoachPlanRow {
  return {
    type: 'practice',
    skills_targeted: skills,
    content_structured: {
      duration_minutes: duration,
      drills: drillNames.map((name) => ({ name, duration_minutes: 10, description: 'x' })),
    },
  };
}

// A baseline 5-plan history that yields a deterministic frequency ranking:
//   Closeout Drill (3) > Shell Drill (2) > Pick-and-Roll (2) > Suicides (1)
//   (rankByCount tie-broken alphabetically — see coaching-signature-utils.ts).
const HISTORY: CoachPlanRow[] = [
  plan(['Defense'], ['Closeout Drill', 'Shell Drill']),
  plan(['Defense'], ['Closeout Drill']),
  plan(['Passing'], ['Closeout Drill', 'Pick-and-Roll']),
  plan(['Spacing'], ['Shell Drill', 'Pick-and-Roll']),
  plan(['Effort'], ['Suicides']),
];

// drill_id_by_name lookup the route assembles alongside the signals fetch.
const DRILL_IDS: Record<string, string> = {
  'Closeout Drill': 'drill-co',
  'Shell Drill': 'drill-sh',
  'Pick-and-Roll': 'drill-pr',
  'Suicides': 'drill-su',
  'Box Out Drill': 'drill-bo', // a drill not in the recurring history (yet).
};

// ─── AC6: cold call is BYTE-IDENTICAL to single-argument call ────────────────

describe('buildCoachingSignature — cold caller compatibility (regression pin)', () => {
  it('omitting options returns the same shape as today (no drillSignals)', () => {
    const cold = buildCoachingSignature(HISTORY);
    const explicit = buildCoachingSignature(HISTORY, undefined);
    expect(JSON.stringify(cold)).toBe(JSON.stringify(explicit));
  });

  it('passing an empty drillSignals array does not perturb the ranking', () => {
    const cold = buildCoachingSignature(HISTORY)!;
    const withEmpty = buildCoachingSignature(HISTORY, { drillSignals: [] })!;
    expect(withEmpty.recurring_drills).toEqual(cold.recurring_drills);
    expect(withEmpty.top_skills).toEqual(cold.top_skills);
    expect(withEmpty.typical_session_minutes).toBe(cold.typical_session_minutes);
  });
});

// ─── AC6: up-rated drills float ahead of frequency-only matches ──────────────

describe('buildCoachingSignature — up-rated drill outweighs frequency-only', () => {
  it('promotes an up-rated drill ahead of more-frequent unrated drills', () => {
    // Without signals, Closeout Drill (3 plans) leads. With "Shell Drill"
    // up-rated AND run more times, the coach's preference should outweigh
    // pure frequency and surface Shell Drill ahead of Closeout.
    const sig = buildCoachingSignature(HISTORY, {
      drillSignals: [
        { drill_id: 'drill-sh', rating: 'up', run_count: 12 }, // Shell Drill
        { drill_id: 'drill-co', rating: 'up', run_count: 3 },  // Closeout
      ],
      drill_id_by_name: DRILL_IDS,
    })!;

    // Both up-rated drills survive; Shell (more runs) leads Closeout (fewer).
    const shellIdx = sig.recurring_drills.indexOf('Shell Drill');
    const closeoutIdx = sig.recurring_drills.indexOf('Closeout Drill');
    expect(shellIdx).toBeGreaterThanOrEqual(0);
    expect(closeoutIdx).toBeGreaterThan(shellIdx);
  });

  it('surfaces an up-rated drill that has not yet recurred in the plan history', () => {
    // Box Out Drill is NOT in HISTORY — but the coach has up-rated it. It
    // should be added to recurring_drills (best-effort, within the cap).
    const sig = buildCoachingSignature(HISTORY, {
      drillSignals: [
        { drill_id: 'drill-bo', rating: 'up', run_count: 5 }, // Box Out Drill
      ],
      drill_id_by_name: DRILL_IDS,
    })!;

    expect(sig.recurring_drills).toContain('Box Out Drill');
  });
});

// ─── AC6: down-rated drill is suppressed ─────────────────────────────────────

describe('buildCoachingSignature — down-rated drill is suppressed', () => {
  it('drops a down-rated drill from recurring_drills even if it was most frequent', () => {
    // Closeout Drill is the most-frequent recurring drill in HISTORY (3 plans).
    // A clear thumbs-DOWN means the coach is done with it — it should not
    // appear in recurring_drills at all.
    const sig = buildCoachingSignature(HISTORY, {
      drillSignals: [
        { drill_id: 'drill-co', rating: 'down', run_count: 8 }, // Closeout
      ],
      drill_id_by_name: DRILL_IDS,
    })!;

    expect(sig.recurring_drills).not.toContain('Closeout Drill');
    // The other recurring drills survive.
    expect(sig.recurring_drills).toContain('Shell Drill');
    expect(sig.recurring_drills).toContain('Pick-and-Roll');
  });

  it('a down-rated drill not in recurring is a no-op (drill stays absent, other ranks unaffected)', () => {
    // Suicides only appears in one plan (below the recurrence floor), so it's
    // already absent from baseline's recurring_drills. Down-rating it must be
    // a no-op for the rest of the list — never an error, never a reshuffle.
    const baseline = buildCoachingSignature(HISTORY)!;
    const withDown = buildCoachingSignature(HISTORY, {
      drillSignals: [
        { drill_id: 'drill-su', rating: 'down', run_count: 1 }, // Suicides
      ],
      drill_id_by_name: DRILL_IDS,
    })!;
    // Suicides remains absent in both; the surviving drills keep their order.
    expect(baseline.recurring_drills).not.toContain('Suicides');
    expect(withDown.recurring_drills).not.toContain('Suicides');
    expect(withDown.recurring_drills).toEqual(baseline.recurring_drills);
  });
});

// ─── AC7: COPPA — the signals shape carries no minor data ────────────────────

describe('buildCoachingSignature — signals payload contains no minor data', () => {
  it('a signal carrying ONLY drill_id/rating/run_count never leaks anything else', () => {
    // The helper must read ONLY the documented fields off each signal. A
    // malformed signal carrying extra (player-shaped) keys must not crash and
    // must not leak those keys into the returned signature.
    const poisoned = [
      {
        drill_id: 'drill-co',
        rating: 'up' as const,
        run_count: 3,
        // Minor-shaped extras the helper must IGNORE:
        player_name: 'Maya Johnson',
        date_of_birth: '2013-04-01',
        observation: 'Maya struggled with closeouts',
      },
    ];
    const sig = buildCoachingSignature(HISTORY, {
      drillSignals: poisoned,
      drill_id_by_name: DRILL_IDS,
    })!;

    const serialized = JSON.stringify(sig);
    expect(serialized).not.toContain('Maya Johnson');
    expect(serialized).not.toContain('date_of_birth');
    expect(serialized).not.toContain('observation');
  });
});
