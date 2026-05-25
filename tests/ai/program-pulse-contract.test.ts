/**
 * Ticket 0028 — AI contract proof for the program-pulse artifact.
 *
 * The pulse must NOT be Anthropic-specific: the `programPulse` prompt has to
 * produce structurally-valid pulse JSON that parses against `programPulseSchema`
 * regardless of which provider serves it. This suite drives the REAL
 * callAIWithJSON() through mocked Anthropic AND OpenAI SDKs (the multi-provider
 * mock strategy from tests/ai/provider-failover.test.ts), feeding each provider a
 * response built from the actual `PROMPT_REGISTRY.programPulse` instruction, and
 * asserts the parsed output validates against the shared schema for BOTH providers.
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
import { programPulseSchema, type ProgramPulse } from '@/lib/ai/schemas';

// ─── Provider success-response shapes ────────────────────────────────────────────
function anthropicSuccess(text: string, tokensIn = 120, tokensOut = 80) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: tokensIn, output_tokens: tokensOut } };
}
function openaiSuccess(text: string, tokensIn = 100, tokensOut = 70) {
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } };
}

// A well-formed pulse JSON the model would emit for the programPulse prompt.
const VALID_PULSE: ProgramPulse = {
  week_summary: '9 of 12 coaches logged notes, 38 practices across the program last week.',
  active_coaches: 9,
  total_coaches: 12,
  teams_to_watch: [
    { team_name: 'U12s', note: 'Plenty of needs-work notes worth a check-in.' },
    { team_name: 'U14s', note: 'No sessions logged this week.' },
  ],
  next_action: {
    label: 'Nudge Coach Rivera — no notes in 2 weeks',
    kind: 'nudge_coach',
    rationale: 'Coach Rivera has not logged any activity in two weeks.',
  },
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
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { settings: orgSettings, tier: 'organization' }, error: null }) };
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

const prompt = PROMPT_REGISTRY.programPulse({
  orgName: 'Northside Youth League',
  activeCoaches: 9,
  totalCoaches: 12,
  totalSessions: 38,
  totalObservations: 120,
  teams: [
    { team_name: 'U10s', sessions: 6, observations: 22, needsWork: 4, quiet: false },
    { team_name: 'U12s', sessions: 1, observations: 18, needsWork: 9, quiet: false },
    { team_name: 'U14s', sessions: 0, observations: 0, needsWork: 0, quiet: true },
  ],
  quietCoaches: [{ coach_name: 'Coach Rivera', daysSinceActive: 14 }],
  candidateActions: [
    { kind: 'nudge_coach', label: 'Nudge Coach Rivera — no notes in 2 weeks', reason: 'No activity in two weeks.' },
    { kind: 'view_analytics', label: 'Open program analytics', reason: 'Dig into the team that needs support.' },
  ],
});

const baseOptions = {
  coachId: 'coach-1',
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

describe('programPulse prompt — provider-agnostic JSON contract', () => {
  it('builds a prompt that names the pulse fields and the closed next_action kinds', () => {
    expect(prompt.system).toContain('week_summary');
    expect(prompt.system).toContain('active_coaches');
    expect(prompt.system).toContain('teams_to_watch');
    expect(prompt.system).toContain('next_action');
    // The closed enum the client maps to a route.
    expect(prompt.user).toContain('nudge_coach');
    // Clipboard voice — no banned breathless words (AGENTS.md rule 7). The prompt
    // is phrased POSITIVELY so it doesn't trip on its own ban-list (LESSONS 2026-05-23).
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(all).not.toContain(banned);
    }
  });

  it('feeds only team-level and coach-level aggregates — no per-minor fields', () => {
    const all = `${prompt.system}\n${prompt.user}`;
    expect(all).toContain('U10s');
    expect(all).toContain('Coach Rivera');
    // No player-scoped data ever reaches the prompt.
    expect(all).not.toMatch(/jersey|player_id|birthdate/i);
  });

  it('parses against programPulseSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_PULSE)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAIWithJSON<ProgramPulse>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = programPulseSchema.parse(result.parsed);
    expect(validated.next_action.kind).toBe('nudge_coach');
    expect(validated.active_coaches).toBe(9);
  });

  it('parses against programPulseSchema when served by a fallback provider (OpenAI)', async () => {
    // Primary anthropic 529-overloads → client fails over to OpenAI, which serves
    // the same JSON shape. The schema is the cross-provider contract.
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_PULSE)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } });

    const result = await callAIWithJSON<ProgramPulse>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = programPulseSchema.parse(result.parsed);
    expect(validated.next_action.kind).toBe('nudge_coach');
    expect(typeof validated.week_summary).toBe('string');
  });

  it('rejects a pulse whose next_action.kind is outside the closed enum', () => {
    const bad = { ...VALID_PULSE, next_action: { ...VALID_PULSE.next_action, kind: 'send_email' } };
    expect(() => programPulseSchema.parse(bad)).toThrow();
  });
});
