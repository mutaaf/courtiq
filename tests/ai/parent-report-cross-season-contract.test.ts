/**
 * Ticket 0034 — AI contract proof for the cross-season parent-report note.
 *
 * The cross-season `since_last_season` note must NOT be Anthropic-specific: the
 * `parentReport` prompt, when given a `priorSeasonReport`, has to produce
 * structurally-valid report JSON (including the new `since_last_season` field)
 * that parses against `parentReportSchema` regardless of which provider serves
 * it. This suite drives the REAL callAIWithJSON() through mocked Anthropic AND
 * OpenAI SDKs (the multi-provider mock strategy from
 * tests/ai/provider-failover.test.ts), feeding each provider a response built
 * from the actual `PROMPT_REGISTRY.parentReport` instruction, and asserts the
 * parsed output validates against the shared schema for BOTH providers.
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
import { parentReportSchema, type ParentReport } from '@/lib/ai/schemas';

// ─── Provider success-response shapes ────────────────────────────────────────────
function anthropicSuccess(text: string, tokensIn = 120, tokensOut = 80) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: tokensIn, output_tokens: tokensOut } };
}
function openaiSuccess(text: string, tokensIn = 100, tokensOut = 70) {
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } };
}

// A well-formed parent report WITH a cross-season note the model would emit for
// the cross-season parentReport prompt.
const VALID_REPORT: ParentReport = {
  player_name: 'Maya Johnson',
  greeting: 'Maya had a strong month!',
  highlights: ['Leads closeouts now', 'Communicates on defense'],
  skill_progress: [
    { skill_name: 'Defense', level: 'Got It!', narrative: 'Closeouts are a real strength now.' },
  ],
  encouragement: 'Keep showing up — it is paying off.',
  coach_note: 'Ready for a bigger leadership role next month.',
  since_last_season: "Since last season, Maya's closeouts have gone from hesitant to a strength.",
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

const prompt = PROMPT_REGISTRY.parentReport({
  teamName: 'Tigers',
  sportSlug: 'basketball',
  ageGroup: '11-13',
  playerName: 'Maya Johnson',
  reportData: {
    observations: [{ category: 'Defense', sentiment: 'positive', text: 'Led closeouts all practice' }],
    proficiency: [{ skill_id: 'defense', proficiency_level: 'proficient', trend: 'improving' }],
    seasonWeek: 5,
  },
  priorSeasonReport: {
    highlights: ['Hesitated on closeouts but kept trying'],
    skill_progress: [{ skill_name: 'Defense', level: 'Practicing', narrative: 'Closeouts were tentative.' }],
    coach_note: 'Closeouts are the growth edge for next season.',
  },
});

const baseOptions = {
  coachId: 'coach-1',
  interactionType: 'generate_parent_report' as const,
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

describe('parentReport cross-season prompt — provider-agnostic JSON contract (ticket 0034)', () => {
  it('builds a prompt with a cross-season block instructing the since_last_season note', () => {
    expect(prompt.user).toContain('last season');
    expect(prompt.user).toContain('since_last_season');
    // The prior-season narrative is threaded in for grounding.
    expect(prompt.user).toContain('Closeouts are the growth edge for next season.');
  });

  it('uses clipboard voice (no banned breathless words) even with the cross-season block', () => {
    // Phrased POSITIVELY so the prompt does not trip on its own ban-list
    // (LESSONS.md 2026-05-23).
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(all).not.toContain(banned);
    }
  });

  it('parses against parentReportSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_REPORT)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAIWithJSON<ParentReport>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = parentReportSchema.parse(result.parsed);
    expect(typeof validated.since_last_season).toBe('string');
    expect(validated.since_last_season).toContain('last season');
  });

  it('parses against parentReportSchema when served by a fallback provider (OpenAI)', async () => {
    // Primary anthropic 529-overloads → client fails over to OpenAI, which serves
    // the same JSON shape. The schema is the cross-provider contract.
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_REPORT)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } });

    const result = await callAIWithJSON<ParentReport>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = parentReportSchema.parse(result.parsed);
    expect(typeof validated.since_last_season).toBe('string');
    expect(validated.player_name).toBe('Maya Johnson');
  });

  it('still validates when the model omits since_last_season (optional field)', () => {
    const { since_last_season: _omit, ...withoutCrossSeason } = VALID_REPORT;
    void _omit;
    expect(() => parentReportSchema.parse(withoutCrossSeason)).not.toThrow();
  });
});
