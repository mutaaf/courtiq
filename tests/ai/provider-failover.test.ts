/**
 * Tests for multi-provider AI failover in src/lib/ai/client.ts (ticket 0012).
 *
 * The product claims "multi-provider AI routing WITH failover" as a moat, but
 * until this ticket callAI() resolved exactly one provider and rethrew on any
 * error. This suite is the contract proof that failover is real and observable:
 * when the primary provider call throws a RETRYABLE transport error and a second
 * provider key exists, callAI() quietly retries the next eligible provider, logs
 * BOTH outcomes to ai_interactions (failed-primary error row + fallback success
 * row), counts the request once for quota, and never fails over on a tier/rate
 * refusal or a non-retryable provider error (401/400).
 *
 * Strategy mirrors tests/ai/usage.test.ts: the provider SDKs and the chainable
 * Supabase are replaced with in-memory mocks. We drive per-provider behavior by
 * mocking the three SDK constructors (Anthropic / OpenAI / Gemini) — callProvider
 * dispatches to whichever the resolved/fallback provider is, so controlling the
 * SDKs lets us make exactly one provider reject and the next resolve. The
 * Supabase mock records every ai_interactions insert so we can assert the
 * two-row audit trail and the returned interactionId.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted provider mocks ─────────────────────────────────────────────────────
// One callable per provider that the test sets per-scenario. callProvider →
// callAnthropic/callOpenAI/callGemini construct these SDKs and invoke a method;
// we route that method to the matching hoisted fn.
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

// No redis in tests → dedup cache path is skipped (matches CI dummy env).
vi.mock('@/lib/cache/redis', () => ({ redis: null }));

// Per-coach hourly rate-limit guard: allow by default; one scenario forces a refusal.
const { mockRateCheck } = vi.hoisted(() => ({ mockRateCheck: vi.fn() }));
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, checkAIRateLimit: mockRateCheck };
});

import { callAI, isRetryableProviderError, type AIProvider } from '@/lib/ai/client';
import { RateLimitError, TierLimitError } from '@/lib/rate-limit';

// ─── Anthropic / OpenAI success-response shapes (what the SDK returns) ───────────
function anthropicSuccess(text: string, tokensIn = 100, tokensOut = 50) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}
function openaiSuccess(text: string, tokensIn = 80, tokensOut = 40) {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut },
  };
}

/** A provider transport error with an HTTP status, like the Anthropic/OpenAI SDKs throw. */
function providerError(status: number, message = `HTTP ${status}`) {
  const err: any = new Error(message);
  err.status = status;
  return err;
}

// ─── In-memory chainable Supabase ───────────────────────────────────────────────
// Records ai_interactions inserts (the audit trail under test) and serves the
// organizations.settings (provider keys) + organizations.tier + monthly count.
interface FakeDB {
  orgSettings: any;          // organizations.settings (ai_provider + ai_keys)
  tier: string;             // organizations.tier
  monthlySuccessCount: number; // existing status='success' rows this month
}

function makeSupabase(db: FakeDB) {
  const inserts: any[] = [];
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
      // Two distinct selects hit this table: settings (provider resolution) and
      // tier (quota). A single chain that returns both columns satisfies both.
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { settings: db.orgSettings, tier: db.tier },
          error: null,
        }),
      };
    }

    if (table === 'ai_interactions') {
      const chain: any = {
        // quota count chain: select(...).eq().eq().gte() → { count }
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => Promise.resolve({ count: db.monthlySuccessCount, error: null })),
        // insert(...).select('id').single() → { data: { id } }
        insert: vi.fn((row: any) => {
          const id = `interaction-${nextId++}`;
          inserts.push({ ...row, id });
          const insertChain: any = {
            select: vi.fn(() => insertChain),
            single: vi.fn(() => Promise.resolve({ data: { id }, error: null })),
          };
          // Some inserts are awaited directly (the error-row insert has no .select)
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

const baseOptions = {
  coachId: 'coach-1',
  teamId: 'team-1',
  interactionType: 'generate_parent_report' as const,
  systemPrompt: 'You are a youth coach assistant.',
  userPrompt: 'Write a parent report for Marcus.',
  orgId: 'org-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: rate-limit allows the call.
  mockRateCheck.mockResolvedValue({ allowed: true, limit: 20, remaining: 19, resetAt: Date.now() + 3600_000 });
  // Default: no provider keys via env (scenarios seed org settings instead).
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

describe('isRetryableProviderError (pure classifier)', () => {
  it('treats 5xx and 529 (provider overload) as retryable', () => {
    expect(isRetryableProviderError(providerError(500))).toBe(true);
    expect(isRetryableProviderError(providerError(502))).toBe(true);
    expect(isRetryableProviderError(providerError(503))).toBe(true);
    expect(isRetryableProviderError(providerError(529))).toBe(true);
  });

  it('treats a provider-side 429 (rate limited) as retryable on another provider', () => {
    expect(isRetryableProviderError(providerError(429))).toBe(true);
  });

  it('treats network errors (no .status) as retryable', () => {
    const econn: any = new Error('socket hang up');
    econn.code = 'ECONNRESET';
    expect(isRetryableProviderError(econn)).toBe(true);
    expect(isRetryableProviderError(new Error('fetch failed'))).toBe(true);
  });

  it('treats 400/401/403 client errors as NOT retryable', () => {
    expect(isRetryableProviderError(providerError(400))).toBe(false);
    expect(isRetryableProviderError(providerError(401))).toBe(false);
    expect(isRetryableProviderError(providerError(403))).toBe(false);
  });
});

describe('callAI multi-provider failover', () => {
  // AC1: retryable primary error + second key available → fallback result returned, no throw.
  it('returns the fallback provider result when the primary throws a retryable error', async () => {
    anthropicCreate.mockRejectedValueOnce(providerError(529, 'overloaded'));
    openaiCreate.mockResolvedValueOnce(openaiSuccess('Fallback report from OpenAI'));

    const { supabase } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } },
      tier: 'free',
      monthlySuccessCount: 0,
    });

    const result = await callAI(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('Fallback report from OpenAI');
  });

  // AC2: a successful failover logs BOTH outcomes; returned id is the SUCCESS row's.
  it('logs a failed-primary error row AND a fallback success row, returning the success id', async () => {
    anthropicCreate.mockRejectedValueOnce(providerError(503, 'service unavailable'));
    openaiCreate.mockResolvedValueOnce(openaiSuccess('OpenAI saved the day', 81, 41));

    const { supabase, inserts } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } },
      tier: 'free',
      monthlySuccessCount: 0,
    });

    const result = await callAI(baseOptions, supabase);

    expect(inserts).toHaveLength(2);
    const [errorRow, successRow] = inserts;
    // Failed-primary row: error status, anthropic model, carries the error message.
    expect(errorRow.status).toBe('error');
    expect(errorRow.model).toContain('claude');
    expect(errorRow.error_message).toBe('service unavailable');
    // Fallback success row: success status, openai model + the fallback's token counts.
    expect(successRow.status).toBe('success');
    expect(successRow.model).toBe('gpt-4o');
    expect(successRow.response_tokens_in).toBe(81);
    expect(successRow.response_tokens_out).toBe(41);
    // Returned interactionId is the SUCCESS row's id, not the error row's.
    expect(result.interactionId).toBe(successRow.id);
    expect(result.interactionId).not.toBe(errorRow.id);
  });

  // AC3: quota counts the request once — the failed-primary row is status:'error'
  // so the existing month-count query (.eq('status','success')) excludes it.
  it('writes exactly one status=success row on a successful failover (quota delta of 1)', async () => {
    anthropicCreate.mockRejectedValueOnce(providerError(500));
    openaiCreate.mockResolvedValueOnce(openaiSuccess('one success'));

    const { supabase, inserts } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } },
      tier: 'free',
      monthlySuccessCount: 0,
    });

    await callAI(baseOptions, supabase);

    const successRows = inserts.filter((r) => r.status === 'success');
    expect(successRows).toHaveLength(1);
  });

  // AC4a: a free org over its monthly cap throws TierLimitError and makes ZERO provider calls.
  it('throws TierLimitError without any provider call when the free org is over its monthly cap', async () => {
    const { supabase, inserts } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } },
      tier: 'free',
      monthlySuccessCount: 5, // free cap is 5 (TIER_LIMITS.free.maxAICallsPerMonth)
    });

    await expect(callAI(baseOptions, supabase)).rejects.toBeInstanceOf(TierLimitError);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  // AC4b: a per-coach rate-limit refusal still throws RateLimitError, no provider call, no failover.
  it('throws RateLimitError without any provider call when the coach is rate-limited', async () => {
    mockRateCheck.mockResolvedValueOnce({ allowed: false, limit: 20, remaining: 0, resetAt: Date.now() + 3600_000 });

    const { supabase, inserts } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } },
      tier: 'free',
      monthlySuccessCount: 0,
    });

    await expect(callAI(baseOptions, supabase)).rejects.toBeInstanceOf(RateLimitError);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  // AC5: a non-retryable provider error (401) does NOT fail over — logs + rethrows as today.
  it('does NOT fail over on a 401 (invalid key); logs one error row and rethrows', async () => {
    anthropicCreate.mockRejectedValueOnce(providerError(401, 'invalid x-api-key'));

    const { supabase, inserts } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-bad', openai: 'sk-oai' } },
      tier: 'free',
      monthlySuccessCount: 0,
    });

    await expect(callAI(baseOptions, supabase)).rejects.toMatchObject({ status: 401 });
    // Primary called once, fallback NEVER attempted on a non-retryable error.
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(openaiCreate).not.toHaveBeenCalled();
    // Exactly one error row logged (no fallback success row).
    expect(inserts).toHaveLength(1);
    expect(inserts[0].status).toBe('error');
  });

  // AC6: single-key org (no fallback available) → unchanged: logs + rethrows the original error.
  it('rethrows the original error unchanged when only one provider key is configured', async () => {
    anthropicCreate.mockRejectedValueOnce(providerError(529, 'overloaded'));

    const { supabase, inserts } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } }, // only one key
      tier: 'free',
      monthlySuccessCount: 0,
    });

    await expect(callAI(baseOptions, supabase)).rejects.toMatchObject({ status: 529 });
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(geminiGenerate).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].status).toBe('error');
  });

  // AC7: deterministic, key-gated fallback selection — next eligible provider after the
  // failed primary, skipping a provider with no key. Primary anthropic, openai has NO key,
  // gemini DOES → fallback must be gemini, not openai.
  it('selects the next KEY-GATED provider as fallback, skipping providers with no key', async () => {
    anthropicCreate.mockRejectedValueOnce(providerError(502));
    geminiGenerate.mockResolvedValueOnce({
      response: {
        text: () => 'Gemini fallback report',
        usageMetadata: { promptTokenCount: 60, candidatesTokenCount: 30 },
      },
    });

    const { supabase, inserts } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', gemini: 'sk-gem' } }, // no openai key
      tier: 'free',
      monthlySuccessCount: 0,
    });

    const result = await callAI(baseOptions, supabase);

    expect(result.text).toBe('Gemini fallback report');
    expect(openaiCreate).not.toHaveBeenCalled(); // skipped: no key
    expect(geminiGenerate).toHaveBeenCalledTimes(1);
    const successRow = inserts.find((r) => r.status === 'success');
    expect(successRow.model).toBe('gemini-2.5-flash');
  });

  // AC8 (regression complement): fallback can come from an ENV key when the primary is the
  // org-configured one — env precedence preserved, fallback still excludes the failed primary.
  it('falls over to an env-keyed provider when the org has only the failed primary key', async () => {
    process.env.OPENAI_API_KEY = 'sk-oai-env';
    anthropicCreate.mockRejectedValueOnce(providerError(503));
    openaiCreate.mockResolvedValueOnce(openaiSuccess('env-keyed fallback'));

    const { supabase } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } }, // org only has anthropic
      tier: 'free',
      monthlySuccessCount: 0,
    });

    const result = await callAI(baseOptions, supabase);
    expect(result.text).toBe('env-keyed fallback');
    expect(openaiCreate).toHaveBeenCalledTimes(1);
  });

  // AC8 (parse path regression): both fail → callAI rethrows the FALLBACK error after logging both.
  it('logs both error rows and rethrows when the fallback ALSO throws', async () => {
    anthropicCreate.mockRejectedValueOnce(providerError(529, 'primary overloaded'));
    openaiCreate.mockRejectedValueOnce(providerError(500, 'fallback also down'));

    const { supabase, inserts } = makeSupabase({
      orgSettings: { ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' } },
      tier: 'free',
      monthlySuccessCount: 0,
    });

    await expect(callAI(baseOptions, supabase)).rejects.toMatchObject({ message: 'fallback also down' });
    // Two error rows: failed primary + failed fallback. No success row.
    expect(inserts).toHaveLength(2);
    expect(inserts.every((r) => r.status === 'error')).toBe(true);
    expect(inserts.some((r) => r.status === 'success')).toBe(false);
  });
});
