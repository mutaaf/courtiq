/**
 * Ticket 0040 — AI contract proof for the pregame-brief prompt.
 *
 * The `pregameBrief` prompt must produce structurally-valid four-key JSON across
 * at least Anthropic AND one fallback provider (the multi-provider mock strategy
 * from tests/ai/provider-failover.test.ts). The test:
 *   - drives the REAL callAIWithJSON() with mocked Anthropic + OpenAI SDKs
 *   - feeds each a valid four-key brief
 *   - asserts the parsed output validates against pregameBriefSchema for BOTH
 *   - re-asserts the rendered prompt is clipboard-plain (no banned words —
 *     LESSONS#0023) so a future prompt edit cannot silently re-introduce them
 *   - asserts the schema rejects unknown keys (the strict allow-list invariant)
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
import { pregameBriefSchema, type PregameBrief } from '@/lib/ai/schemas';

// ─── Provider success-response shapes ────────────────────────────────────────────
function anthropicSuccess(text: string, tokensIn = 120, tokensOut = 80) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: tokensIn, output_tokens: tokensOut } };
}
function openaiSuccess(text: string, tokensIn = 100, tokensOut = 70) {
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } };
}

const VALID_BRIEF: PregameBrief = {
  opponent_read:
    'Riverside leans on a press to force turnovers and breaks fast off the steal. They get tired late and their second unit is a notch behind.',
  our_edge:
    'We have worked Spacing and closeouts for four weeks; both are the answer to their press. Effort has been our calling card.',
  huddle_points: [
    'Beat the press with two short passes before the half line.',
    'Closeouts under control — do not bite on the first pump fake.',
    'When their second five comes in, push the pace.',
  ],
  coach_note: 'Sub aggressively in the third quarter; that is when their starters get tired.',
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
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { settings: orgSettings, tier: 'pro_coach' }, error: null }) };
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

const prompt = PROMPT_REGISTRY.pregameBrief({
  teamName: 'Tigers',
  sportName: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 7,
  opponent: {
    name: 'Riverside Hawks',
    strengths: ['fast breaks', 'press defense'],
    weaknesses: ['weak perimeter shooting'],
    key_players: ['#23 tall center'],
    notes: 'They sub a fresh five every four minutes.',
  },
  observationInsights: {
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

describe('pregameBrief prompt — provider-agnostic JSON contract (ticket 0040)', () => {
  it('renders clipboard voice (no banned breathless words)', () => {
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(all).not.toContain(banned);
    }
  });

  it('threads the scouting profile + observation insights into the user prompt', () => {
    expect(prompt.user).toContain('Riverside Hawks');
    expect(prompt.user).toContain('press defense');
    expect(prompt.user).toContain('Spacing');
    expect(prompt.user).toContain('Effort');
  });

  it('parses against pregameBriefSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_BRIEF)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAIWithJSON<PregameBrief>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = pregameBriefSchema.parse(result.parsed);
    expect(validated.opponent_read.length).toBeGreaterThan(20);
    expect(validated.huddle_points.length).toBeGreaterThanOrEqual(2);
  });

  it('parses against pregameBriefSchema when served by the OpenAI fallback', async () => {
    // Primary Anthropic 529-overloads → callAIWithJSON fails over to OpenAI,
    // which serves the same four-key shape. The schema is the cross-provider contract.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_BRIEF)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } });

    const result = await callAIWithJSON<PregameBrief>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = pregameBriefSchema.parse(result.parsed);
    expect(validated.our_edge.length).toBeGreaterThan(20);
  });

  it('rejects any extra key in the served response (strict four-key allow-list)', () => {
    expect(() =>
      pregameBriefSchema.parse({ ...VALID_BRIEF, lineup: ['extra'] }),
    ).toThrow();
    expect(() =>
      pregameBriefSchema.parse({ ...VALID_BRIEF, pregame_message: 'extra' }),
    ).toThrow();
  });
});
