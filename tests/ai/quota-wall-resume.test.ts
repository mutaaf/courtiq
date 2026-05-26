/**
 * Ticket 0035 — the quota wall is a server-side guard: the resume round-trip only
 * runs a real AI generation once the org is GENUINELY entitled. This suite proves
 * the gated AI path's 402-then-200 transition through the REAL quota enforcement
 * in callAI() and the REAL 402 contract in handleAIError() — the two pieces the
 * ticket explicitly must NOT alter, plus the entitlement guard the resume path
 * leans on.
 *
 * Strategy mirrors tests/ai/provider-failover.test.ts: provider SDKs + chainable
 * Supabase are in-memory mocks. We drive the org tier and the existing monthly
 * success count to move the same call across the wall:
 *   - free tier, count >= 5  → callAIWithJSON throws TierLimitError(402, upgrade)
 *     → handleAIError returns 402 { upgrade:true, tier:'free', limit:5 } UNCHANGED
 *     (AC: 402 contract is unchanged; resume + un-flipped tier still 402, no
 *      artifact generated for a free coach);
 *   - coach tier             → the same call runs the real generator → 200
 *     (AC: the wall→resume path runs the real generator only when entitled).
 *
 * Filename is `.test.ts` (vitest.config excludes the spec glob — LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { anthropicCreate } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } };
  },
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: vi.fn(), startChat: () => ({ sendMessage: vi.fn() }) };
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
import { TierLimitError } from '@/lib/rate-limit';
import { handleAIError } from '@/lib/ai/error';

function anthropicSuccess(text: string, tokensIn = 100, tokensOut = 50) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}

interface FakeDB {
  tier: string;
  monthlySuccessCount: number;
}

function makeSupabase(db: FakeDB) {
  let nextId = 1;
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
        single: vi.fn().mockResolvedValue({
          data: {
            settings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } },
            tier: db.tier,
          },
          error: null,
        }),
      };
    }
    if (table === 'ai_interactions') {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => Promise.resolve({ count: db.monthlySuccessCount, error: null })),
        insert: vi.fn(() => {
          const id = `interaction-${nextId++}`;
          const insertChain: any = {
            select: vi.fn(() => insertChain),
            single: vi.fn(() => Promise.resolve({ data: { id }, error: null })),
          };
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
  return { from: vi.fn(from) };
}

const baseOptions = {
  coachId: 'coach-1',
  teamId: 'team-1',
  interactionType: 'generate_parent_report' as const,
  systemPrompt: 'You are a youth coach assistant.',
  userPrompt: 'Write a parent report for Maya.',
  orgId: 'org-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRateCheck.mockResolvedValue({ allowed: true, limit: 20, remaining: 19, resetAt: Date.now() + 3600_000 });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('quota wall guard — 402 contract unchanged (ticket 0035)', () => {
  // AC1 + AC6: a free coach at quota gets a 402 with the EXACT shape today's
  // routes return — { upgrade:true, tier, limit }. The resume value is NOT in the
  // body (it is built client-side); this proves the server response is unchanged.
  it('throws TierLimitError at free quota, and handleAIError yields 402 { upgrade, tier, limit }', async () => {
    const supabase = makeSupabase({ tier: 'free', monthlySuccessCount: 5 });

    let thrown: unknown;
    try {
      await callAIWithJSON(baseOptions, supabase as any);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(TierLimitError);
    // The provider must NEVER be called for a free coach over quota — no AI runs.
    expect(anthropicCreate).not.toHaveBeenCalled();

    const res = handleAIError(thrown, 'Parent report');
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
    expect(body.tier).toBe('free');
    expect(body.limit).toBe(5);
    // No generated artifact leaks into a 402 body.
    expect(body.content).toBeUndefined();
    expect(body.plan).toBeUndefined();
    // The resume value is NEVER part of the server 402 payload (built client-side).
    expect(JSON.stringify(body)).not.toContain('parent_report:');
  });

  // AC6 (race guard): a coach whose webhook has NOT yet flipped the tier is still
  // `free` server-side — the resume target shows the gated state, not a silently
  // generated artifact. Same 402, regardless of any resume the client carries.
  it('still returns 402 when the tier has NOT flipped yet (redirect-before-webhook race)', async () => {
    const supabase = makeSupabase({ tier: 'free', monthlySuccessCount: 7 });
    await expect(callAIWithJSON(baseOptions, supabase as any)).rejects.toBeInstanceOf(TierLimitError);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});

describe('quota wall guard — 200 once entitled (ticket 0035)', () => {
  // AC7: the SAME call returns a real generated artifact once the org tier is
  // genuinely `coach` — proving the wall→resume path runs the real generator only
  // when entitled. coach tier has an effectively-unlimited monthly cap, so the
  // quota guard does not fire and the provider call proceeds.
  it('runs the real generator and returns 200 once the org tier is coach', async () => {
    anthropicCreate.mockResolvedValueOnce(
      anthropicSuccess(JSON.stringify({ summary: 'Maya had a strong week.' }))
    );
    const supabase = makeSupabase({ tier: 'coach', monthlySuccessCount: 999 });

    const result = await callAIWithJSON<{ summary: string }>(baseOptions, supabase as any);
    // The provider WAS called (the gate is open at coach tier) and produced an artifact.
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(result.parsed).toMatchObject({ summary: 'Maya had a strong week.' });
    expect(typeof result.interactionId).toBe('string');
  });
});
