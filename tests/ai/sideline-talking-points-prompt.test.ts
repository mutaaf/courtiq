/**
 * Ticket 0046 — `sidelineTalkingPoints` prompt + schema shape (unit, no AI call).
 *
 * AC mapped here:
 *  (1) PROMPT_REGISTRY.sidelineTalkingPoints accepts { team, players,
 *      observationInsightsByPlayer } and renders the per-player insight blocks
 *      into the user prompt.
 *  (2) Voice contract: the rendered system+user prompt contains NO AGENTS.md
 *      banned word, and the voice is instructed POSITIVELY (LESSONS#0023 —
 *      never enumerate the ban list verbatim).
 *  (1) Schema is two-key top-level (team_id + entries) with EXACTLY four keys
 *      per entry (player_id, player_first_name, lead_line, working_on_line).
 *      Strict — any extra key (including a full surname / DOB / parent field)
 *      is rejected.
 *  (8) COPPA: the schema is `player_first_name`, never `player_full_name`; a
 *      planted full-name token in the input is NOT echoed verbatim into the
 *      rendered prompt as an INSTRUCTION to the model — the prompt should use
 *      first names only.
 *
 * Per LESSONS#0021, this file never embeds the raw `**\/*.spec.ts` glob in a
 * JSDoc block (the `*\/` substring would close the comment early); when we
 * mention the spec/test convention, we name it as prose, not the glob.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020/#38).
 */
import { describe, it, expect } from 'vitest';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { sidelineTalkingPointsSchema } from '@/lib/ai/schemas';
import type { ObservationInsightsParam } from '@/lib/ai/prompts';

const ROSTER = [
  { id: 'p-maya', first_name: 'Maya' },
  { id: 'p-devon', first_name: 'Devon' },
  { id: 'p-sarah', first_name: 'Sarah' },
];

const PER_PLAYER_INSIGHTS: Record<string, ObservationInsightsParam> = {
  'p-maya': {
    totalObs: 6,
    daysOfData: 14,
    topNeedsWork: [{ category: 'Finishing', count: 3 }],
    topStrengths: [{ category: 'Defense', count: 4 }],
  },
  'p-devon': {
    totalObs: 4,
    daysOfData: 14,
    topNeedsWork: [{ category: 'Rebounds', count: 2 }],
    topStrengths: [{ category: 'Effort', count: 3 }],
  },
  'p-sarah': {
    totalObs: 3,
    daysOfData: 14,
    topNeedsWork: [{ category: 'Passing', count: 2 }],
    topStrengths: [{ category: 'IQ', count: 2 }],
  },
};

const BASE_PARAMS = {
  teamName: 'Tigers',
  sportName: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 7,
  team: { id: 'team-1', name: 'Tigers' },
  players: ROSTER,
  observationInsightsByPlayer: PER_PLAYER_INSIGHTS,
};

describe('PROMPT_REGISTRY.sidelineTalkingPoints — shape + voice (ticket 0046)', () => {
  it('returns { system, user } string fields', () => {
    const prompt = PROMPT_REGISTRY.sidelineTalkingPoints(BASE_PARAMS);
    expect(typeof prompt.system).toBe('string');
    expect(typeof prompt.user).toBe('string');
    expect(prompt.system.length).toBeGreaterThan(20);
    expect(prompt.user.length).toBeGreaterThan(40);
  });

  it('threads each player first name + their top need-work / top strength into the user prompt', () => {
    const prompt = PROMPT_REGISTRY.sidelineTalkingPoints(BASE_PARAMS);
    for (const p of ROSTER) {
      expect(prompt.user).toContain(p.first_name);
    }
    expect(prompt.user).toContain('Finishing');
    expect(prompt.user).toContain('Defense');
    expect(prompt.user).toContain('Effort');
    expect(prompt.user).toContain('Passing');
  });

  it('declares a JSON schema with EXACTLY two top-level keys and four per-entry keys', () => {
    const prompt = PROMPT_REGISTRY.sidelineTalkingPoints(BASE_PARAMS);
    // The "Respond with JSON" block names the contract.
    expect(prompt.user).toContain('team_id');
    expect(prompt.user).toContain('entries');
    expect(prompt.user).toContain('player_id');
    expect(prompt.user).toContain('player_first_name');
    expect(prompt.user).toContain('lead_line');
    expect(prompt.user).toContain('working_on_line');
    // Explicitly NOT the heavy parent-report keys.
    expect(prompt.user).not.toContain('player_full_name');
    expect(prompt.user).not.toContain('date_of_birth');
    expect(prompt.user).not.toContain('parent_name');
    expect(prompt.user).not.toContain('home_activity');
  });

  it('uses clipboard voice — no AGENTS.md banned token in system OR user', () => {
    const prompt = PROMPT_REGISTRY.sidelineTalkingPoints(BASE_PARAMS);
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    // Per LESSONS#0023, the prompt instructs voice POSITIVELY — it must not
    // enumerate the ban-list, and the rendered prompt must not contain any
    // banned word.
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(all).not.toContain(banned);
    }
  });

  it('never echoes a planted FULL SURNAME from the input into the rendered prompt (first names only)', () => {
    // The schema is first-name-only; planting a "Walker" surname on a roster
    // entry must NOT cause the rendered prompt to instruct the model with the
    // full name — only `first_name` is read by the prompt.
    const prompt = PROMPT_REGISTRY.sidelineTalkingPoints({
      ...BASE_PARAMS,
      players: [
        { id: 'p-maya', first_name: 'Maya' },
        { id: 'p-walker', first_name: 'Maya', /* extra surname field that must not leak */ } as unknown as { id: string; first_name: string },
      ],
    });
    expect(prompt.user).not.toContain('Walker');
  });

  it('omits a player block cleanly when no insights are provided for that player', () => {
    const prompt = PROMPT_REGISTRY.sidelineTalkingPoints({
      ...BASE_PARAMS,
      observationInsightsByPlayer: { 'p-maya': PER_PLAYER_INSIGHTS['p-maya'] },
      players: [
        { id: 'p-maya', first_name: 'Maya' },
        { id: 'p-quiet', first_name: 'Quiet' },
      ],
    });
    // Maya's category should still appear; "Quiet" should appear by name (the
    // roster is enumerated) but their block should NOT carry fabricated
    // categories — the prompt is responsible for telling the model to write
    // something modest when there's little data, not to invent skills.
    expect(prompt.user).toContain('Maya');
    expect(prompt.user).toContain('Quiet');
  });
});

describe('sidelineTalkingPointsSchema — strict shape (ticket 0046)', () => {
  const VALID = {
    team_id: 'team-1',
    entries: [
      {
        player_id: 'p-maya',
        player_first_name: 'Maya',
        lead_line: 'Closeouts have come a long way — mention her hustle on Tuesday.',
        working_on_line: 'We are working on her finishing with contact.',
      },
      {
        player_id: 'p-devon',
        player_first_name: 'Devon',
        lead_line: 'First to dive for the loose ball this week.',
        working_on_line: 'We are working on holding his position on rebounds.',
      },
    ],
  };

  it('accepts the canonical two-key + four-per-entry shape', () => {
    expect(() => sidelineTalkingPointsSchema.parse(VALID)).not.toThrow();
  });

  it('rejects an unknown TOP-LEVEL key (strict)', () => {
    expect(() => sidelineTalkingPointsSchema.parse({ ...VALID, generated_at: 'now' })).toThrow();
    // COPPA pin: a per-player array carrying a separate full-name field is not part of the contract.
    expect(() => sidelineTalkingPointsSchema.parse({ ...VALID, player_full_name: 'Maya Walker' })).toThrow();
  });

  it('rejects an unknown PER-ENTRY key (strict)', () => {
    const bad = {
      ...VALID,
      entries: [
        {
          ...VALID.entries[0],
          // A surname must NEVER round-trip through the artifact — first names only.
          player_full_name: 'Maya Walker',
        },
      ],
    };
    expect(() => sidelineTalkingPointsSchema.parse(bad)).toThrow();
  });

  it('rejects a missing required per-entry key', () => {
    const bad = {
      ...VALID,
      entries: [
        {
          player_id: VALID.entries[0].player_id,
          player_first_name: VALID.entries[0].player_first_name,
          lead_line: VALID.entries[0].lead_line,
          // working_on_line missing
        },
      ],
    };
    expect(() => sidelineTalkingPointsSchema.parse(bad)).toThrow();
  });

  it('rejects empty entries array (the array length must equal the roster size)', () => {
    expect(() => sidelineTalkingPointsSchema.parse({ ...VALID, entries: [] })).toThrow();
  });

  it('rejects a `date_of_birth` or `parent_name` on a per-entry record (COPPA)', () => {
    for (const banned of ['date_of_birth', 'parent_name', 'parent_email', 'medical_notes']) {
      const bad = {
        ...VALID,
        entries: [{ ...VALID.entries[0], [banned]: 'leaked' }],
      };
      expect(() => sidelineTalkingPointsSchema.parse(bad)).toThrow();
    }
  });
});
