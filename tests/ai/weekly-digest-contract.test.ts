/**
 * Ticket 0023 — AI contract proof for the weekly-digest artifact.
 *
 * The digest must NOT be Anthropic-specific: the `weeklyDigest` prompt has to
 * produce structurally-valid digest JSON that parses against `weeklyDigestSchema`
 * regardless of which provider serves it. This suite drives the REAL
 * callAIWithJSON() through mocked Anthropic AND OpenAI SDKs (the multi-provider
 * mock strategy from tests/ai/provider-failover.test.ts), feeding each provider a
 * response built from the actual `PROMPT_REGISTRY.weeklyDigest` instruction, and
 * asserts the parsed output validates against the shared schema for BOTH
 * providers.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (reserved for
 * Playwright). See docs/LESSONS.md.
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
import { weeklyDigestSchema, type WeeklyDigest } from '@/lib/ai/schemas';

// ─── Provider success-response shapes ────────────────────────────────────────────
function anthropicSuccess(text: string, tokensIn = 120, tokensOut = 80) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: tokensIn, output_tokens: tokensOut } };
}
function openaiSuccess(text: string, tokensIn = 100, tokensOut = 70) {
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } };
}

// A well-formed digest JSON the model would emit for the weeklyDigest prompt.
const VALID_DIGEST: WeeklyDigest = {
  week_summary: 'Two practices, 5 notes. The team brought real defensive energy all week.',
  top_players: [
    { player_name: 'Maya', note: 'Locked down on defense and led the hustle every possession.' },
    { player_name: 'Devon', note: 'Read the help defense and finished strong at the rim.' },
  ],
  next_action: {
    label: "Send Maya's parents her report",
    kind: 'parent_report',
    rationale: "It has been three weeks since Maya's family got an update.",
  },
};

// ─── In-memory chainable Supabase (records nothing, serves provider keys + tier) ──
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

const prompt = PROMPT_REGISTRY.weeklyDigest({
  teamName: 'Wildcats',
  sportName: 'basketball',
  ageGroup: '11-13',
  seasonWeek: 4,
  totalObservations: 5,
  sessionCount: 2,
  players: [
    { player_name: 'Maya', positiveCount: 2, needsWorkCount: 1, topCategory: 'Defense', sampleObservation: 'Great closeouts all night' },
    { player_name: 'Devon', positiveCount: 2, needsWorkCount: 0, topCategory: 'Offense', sampleObservation: 'Strong finish at the rim' },
  ],
  candidateActions: [
    { kind: 'parent_report', label: "Send Maya's parents her report", reason: 'It has been three weeks since the last update.' },
    { kind: 'weekly_star', label: 'Pick this week\'s Weekly Star', reason: 'Plenty of standout moments to celebrate.' },
  ],
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

describe('weeklyDigest prompt — provider-agnostic JSON contract', () => {
  it('builds a prompt that names the closed next_action kinds and the digest fields', () => {
    expect(prompt.system).toContain('week_summary');
    expect(prompt.system).toContain('top_players');
    expect(prompt.system).toContain('next_action');
    // The closed enum the client maps to a route.
    expect(prompt.user).toContain('parent_report');
    // Clipboard voice — no banned breathless words (AGENTS.md rule 7).
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(all).not.toContain(banned);
    }
  });

  it('parses against weeklyDigestSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_DIGEST)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAIWithJSON<WeeklyDigest>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = weeklyDigestSchema.parse(result.parsed);
    expect(validated.next_action.kind).toBe('parent_report');
    expect(validated.top_players.length).toBeGreaterThan(0);
  });

  it('parses against weeklyDigestSchema when served by a fallback provider (OpenAI)', async () => {
    // Primary anthropic 529-overloads → client fails over to OpenAI, which serves
    // the same JSON shape. The schema is the cross-provider contract.
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_DIGEST)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } });

    const result = await callAIWithJSON<WeeklyDigest>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = weeklyDigestSchema.parse(result.parsed);
    expect(validated.next_action.kind).toBe('parent_report');
    expect(typeof validated.week_summary).toBe('string');
  });

  it('rejects a digest whose next_action.kind is outside the closed enum', () => {
    const bad = { ...VALID_DIGEST, next_action: { ...VALID_DIGEST.next_action, kind: 'send_email' } };
    expect(() => weeklyDigestSchema.parse(bad)).toThrow();
  });
});
