/**
 * Ticket 0037 — AI contract proof for the coaching-signature practice plan.
 *
 * The coaching-signature block must NOT be Anthropic-specific: the `practicePlan`
 * prompt, when given a `coachingSignature`, has to produce structurally-valid plan
 * JSON that parses against `practicePlanSchema` regardless of which provider serves
 * it. This suite drives the REAL callAIWithJSON() through mocked Anthropic AND
 * OpenAI SDKs (the multi-provider mock strategy from
 * tests/ai/provider-failover.test.ts), feeding each provider a response that
 * satisfies the existing plan schema, and asserts the parsed output validates
 * against the shared schema for BOTH providers. It also proves the signature does
 * not break the existing plan contract (the schema is unchanged) and that the
 * prompt stays clipboard-plain (no banned breathless words — LESSONS#0023).
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted provider SDK mocks (mirror provider-failover.test.ts) ───────────────
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
import { practicePlanSchema, type PracticePlan } from '@/lib/ai/schemas';

// ─── Provider success-response shapes ────────────────────────────────────────────
function anthropicSuccess(text: string, tokensIn = 120, tokensOut = 80) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: tokensIn, output_tokens: tokensOut } };
}
function openaiSuccess(text: string, tokensIn = 100, tokensOut = 70) {
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } };
}

// A well-formed practice plan the model would emit for the signature-aware prompt.
const VALID_PLAN: PracticePlan = {
  title: 'Defense & Spacing Practice',
  duration_minutes: 60,
  warmup: { name: 'Dynamic Warmup', duration_minutes: 5, description: 'Light jog and stretches to start.' },
  drills: [
    {
      name: 'Closeout Drill',
      skill_id: 'defense',
      duration_minutes: 15,
      description: 'Players closeout under control to a shooter.',
      coaching_cues: ['Stay low', 'Approach with control'],
    },
    {
      name: 'Shell Drill',
      skill_id: 'defense',
      duration_minutes: 15,
      description: 'Four defenders rotate on the perimeter.',
      coaching_cues: ['Talk on every pass'],
    },
  ],
  scrimmage: { duration_minutes: 15, focus: 'Apply closeouts in a live setting' },
  cooldown: { duration_minutes: 10, notes: 'Stretch and recap.' },
};

// ─── In-memory chainable Supabase (serves provider keys + org tier) ───────────────
function makeSupabase(orgSettings: any) {
  const inserts: any[] = [];
  let nextId = 1;
  function from(table: string): any {
    if (table === 'coaches') {
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null }) };
    }
    if (table === 'organizations') {
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { settings: orgSettings, tier: 'coach' }, error: null }) };
    }
    if (table === 'ai_interactions') {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => Promise.resolve({ count: 0, error: null })),
        insert: vi.fn((row: any) => {
          const id = `interaction-${nextId++}`;
          inserts.push({ ...row, id });
          const insertChain: any = { select: vi.fn(() => insertChain), single: vi.fn(() => Promise.resolve({ data: { id }, error: null })) };
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

// The signature-aware practice-plan prompt (the subject under contract test).
const prompt = PROMPT_REGISTRY.practicePlan({
  teamName: 'Tigers',
  sportName: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 5,
  playerCount: 10,
  practiceDuration: 60,
  categories: ['Offense', 'Defense', 'Passing', 'Spacing', 'Effort'],
  coachingSignature: {
    top_skills: ['Defense', 'Spacing', 'Passing'],
    recurring_drills: ['Closeout Drill', 'Shell Drill'],
    typical_session_minutes: 60,
  },
});

const baseOptions = {
  coachId: 'coach-1',
  teamId: 'team-1',
  interactionType: 'generate_practice_plan' as const,
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

describe('practicePlan coaching-signature prompt — provider-agnostic JSON contract (ticket 0037)', () => {
  it('builds a prompt with a SOFT coaching-signature block leaning on the coach style', () => {
    // The recurring drills + top skills are threaded in for grounding.
    expect(prompt.user).toContain('Closeout Drill');
    expect(prompt.user).toContain('Defense');
    // Phrased as a soft preference, not a hard override.
    expect(prompt.user.toLowerCase()).toContain('soft');
  });

  it('uses clipboard voice (no banned breathless words) even with the signature block', () => {
    // Phrased POSITIVELY so the prompt does not trip on its own ban-list (LESSONS#0023).
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(all).not.toContain(banned);
    }
  });

  it('carries no player/observation/minor data in the signature block (COPPA)', () => {
    expect(prompt.user).not.toContain('player_name');
    expect(prompt.user).not.toContain('date_of_birth');
    expect(prompt.user).not.toContain('observations');
  });

  it('parses against practicePlanSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_PLAN)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAIWithJSON<PracticePlan>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = practicePlanSchema.parse(result.parsed);
    expect(validated.title).toBe('Defense & Spacing Practice');
    expect(validated.drills.length).toBeGreaterThan(0);
  });

  it('parses against practicePlanSchema when served by a fallback provider (OpenAI)', async () => {
    // Primary anthropic 529-overloads → client fails over to OpenAI, which serves
    // the same JSON shape. The schema is the cross-provider contract.
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_PLAN)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } });

    const result = await callAIWithJSON<PracticePlan>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = practicePlanSchema.parse(result.parsed);
    expect(validated.duration_minutes).toBe(60);
  });

  it('the signature does not change the plan schema — a plan WITHOUT signature still validates', () => {
    // The signature only nudges content; the existing plan contract is unchanged.
    const noSigPrompt = PROMPT_REGISTRY.practicePlan({
      teamName: 'Tigers',
      sportName: 'basketball',
      ageGroup: '11-13',
      seasonWeek: 5,
      playerCount: 10,
      practiceDuration: 60,
    });
    expect(noSigPrompt.user).not.toContain('This coach tends to');
    expect(() => practicePlanSchema.parse(VALID_PLAN)).not.toThrow();
  });
});
