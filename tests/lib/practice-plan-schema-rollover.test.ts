/**
 * Ticket 0045 — practicePlanSchema accepts optional rollover_from_last_week.
 *
 * AC5: the generated practice plan's content_structured includes a top-level
 *      `rollover_from_last_week: { drill_id, drill_name, source_plan_id }[]`
 *      array — empty by default. The schema validator accepts the new field as
 *      optional; a plan without it (today's cold-start path) still validates.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { practicePlanSchema } from '@/lib/ai/schemas';

const VALID_BASE = {
  title: 'Defense & Spacing Practice',
  duration_minutes: 60,
  warmup: { name: 'Dynamic Warmup', duration_minutes: 5, description: 'Light jog and stretches.' },
  drills: [
    { name: 'Closeout Drill', duration_minutes: 15, description: 'Closeouts.' },
  ],
};

describe('practicePlanSchema — rollover_from_last_week (ticket 0045)', () => {
  it('accepts a valid plan WITHOUT rollover_from_last_week (byte-identical cold-start)', () => {
    expect(() => practicePlanSchema.parse(VALID_BASE)).not.toThrow();
  });

  it('accepts a valid plan WITH rollover_from_last_week (populated by the model)', () => {
    const plan = {
      ...VALID_BASE,
      rollover_from_last_week: [
        { drill_id: 'corner-shooting', drill_name: 'Corner Shooting', source_plan_id: 'prior-1' },
        { drill_id: '3-on-3-to-shot', drill_name: '3-on-3 to Shot', source_plan_id: 'prior-1' },
      ],
    };
    expect(() => practicePlanSchema.parse(plan)).not.toThrow();
  });

  it('accepts an empty rollover array (no rollovers for this practice)', () => {
    const plan = { ...VALID_BASE, rollover_from_last_week: [] };
    expect(() => practicePlanSchema.parse(plan)).not.toThrow();
  });

  it('rejects a rollover entry missing the required drill_id / drill_name / source_plan_id triple', () => {
    // Cast to bypass the typed shape so the runtime validator (not tsc) is what
    // rejects the malformed entry — that's the gate we care about at runtime.
    const plan = {
      ...VALID_BASE,
      rollover_from_last_week: [{ drill_name: 'Corner Shooting' }] as unknown as Array<{
        drill_id: string;
        drill_name: string;
        source_plan_id: string;
      }>,
    };
    expect(() => practicePlanSchema.parse(plan)).toThrow();
  });
});
