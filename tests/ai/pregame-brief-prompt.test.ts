/**
 * Ticket 0040 — `pregameBrief` prompt + schema shape (unit, no AI call).
 *
 * AC mapped here:
 *  (1) PROMPT_REGISTRY.pregameBrief accepts the existing OpponentProfileData shape
 *      + ObservationInsightsParam + optional arcContext + optional coachingSignature
 *      and renders both the scouting fields and the observation insights into the
 *      user prompt.
 *  (2) Voice contract: the rendered system+user prompt does NOT contain any
 *      AGENTS.md banned word, and the voice is instructed POSITIVELY (LESSONS#0023).
 *  (8) The output schema declares EXACTLY four keys
 *      (opponent_read, our_edge, huddle_points, coach_note) and rejects any other
 *      key — including any per-player field (COPPA: no minor data leaks via shape).
 *
 *  Regression: gamedayPrep (the legacy `gamedaySheet`) prompt rendering stays
 *  byte-identical when fed the same inputs — the new prompt is purely additive.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { pregameBriefSchema } from '@/lib/ai/schemas';
import type { OpponentProfileData } from '@/lib/opponent-profile-utils';

const OPPONENT: OpponentProfileData = {
  name: 'Riverside Hawks',
  strengths: ['fast breaks', 'aggressive press defense'],
  weaknesses: ['weak perimeter shooting', 'turnovers under pressure'],
  key_players: ['#23 tall center', '#5 fast point guard'],
  notes: 'They sub a fresh five every four minutes — wear down their starters.',
};

const INSIGHTS = {
  totalObs: 36,
  daysOfData: 28,
  topNeedsWork: [
    { category: 'Spacing', count: 8 },
    { category: 'Defense', count: 5 },
  ],
  topStrengths: [
    { category: 'Effort', count: 12 },
    { category: 'IQ', count: 7 },
  ],
};

const BASE_PARAMS = {
  teamName: 'Tigers',
  sportName: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 7,
  opponent: OPPONENT,
  observationInsights: INSIGHTS,
};

describe('PROMPT_REGISTRY.pregameBrief — shape + voice (ticket 0040)', () => {
  it('returns { system, user } string fields', () => {
    const prompt = PROMPT_REGISTRY.pregameBrief(BASE_PARAMS);
    expect(typeof prompt.system).toBe('string');
    expect(typeof prompt.user).toBe('string');
    expect(prompt.system.length).toBeGreaterThan(20);
    expect(prompt.user.length).toBeGreaterThan(40);
  });

  it('threads the scouting profile fields (name + strengths + weaknesses + key players + notes) into the user prompt', () => {
    const prompt = PROMPT_REGISTRY.pregameBrief(BASE_PARAMS);
    expect(prompt.user).toContain('Riverside Hawks');
    expect(prompt.user).toContain('fast breaks');
    expect(prompt.user).toContain('weak perimeter shooting');
    expect(prompt.user).toContain('#23 tall center');
    expect(prompt.user).toContain('wear down their starters');
  });

  it('threads the observation insights (top needs-work + top strengths) into the user prompt', () => {
    const prompt = PROMPT_REGISTRY.pregameBrief(BASE_PARAMS);
    expect(prompt.user).toContain('Spacing');
    expect(prompt.user).toContain('Defense');
    expect(prompt.user).toContain('Effort');
  });

  it('threads the OPTIONAL arcContext when supplied — and omits it cleanly when absent', () => {
    const withArc = PROMPT_REGISTRY.pregameBrief({
      ...BASE_PARAMS,
      arcContext: {
        arcTitle: 'Defense Arc',
        sessionNumber: 2,
        totalSessions: 3,
        keyCoachingPoint: 'Stay low, approach with control',
      },
    });
    expect(withArc.user).toContain('Defense Arc');
    expect(withArc.user).toContain('Stay low');

    const withoutArc = PROMPT_REGISTRY.pregameBrief(BASE_PARAMS);
    expect(withoutArc.user).not.toContain('Defense Arc');
  });

  it('threads the OPTIONAL coachingSignature when supplied — and omits it cleanly when absent', () => {
    const withSig = PROMPT_REGISTRY.pregameBrief({
      ...BASE_PARAMS,
      coachingSignature: {
        top_skills: ['Defense', 'Spacing'],
        recurring_drills: ['Shell Drill', 'Closeout Drill'],
        typical_session_minutes: 60,
      },
    });
    expect(withSig.user).toContain('Shell Drill');

    const withoutSig = PROMPT_REGISTRY.pregameBrief(BASE_PARAMS);
    expect(withoutSig.user).not.toContain('Shell Drill');
  });

  it('uses clipboard voice — no AGENTS.md banned token in system OR user', () => {
    const prompt = PROMPT_REGISTRY.pregameBrief({
      ...BASE_PARAMS,
      arcContext: {
        arcTitle: 'Defense Arc',
        sessionNumber: 2,
        totalSessions: 3,
        keyCoachingPoint: 'Stay low',
      },
      coachingSignature: {
        top_skills: ['Defense'],
        recurring_drills: ['Shell Drill'],
        typical_session_minutes: 60,
      },
    });
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    // Per LESSONS#0023, the prompt instructs voice POSITIVELY — it must not enumerate
    // the ban-list, and the rendered prompt must not contain any banned word.
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(all).not.toContain(banned);
    }
  });

  it('declares a JSON schema with EXACTLY four keys in the rendered user prompt', () => {
    const prompt = PROMPT_REGISTRY.pregameBrief(BASE_PARAMS);
    // The prompt's "Respond with JSON: {…}" block must name only the four keys.
    expect(prompt.user).toContain('opponent_read');
    expect(prompt.user).toContain('our_edge');
    expect(prompt.user).toContain('huddle_points');
    expect(prompt.user).toContain('coach_note');
    // Explicitly NOT the heavy gamedayPrep keys.
    expect(prompt.user).not.toContain('pregame_message');
    expect(prompt.user).not.toContain('substitution_plan');
    expect(prompt.user).not.toContain('lineup');
  });

  it('does not include any player_name / dob / observation_text fields in the schema (COPPA)', () => {
    const prompt = PROMPT_REGISTRY.pregameBrief(BASE_PARAMS);
    // The brief is about the TEAM and the OPPONENT. The schema must not invite
    // individual minor data into the output.
    expect(prompt.user).not.toContain('player_name');
    expect(prompt.user).not.toContain('date_of_birth');
    expect(prompt.user).not.toContain('parent_name');
  });
});

describe('pregameBriefSchema — strict four-key allow-list', () => {
  const VALID = {
    opponent_read:
      'Riverside leans on a press to force turnovers and breaks fast off the steal. They get tired late and their second unit is a clear notch behind.',
    our_edge:
      'We have spent four weeks on Spacing and on closeouts; both are the exact answer to their press and their fast breaks. Effort has been our calling card.',
    huddle_points: [
      'Beat their press with two short passes before the half line.',
      'Closeouts under control — do not bite on the first pump fake.',
      'When their second five comes in, push the pace.',
    ],
    coach_note: 'Sub aggressively in the third quarter; that is when their starters get tired.',
  };

  it('accepts the canonical four-key shape', () => {
    expect(() => pregameBriefSchema.parse(VALID)).not.toThrow();
  });

  it('rejects an unknown key (e.g. pregame_message, lineup, player_name) — strict', () => {
    expect(() => pregameBriefSchema.parse({ ...VALID, pregame_message: 'extra' })).toThrow();
    expect(() => pregameBriefSchema.parse({ ...VALID, lineup: [] })).toThrow();
    // The COPPA pin: a per-player field is not part of the contract.
    expect(() => pregameBriefSchema.parse({ ...VALID, player_name: 'Alice' })).toThrow();
  });

  it('rejects missing required keys', () => {
    const { opponent_read: _unused, ...missingOpponentRead } = VALID;
    expect(() => pregameBriefSchema.parse(missingOpponentRead)).toThrow();
    void _unused;
  });

  it('rejects huddle_points that are not an array of strings', () => {
    expect(() =>
      pregameBriefSchema.parse({ ...VALID, huddle_points: 'one giant string' }),
    ).toThrow();
    expect(() =>
      pregameBriefSchema.parse({ ...VALID, huddle_points: [{ text: 'wrong shape' }] }),
    ).toThrow();
  });
});

describe('Regression — dormant gamedaySheet prompt stays byte-identical', () => {
  it('gamedaySheet output is unchanged by the addition of pregameBrief', () => {
    // The dormant `gamedaySheet` entry must not be touched by the 0040 work —
    // every field the existing gameday surface relies on must still render.
    const sheet = PROMPT_REGISTRY.gamedaySheet({
      teamName: 'Tigers',
      sportName: 'basketball',
      ageGroup: '11-13',
      seasonWeek: 7,
      opponent: 'Riverside Hawks',
      opponentStrengths: ['fast breaks'],
      opponentWeaknesses: ['weak perimeter shooting'],
      keyOpponentPlayers: ['#23 tall center'],
      gameNotes: 'Sub aggressively',
    });
    expect(sheet.user).toContain('pregame_message');
    expect(sheet.user).toContain('substitution_plan');
    expect(sheet.user).toContain('lineup');
    expect(sheet.user).toContain('Riverside Hawks');
  });
});
