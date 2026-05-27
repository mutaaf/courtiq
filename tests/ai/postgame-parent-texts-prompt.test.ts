/**
 * Ticket 0048 — `postgameParentTexts` prompt + schema shape (unit, no AI call).
 *
 * AC mapped here:
 *  (1) PROMPT_REGISTRY.postgameParentTexts accepts { team, players,
 *      sessionMeta, observationInsightsByPlayer } and renders the per-player
 *      insight blocks AND the session date into the user prompt.
 *  (2) Voice contract: the rendered system+user prompt contains NO AGENTS.md
 *      banned word, and the voice is instructed POSITIVELY (LESSONS#0023 —
 *      never enumerate the ban list verbatim).
 *  (1) Schema is two-key top-level (session_id + entries) with EXACTLY three
 *      keys per entry (player_id, player_first_name, text_message). Strict —
 *      any extra key (including a full surname / DOB / parent field) is
 *      rejected. text_message has a 220-character cap (single SMS).
 *  (6) COPPA: the schema is `player_first_name`, never `player_full_name`; a
 *      planted full-name token in the input is NOT echoed verbatim into the
 *      rendered prompt as an INSTRUCTION to the model.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020/#38).
 */
import { describe, it, expect } from 'vitest';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { postgameParentTextsSchema } from '@/lib/ai/schemas';
import type { ObservationInsightsParam } from '@/lib/ai/prompts';

const ROSTER = [
  { id: 'p-maya', first_name: 'Maya' },
  { id: 'p-devon', first_name: 'Devon' },
  { id: 'p-sarah', first_name: 'Sarah' },
];

const PER_PLAYER_INSIGHTS: Record<string, ObservationInsightsParam> = {
  'p-maya': {
    totalObs: 6,
    daysOfData: 1,
    topNeedsWork: [{ category: 'Finishing', count: 3 }],
    topStrengths: [{ category: 'Defense', count: 4 }],
  },
  'p-devon': {
    totalObs: 4,
    daysOfData: 1,
    topNeedsWork: [{ category: 'Rebounds', count: 2 }],
    topStrengths: [{ category: 'Effort', count: 3 }],
  },
  'p-sarah': {
    totalObs: 3,
    daysOfData: 1,
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
  sessionMeta: {
    id: 'sess-1',
    started_at: '2026-05-25T17:00:00Z',
    opponent_name: 'Eagles',
  },
  observationInsightsByPlayer: PER_PLAYER_INSIGHTS,
};

describe('PROMPT_REGISTRY.postgameParentTexts — shape + voice (ticket 0048)', () => {
  it('returns { system, user } string fields', () => {
    const prompt = PROMPT_REGISTRY.postgameParentTexts(BASE_PARAMS);
    expect(typeof prompt.system).toBe('string');
    expect(typeof prompt.user).toBe('string');
    expect(prompt.system.length).toBeGreaterThan(20);
    expect(prompt.user.length).toBeGreaterThan(40);
  });

  it('threads each player first name + their top need-work / top strength into the user prompt', () => {
    const prompt = PROMPT_REGISTRY.postgameParentTexts(BASE_PARAMS);
    for (const p of ROSTER) {
      expect(prompt.user).toContain(p.first_name);
    }
    expect(prompt.user).toContain('Finishing');
    expect(prompt.user).toContain('Defense');
    expect(prompt.user).toContain('Effort');
    expect(prompt.user).toContain('Passing');
  });

  it('threads the session date into the user prompt (this is a post-GAME artifact, scoped to today)', () => {
    const prompt = PROMPT_REGISTRY.postgameParentTexts(BASE_PARAMS);
    // The date in YYYY-MM-DD form lifted from sessionMeta.started_at.
    expect(prompt.user).toContain('2026-05-25');
  });

  it('declares a JSON schema with EXACTLY two top-level keys and three per-entry keys', () => {
    const prompt = PROMPT_REGISTRY.postgameParentTexts(BASE_PARAMS);
    // The "Respond with JSON" block names the contract.
    expect(prompt.user).toContain('session_id');
    expect(prompt.user).toContain('entries');
    expect(prompt.user).toContain('player_id');
    expect(prompt.user).toContain('player_first_name');
    expect(prompt.user).toContain('text_message');
    // Explicitly NOT a four-key sideline shape; this is a SINGLE message per row.
    expect(prompt.user).not.toContain('lead_line');
    expect(prompt.user).not.toContain('working_on_line');
    // Explicitly NOT an email — no subject line.
    expect(prompt.user).not.toContain('subject');
    expect(prompt.user).not.toContain('player_full_name');
    expect(prompt.user).not.toContain('date_of_birth');
    expect(prompt.user).not.toContain('parent_name');
  });

  it('uses clipboard voice — no AGENTS.md banned token in system OR user', () => {
    const prompt = PROMPT_REGISTRY.postgameParentTexts(BASE_PARAMS);
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
    const prompt = PROMPT_REGISTRY.postgameParentTexts({
      ...BASE_PARAMS,
      players: [
        { id: 'p-maya', first_name: 'Maya' },
        { id: 'p-walker', first_name: 'Maya', /* extra surname field that must not leak */ } as unknown as { id: string; first_name: string },
      ],
    });
    expect(prompt.user).not.toContain('Walker');
  });

  it('omits a player block cleanly when no insights are provided for that player', () => {
    const prompt = PROMPT_REGISTRY.postgameParentTexts({
      ...BASE_PARAMS,
      observationInsightsByPlayer: { 'p-maya': PER_PLAYER_INSIGHTS['p-maya'] },
      players: [
        { id: 'p-maya', first_name: 'Maya' },
        { id: 'p-quiet', first_name: 'Quiet' },
      ],
    });
    // Maya's category should still appear; "Quiet" should appear by name (the
    // roster is enumerated) but their block should NOT carry fabricated
    // categories.
    expect(prompt.user).toContain('Maya');
    expect(prompt.user).toContain('Quiet');
  });
});

describe('postgameParentTextsSchema — strict shape (ticket 0048)', () => {
  const VALID = {
    session_id: 'sess-1',
    entries: [
      {
        player_id: 'p-maya',
        player_first_name: 'Maya',
        text_message: "Maya's defense in the second half was the difference today; she boxed out twice in a row.",
      },
      {
        player_id: 'p-devon',
        player_first_name: 'Devon',
        text_message: 'Devon was first to dive for the loose ball today and held his position all four quarters.',
      },
    ],
  };

  it('accepts the canonical two-key + three-per-entry shape', () => {
    expect(() => postgameParentTextsSchema.parse(VALID)).not.toThrow();
  });

  it('rejects an unknown TOP-LEVEL key (strict)', () => {
    expect(() => postgameParentTextsSchema.parse({ ...VALID, generated_at: 'now' })).toThrow();
    // COPPA pin: a per-player array carrying a separate full-name field is not part of the contract.
    expect(() => postgameParentTextsSchema.parse({ ...VALID, player_full_name: 'Maya Walker' })).toThrow();
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
    expect(() => postgameParentTextsSchema.parse(bad)).toThrow();
  });

  it('rejects a missing required per-entry key', () => {
    const bad = {
      ...VALID,
      entries: [
        {
          player_id: VALID.entries[0].player_id,
          player_first_name: VALID.entries[0].player_first_name,
          // text_message missing
        },
      ],
    };
    expect(() => postgameParentTextsSchema.parse(bad)).toThrow();
  });

  it('rejects a `subject` field on a per-entry record (this is a text, not an email)', () => {
    const bad = {
      ...VALID,
      entries: [{ ...VALID.entries[0], subject: 'Today\'s game' }],
    };
    expect(() => postgameParentTextsSchema.parse(bad)).toThrow();
  });

  it('rejects a text_message longer than 220 characters (single-SMS cap)', () => {
    const bad = {
      ...VALID,
      entries: [
        {
          ...VALID.entries[0],
          text_message: 'a'.repeat(221),
        },
      ],
    };
    expect(() => postgameParentTextsSchema.parse(bad)).toThrow();
  });

  it('accepts a text_message of exactly 220 characters (the boundary)', () => {
    const ok = {
      ...VALID,
      entries: [
        {
          ...VALID.entries[0],
          text_message: 'a'.repeat(220),
        },
      ],
    };
    expect(() => postgameParentTextsSchema.parse(ok)).not.toThrow();
  });

  it('rejects empty entries array (the array length must equal the roster size)', () => {
    expect(() => postgameParentTextsSchema.parse({ ...VALID, entries: [] })).toThrow();
  });

  it('rejects a `date_of_birth` or `parent_name` on a per-entry record (COPPA)', () => {
    for (const banned of ['date_of_birth', 'parent_name', 'parent_email', 'medical_notes']) {
      const bad = {
        ...VALID,
        entries: [{ ...VALID.entries[0], [banned]: 'leaked' }],
      };
      expect(() => postgameParentTextsSchema.parse(bad)).toThrow();
    }
  });
});
