/**
 * Ticket 0045 — pure helper for the unfinished-drills rollover.
 *
 * AC2: diffPracticeForRollover(plan, completedDrillIds) returns the drills the
 *      coach DID NOT run on the prior plan, capped at 3, with a `reason` tag for
 *      the four matrix cases:
 *        - { rolloverDrills: Drill[], reason: 'time_ran_out' }   — partial
 *        - { rolloverDrills: [], reason: 'all_completed' }       — full
 *        - { rolloverDrills: [], reason: 'no_prior_plan' }       — cold start
 *
 *      The helper takes drill NAME-SLUGS as the identity key (the practicePlan
 *      schema's drills[] array has no `id`); the route normalises to slugs
 *      before calling. The helper itself is pure and IO-free.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import {
  diffPracticeForRollover,
  drillNameToSlug,
  type RolloverDrill,
} from '@/lib/practice-rollover-utils';

// Convenience: build a minimal practicePlan-shaped object with the named
// drills. Real practicePlanSchema rows carry more fields (skill_id, cues, etc.);
// the helper only reads `name`, `duration_minutes`, and any `focus` it can
// derive from the description — we exercise the minimum.
function planWith(drillNames: string[]): {
  content_structured: {
    drills: { name: string; duration_minutes: number; description?: string }[];
  };
} {
  return {
    content_structured: {
      drills: drillNames.map((name) => ({
        name,
        duration_minutes: 10,
        description: `${name} description`,
      })),
    },
  };
}

describe('drillNameToSlug', () => {
  it('normalises whitespace, casing, and punctuation to a stable slug', () => {
    expect(drillNameToSlug('Corner Shooting')).toBe('corner-shooting');
    expect(drillNameToSlug('  Corner   Shooting  ')).toBe('corner-shooting');
    expect(drillNameToSlug('3-on-3 to Shot')).toBe('3-on-3-to-shot');
    expect(drillNameToSlug('Shell Drill!')).toBe('shell-drill');
  });

  it('returns an empty string for empty / non-string input (guards the diff)', () => {
    expect(drillNameToSlug('')).toBe('');
    expect(drillNameToSlug('   ')).toBe('');
  });
});

describe('diffPracticeForRollover (ticket 0045)', () => {
  it('partial-completion: returns the un-run drills tagged time_ran_out', () => {
    const plan = planWith([
      'Warmup Layups',
      'Ball Handling Stations',
      'Pick and Roll',
      'Corner Shooting',
      '3-on-3 to Shot',
      'Scrimmage',
    ]);
    const completed = [
      drillNameToSlug('Warmup Layups'),
      drillNameToSlug('Ball Handling Stations'),
      drillNameToSlug('Pick and Roll'),
      drillNameToSlug('Scrimmage'),
    ];

    const out = diffPracticeForRollover(plan, completed);

    expect(out.reason).toBe('time_ran_out');
    expect(out.rolloverDrills.map((d: RolloverDrill) => d.name)).toEqual([
      'Corner Shooting',
      '3-on-3 to Shot',
    ]);
  });

  it('full-completion: returns empty list tagged all_completed', () => {
    const plan = planWith(['Layup Lines', 'Defensive Slides', 'Scrimmage']);
    const completed = plan.content_structured.drills.map((d) => drillNameToSlug(d.name));

    const out = diffPracticeForRollover(plan, completed);

    expect(out.reason).toBe('all_completed');
    expect(out.rolloverDrills).toEqual([]);
  });

  it('no-prior-plan: returns empty list tagged no_prior_plan', () => {
    expect(diffPracticeForRollover(null, [])).toEqual({
      rolloverDrills: [],
      reason: 'no_prior_plan',
    });
    expect(diffPracticeForRollover(undefined, [])).toEqual({
      rolloverDrills: [],
      reason: 'no_prior_plan',
    });
  });

  it('caps the rolled-over drill list at 3 even when more were skipped', () => {
    const plan = planWith([
      'Drill 1',
      'Drill 2',
      'Drill 3',
      'Drill 4',
      'Drill 5',
      'Drill 6',
    ]);
    // Coach got NOWHERE — empty completed list. A force-closed timer leaves
    // the column at its default [], which the helper treats as "every drill
    // was skipped." We still cap at 3 to keep the suggestion tractable.
    const out = diffPracticeForRollover(plan, []);

    expect(out.reason).toBe('time_ran_out');
    expect(out.rolloverDrills).toHaveLength(3);
    expect(out.rolloverDrills.map((d) => d.name)).toEqual(['Drill 1', 'Drill 2', 'Drill 3']);
  });

  it('treats an empty/missing completed_drill_ids array as zero completions (generous rollover)', () => {
    const plan = planWith(['A', 'B']);
    // Both shapes the route may see — the default DB value '[]' and an
    // explicit null-ish — collapse to the same "everything skipped" branch.
    expect(diffPracticeForRollover(plan, []).rolloverDrills.map((d) => d.name)).toEqual(['A', 'B']);
    // The DB column is jsonb NOT NULL DEFAULT '[]' — but a route fetching
    // an older row before the migration backfilled COULD see null. The
    // helper accepts null defensively (typed `string[] | null | undefined`).
    expect(
      diffPracticeForRollover(plan, null).rolloverDrills.map((d) => d.name),
    ).toEqual(['A', 'B']);
  });

  it('handles a prior plan with no drills array at all without throwing', () => {
    expect(
      diffPracticeForRollover({ content_structured: { drills: [] } }, []),
    ).toEqual({ rolloverDrills: [], reason: 'all_completed' });

    expect(
      diffPracticeForRollover({ content_structured: null }, []),
    ).toEqual({ rolloverDrills: [], reason: 'all_completed' });
  });

  it('matches completion via slug, not literal name — capitalisation drift does NOT mis-flag a drill as skipped', () => {
    const plan = planWith(['Corner Shooting', '3-on-3 to Shot']);
    // The timer recorded the slug, not the display name — confirm the helper
    // also normalises the prior plan's drill name before comparing.
    const completed = ['corner-shooting'];

    const out = diffPracticeForRollover(plan, completed);

    expect(out.reason).toBe('time_ran_out');
    expect(out.rolloverDrills.map((d) => d.name)).toEqual(['3-on-3 to Shot']);
  });
});
