/**
 * Ticket 0059 — AI contract proof for the playerHandoffCard prompt.
 *
 * The prompt must:
 *   - render with clipboard voice (no AGENTS.md banned words in
 *     `${system}\n${user}` — instruct positively per LESSONS#0023; never
 *     enumerate the banned tokens)
 *   - receive EXACTLY the eight named structured inputs (no observation
 *     raw text with embedded PII, no parent contact, no DOB)
 *   - parse against playerHandoffCardSchema when served by Anthropic AND
 *     when served by the OpenAI fallback
 *   - reject any extra key in the served response (strict one-key allow-list)
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
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
      return {
        generateContent: geminiGenerate,
        startChat: () => ({ sendMessage: geminiGenerate }),
      };
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
import { playerHandoffCardSchema, type PlayerHandoffCard } from '@/lib/ai/schemas';

function anthropicSuccess(text: string, tokensIn = 100, tokensOut = 50) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}
function openaiSuccess(text: string, tokensIn = 90, tokensOut = 45) {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut },
  };
}

const VALID_CARD: PlayerHandoffCard = {
  card_body:
    "Eli responds well to short, specific cues during shooting drills. One drill that landed for me: stationary form-shoot with the cue 'guide hand off early.' He's still working on left-hand finishing — worth a few minutes early in the season.",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(orgSettings: any) {
  const inserts: unknown[] = [];
  let nextId = 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function from(table: string): any {
    if (table === 'coaches') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null }),
      };
    }
    if (table === 'organizations') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: { settings: orgSettings, tier: 'coach' }, error: null }),
      };
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
          const insertChain: any = {
            select: vi.fn(() => insertChain),
            single: vi.fn(() => Promise.resolve({ data: { id }, error: null })),
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          insertChain.then = (resolve: any) => resolve({ data: { id }, error: null });
          return insertChain;
        }),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
      };
      return chain;
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }
  return { supabase: { from: vi.fn(from) }, inserts };
}

const prompt = PROMPT_REGISTRY.playerHandoffCard({
  playerFirstName: 'Eli',
  ageGroup: '10-and-under',
  sportName: 'basketball',
  topStrengths: ['Effort', 'IQ'],
  topGrowthArea: 'Left-hand finishing',
  signatureDrillNames: ['stationary form-shoot', 'two-line layups'],
  coachAuthoredHighlights: [
    'Held the cue on guide hand for three reps in a row',
    'Talks teammates through closeouts',
  ],
  seasonLabel: '2025 fall season',
});

const baseOptions = {
  coachId: 'coach-1',
  teamId: 'team-1',
  interactionType: 'generate_player_handoff_card' as const,
  systemPrompt: prompt.system,
  userPrompt: prompt.user,
  orgId: 'org-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRateCheck.mockResolvedValue({
    allowed: true,
    limit: 20,
    remaining: 19,
    resetAt: Date.now() + 3600_000,
  });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

describe('playerHandoffCard prompt — voice + provider-agnostic JSON contract (ticket 0059)', () => {
  it('renders clipboard voice (no AGENTS.md banned words in system+user)', () => {
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    for (const banned of [
      'journey',
      'amazing',
      'exciting',
      'elevate',
      'empower',
      'synergy',
      'unlock your potential',
    ]) {
      expect(all).not.toContain(banned);
    }
  });

  it('threads the eight named structured inputs into the user prompt', () => {
    // The eight named keys must appear (as values) in the user payload. The
    // prompt module is the only place this contract lives — every consumer
    // route passes through these eight inputs only.
    expect(prompt.user).toContain('Eli');
    expect(prompt.user).toContain('10-and-under');
    expect(prompt.user).toContain('basketball');
    expect(prompt.user).toContain('2025 fall season');
    expect(prompt.user).toContain('Effort');
    expect(prompt.user).toContain('Left-hand finishing');
    expect(prompt.user).toContain('stationary form-shoot');
    expect(prompt.user).toContain('Held the cue on guide hand');
  });

  it('does NOT leak a parent contact / DOB / address shape (defensive scan)', () => {
    const all = `${prompt.system}\n${prompt.user}`;
    expect(all).not.toMatch(/@\S+\.\S+/); // no email-shaped substring
    expect(all).not.toMatch(/\b\d{7,}\b/); // no long digit-run (phone)
    expect(all).not.toMatch(/\bdob\b/i);
    expect(all).not.toMatch(/\bdate\s+of\s+birth\b/i);
  });

  it('parses against playerHandoffCardSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_CARD)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAIWithJSON<PlayerHandoffCard>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = playerHandoffCardSchema.parse(result.parsed);
    expect(validated.card_body.length).toBeGreaterThan(20);
  });

  it('parses against playerHandoffCardSchema when served by the OpenAI fallback', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_CARD)));
    const { supabase } = makeSupabase({
      ai_provider: 'anthropic',
      ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' },
    });

    const result = await callAIWithJSON<PlayerHandoffCard>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = playerHandoffCardSchema.parse(result.parsed);
    expect(validated.card_body.length).toBeGreaterThan(20);
  });

  it('rejects any extra key in the served response (strict one-key allow-list)', () => {
    expect(() =>
      playerHandoffCardSchema.parse({ ...VALID_CARD, extra_field: 'nope' }),
    ).toThrow();
  });

  it('rejects an empty card_body (zod min(1) guards the contract)', () => {
    expect(() => playerHandoffCardSchema.parse({ card_body: '' })).toThrow();
  });
});
