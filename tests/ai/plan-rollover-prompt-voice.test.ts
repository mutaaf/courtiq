/**
 * Ticket 0045 — practicePlan prompt voice + rollover-block shape.
 *
 * AC7: when the practicePlan prompt is rendered WITH rollover drills, neither
 *      the system nor the user block contains any AGENTS.md banned word
 *      (`journey`, `amazing`, `exciting`, `elevate`, `empower`, `synergy`).
 *      Per LESSONS#0023 the instruction is POSITIVE ("if the coach didn't get
 *      to a drill last week, prefer carrying it forward") and never enumerates
 *      the banned tokens verbatim.
 *
 * AC4 (rollover-only-on-rollover): the rendered prompt with an EMPTY rollover
 *      array is BYTE-IDENTICAL to the rendered prompt with no rollover param
 *      at all — the carry-forward block is omitted cleanly so the cold-start
 *      shape is unchanged.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';

const BASE_PARAMS = {
  teamName: 'Tigers',
  ageGroup: '11-13',
  seasonWeek: 5,
  playerCount: 10,
  practiceDuration: 60,
  roster: [],
};

describe('PROMPT_REGISTRY.practicePlan — rollover voice + cold-start shape (ticket 0045)', () => {
  it('rendered prompt with rollover drills carries no AGENTS.md banned words', () => {
    const { system, user } = PROMPT_REGISTRY.practicePlan({
      ...BASE_PARAMS,
      rolloverDrills: [
        { name: 'Corner Shooting', focus: 'shooting from the corner', duration_minutes: 10 },
        { name: '3-on-3 to Shot', focus: 'small-sided to a shot', duration_minutes: 12 },
      ],
    });
    const blob = `${system}\n${user}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(blob).not.toContain(banned);
    }
  });

  it('rollover block names the rolled-over drills (so the model can fold them into the plan)', () => {
    const { user } = PROMPT_REGISTRY.practicePlan({
      ...BASE_PARAMS,
      rolloverDrills: [
        { name: 'Corner Shooting', focus: 'shooting from the corner', duration_minutes: 10 },
      ],
    });
    expect(user).toContain('Corner Shooting');
  });

  it('the empty-rollover prompt is byte-identical to the no-rollover prompt (cold-start shape unchanged)', () => {
    const withoutParam = PROMPT_REGISTRY.practicePlan({ ...BASE_PARAMS });
    const withEmpty = PROMPT_REGISTRY.practicePlan({ ...BASE_PARAMS, rolloverDrills: [] });
    expect(withEmpty.system).toBe(withoutParam.system);
    expect(withEmpty.user).toBe(withoutParam.user);
  });

  it('the no-rollover prompt has no carry-forward phrasing at all', () => {
    const { user } = PROMPT_REGISTRY.practicePlan({ ...BASE_PARAMS });
    expect(user.toLowerCase()).not.toContain('carry');
  });
});
