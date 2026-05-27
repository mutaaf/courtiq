/**
 * Ticket 0048 — AI contract proof for the postgameParentTexts prompt.
 *
 * The `postgameParentTexts` prompt must produce structurally-valid JSON
 * across at least Anthropic AND one fallback provider. The test:
 *   - drives the REAL callAIWithJSON() with mocked Anthropic + OpenAI SDKs
 *   - feeds each a valid two-key sheet with three-key per-entry shapes
 *   - asserts the parsed output validates against postgameParentTextsSchema
 *     for BOTH providers
 *   - iterates the entries array and validates each three-key shape + the
 *     220-character cap on `text_message`
 *   - re-asserts the rendered prompt is clipboard-plain (no banned words —
 *     LESSONS#0023) so a future prompt edit cannot silently re-introduce them
 *   - asserts the schema rejects unknown keys (strict allow-list — COPPA)
 *
 * .test.ts NOT .spec.ts (LESSONS#0020/#38).
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
  postgameParentTextsSchema,
  type PostgameParentTexts,
} from '@/lib/ai/schemas';

// ─── Provider success-response shapes ────────────────────────────────────────────
function anthropicSuccess(text: string, tokensIn = 120, tokensOut = 80) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: tokensIn, output_tokens: tokensOut } };
}
function openaiSuccess(text: string, tokensIn = 100, tokensOut = 70) {
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } };
}

const VALID_SHEET: PostgameParentTexts = {
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
    {
      player_id: 'p-sarah',
      player_first_name: 'Sarah',
      text_message: 'Sarah read the floor before she dribbled all game and made two beautiful weak-side passes.',
    },
  ],
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

const prompt = PROMPT_REGISTRY.postgameParentTexts({
  teamName: 'Tigers',
  sportName: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 7,
  team: { id: 'team-1', name: 'Tigers' },
  players: [
    { id: 'p-maya', first_name: 'Maya' },
    { id: 'p-devon', first_name: 'Devon' },
    { id: 'p-sarah', first_name: 'Sarah' },
  ],
  sessionMeta: {
    id: 'sess-1',
    started_at: '2026-05-25T17:00:00Z',
    opponent_name: 'Eagles',
  },
  observationInsightsByPlayer: {
    'p-maya': {
      totalObs: 6, daysOfData: 1,
      topNeedsWork: [{ category: 'Finishing', count: 3 }],
      topStrengths: [{ category: 'Defense', count: 4 }],
    },
    'p-devon': {
      totalObs: 4, daysOfData: 1,
      topNeedsWork: [{ category: 'Rebounds', count: 2 }],
      topStrengths: [{ category: 'Effort', count: 3 }],
    },
    'p-sarah': {
      totalObs: 3, daysOfData: 1,
      topNeedsWork: [{ category: 'Passing', count: 2 }],
      topStrengths: [{ category: 'IQ', count: 2 }],
    },
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

describe('postgameParentTexts prompt — provider-agnostic JSON contract (ticket 0048)', () => {
  it('renders clipboard voice (no banned breathless words)', () => {
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(all).not.toContain(banned);
    }
  });

  it('threads per-player insights into the user prompt (first names + top need-work / top strength)', () => {
    expect(prompt.user).toContain('Maya');
    expect(prompt.user).toContain('Finishing');
    expect(prompt.user).toContain('Defense');
    expect(prompt.user).toContain('Devon');
    expect(prompt.user).toContain('Sarah');
  });

  it('parses against postgameParentTextsSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_SHEET)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAIWithJSON<PostgameParentTexts>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = postgameParentTextsSchema.parse(result.parsed);
    expect(validated.entries.length).toBeGreaterThanOrEqual(1);
    // Iterate each entry and validate the three-key shape + 220-char cap.
    for (const entry of validated.entries) {
      expect(typeof entry.player_id).toBe('string');
      expect(typeof entry.player_first_name).toBe('string');
      expect(typeof entry.text_message).toBe('string');
      expect(entry.text_message.length).toBeGreaterThan(1);
      expect(entry.text_message.length).toBeLessThanOrEqual(220);
    }
  });

  it('parses against postgameParentTextsSchema when served by the OpenAI fallback', async () => {
    // Primary Anthropic 529-overloads → callAIWithJSON fails over to OpenAI,
    // which serves the same two-key shape. The schema is the cross-provider contract.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_SHEET)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } });

    const result = await callAIWithJSON<PostgameParentTexts>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = postgameParentTextsSchema.parse(result.parsed);
    expect(validated.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects any extra TOP-LEVEL key in the served response (strict allow-list)', () => {
    expect(() =>
      postgameParentTextsSchema.parse({ ...VALID_SHEET, generated_at: 'now' }),
    ).toThrow();
    expect(() =>
      postgameParentTextsSchema.parse({ ...VALID_SHEET, player_full_name: 'Maya Walker' }),
    ).toThrow();
  });

  it('rejects any extra PER-ENTRY key (strict allow-list — first names only by construction)', () => {
    const bad = {
      ...VALID_SHEET,
      entries: [{ ...VALID_SHEET.entries[0], player_full_name: 'Maya Walker' }],
    };
    expect(() => postgameParentTextsSchema.parse(bad)).toThrow();
  });
});
