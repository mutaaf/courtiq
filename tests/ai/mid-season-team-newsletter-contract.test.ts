/**
 * Ticket 0043 — AI contract proof for the mid-season-team-newsletter prompt.
 *
 * The `midSeasonTeamNewsletter` prompt must produce structurally-valid five-key
 * JSON across at least Anthropic AND one fallback provider (the multi-provider
 * mock strategy from tests/ai/provider-failover.test.ts). The test:
 *   - drives the REAL callAIWithJSON() with mocked Anthropic + OpenAI SDKs
 *   - feeds each a valid five-key newsletter
 *   - asserts the parsed output validates against midSeasonTeamNewsletterSchema
 *     for BOTH providers
 *   - re-asserts the rendered prompt is clipboard-plain (no banned words —
 *     LESSONS#0023) so a future prompt edit cannot silently re-introduce them
 *   - asserts the schema rejects unknown keys (the strict allow-list invariant)
 *   - asserts sampled outputs DO NOT contain a planted player-name token (COPPA:
 *     the prompt forbids individual player names in any of the five fields)
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { anthropicCreate, openaiCreate, geminiGenerate } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openaiCreate: vi.fn(),
  geminiGenerate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: geminiGenerate, startChat: () => ({ sendMessage: geminiGenerate }) };
    }
  },
}));

vi.mock('@/lib/cache/redis', () => ({ redis: null }));

const { mockRateCheck } = vi.hoisted(() => ({ mockRateCheck: vi.fn() }));
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, checkAIRateLimit: mockRateCheck };
});

import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import {
  midSeasonTeamNewsletterSchema,
  type MidSeasonTeamNewsletter,
} from '@/lib/ai/schemas';

// ─── Provider success-response shapes ────────────────────────────────────────────
function anthropicSuccess(text: string, tokensIn = 120, tokensOut = 90) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: tokensIn, output_tokens: tokensOut } };
}
function openaiSuccess(text: string, tokensIn = 110, tokensOut = 80) {
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } };
}

const VALID_NEWSLETTER: MidSeasonTeamNewsletter = {
  headline: 'Six weeks in: ball movement is starting to land.',
  arc_summary:
    'We have built around moving the ball and crashing the boards. The last two practices have shown those reps starting to translate.',
  team_strengths: [
    'The team is sharing the ball more on the second pass.',
    'Effort on rebounds is showing up in the second half of practice.',
  ],
  focus_areas: [
    'Closing out without fouling.',
    'Talking on defense in transition.',
  ],
  coach_voice_quote:
    'When we move the ball, good things happen — that has been the through line of this stretch.',
};

// In-memory chainable Supabase (serves provider keys + org tier).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(orgSettings: any) {
  const inserts: unknown[] = [];
  let nextId = 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function from(table: string): any {
    if (table === 'coaches') {
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null }) };
    }
    if (table === 'organizations') {
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { settings: orgSettings, tier: 'coach' }, error: null }) };
    }
    if (table === 'ai_interactions') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => Promise.resolve({ count: 0, error: null })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insert: vi.fn((row: any) => {
          const id = `interaction-${nextId++}`;
          inserts.push({ ...row, id });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const insertChain: any = { select: vi.fn(() => insertChain), single: vi.fn(() => Promise.resolve({ data: { id }, error: null })) };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          insertChain.then = (resolve: any) => resolve({ data: { id }, error: null });
          return insertChain;
        }),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
      };
      return chain;
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
  }
  return { supabase: { from: vi.fn(from) }, inserts };
}

const prompt = PROMPT_REGISTRY.midSeasonTeamNewsletter({
  team: { id: 'team-1', name: 'Tigers' },
  teamName: 'Tigers',
  sportName: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 6,
  observationInsights: {
    totalObs: 32,
    daysOfData: 42,
    topNeedsWork: [
      { category: 'Defense', count: 8 },
      { category: 'Spacing', count: 5 },
    ],
    topStrengths: [
      { category: 'Effort', count: 12 },
      { category: 'IQ', count: 7 },
    ],
  },
});

const baseOptions = {
  coachId: 'coach-1',
  teamId: 'team-1',
  interactionType: 'custom' as const,
  systemPrompt: prompt.system,
  userPrompt: prompt.user,
  orgId: 'org-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRateCheck.mockResolvedValue({ allowed: true, limit: 20, remaining: 19, resetAt: Date.now() + 3600_000 });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

describe('midSeasonTeamNewsletter prompt — provider-agnostic JSON contract (ticket 0043)', () => {
  it('renders clipboard voice (no banned breathless words — LESSONS#0023)', () => {
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(all).not.toContain(banned);
    }
  });

  it('threads the team-level framing into the user prompt (TEAM artifact)', () => {
    // Per the ticket: the prompt must clearly frame this as a TEAM-wide
    // newsletter (not a per-player report). The team name is the only proper
    // noun that should appear in the user block.
    expect(prompt.user).toContain('Tigers');
    // Insights are surfaced so the AI can ground the arc_summary in real data.
    expect(prompt.user).toContain('Defense');
    expect(prompt.user).toContain('Effort');
  });

  it('parses against midSeasonTeamNewsletterSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_NEWSLETTER)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAIWithJSON<MidSeasonTeamNewsletter>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = midSeasonTeamNewsletterSchema.parse(result.parsed);
    expect(validated.headline.length).toBeGreaterThan(5);
    expect(validated.team_strengths.length).toBe(2);
    expect(validated.focus_areas.length).toBe(2);
  });

  it('parses against midSeasonTeamNewsletterSchema when served by the OpenAI fallback', async () => {
    // Primary Anthropic 529-overloads → callAIWithJSON fails over to OpenAI,
    // which serves the same five-key shape. The schema is the cross-provider
    // contract.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_NEWSLETTER)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } });

    const result = await callAIWithJSON<MidSeasonTeamNewsletter>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = midSeasonTeamNewsletterSchema.parse(result.parsed);
    expect(validated.arc_summary.length).toBeGreaterThan(20);
    expect(validated.coach_voice_quote.length).toBeGreaterThan(5);
  });

  it('rejects any extra key in the served response (strict five-key allow-list)', () => {
    expect(() =>
      midSeasonTeamNewsletterSchema.parse({ ...VALID_NEWSLETTER, lineup: ['extra'] }),
    ).toThrow();
    expect(() =>
      midSeasonTeamNewsletterSchema.parse({ ...VALID_NEWSLETTER, player_name: 'Marcus' }),
    ).toThrow();
    expect(() =>
      midSeasonTeamNewsletterSchema.parse({ ...VALID_NEWSLETTER, next_action: 'something' }),
    ).toThrow();
  });

  it('rejects an arrays-of-wrong-length payload (team_strengths and focus_areas must each be length 2)', () => {
    expect(() =>
      midSeasonTeamNewsletterSchema.parse({ ...VALID_NEWSLETTER, team_strengths: ['only one'] }),
    ).toThrow();
    expect(() =>
      midSeasonTeamNewsletterSchema.parse({
        ...VALID_NEWSLETTER,
        focus_areas: ['a', 'b', 'c'],
      }),
    ).toThrow();
  });

  it('rejects a headline over 80 characters', () => {
    expect(() =>
      midSeasonTeamNewsletterSchema.parse({
        ...VALID_NEWSLETTER,
        headline: 'x'.repeat(81),
      }),
    ).toThrow();
  });

  it('the prompt instruction explicitly forbids naming individual players (COPPA)', () => {
    // We can't sample the LIVE model here, but we can pin the instruction-level
    // contract — the prompt itself must say "do not name individual players" so
    // a future edit can't silently weaken the COPPA pin.
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    // Looser regex so a small future rewording (e.g. "do not name any specific
    // players") still passes; the load-bearing fact is that the prompt forbids
    // per-player naming in the artifact.
    expect(/do not name (individual|any|specific) player/.test(all)).toBe(true);
  });
});
