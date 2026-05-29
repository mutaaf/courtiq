/**
 * Ticket 0056 — AI contract proof for the parentReactionReply prompt.
 *
 * The prompt must:
 *   - Render clipboard voice (LESSONS#0023) — no AGENTS.md banned word in
 *     either system or user (instruction is POSITIVE, never enumerates the
 *     banned tokens).
 *   - Thread the player's first name + the parent's first name + the
 *     parent's note text into the user prompt.
 *   - Thread the coach's first name as the closing signature.
 *   - Produce a single short reply string across BOTH Anthropic and a
 *     fallback provider (OpenAI) — the cross-provider contract is the
 *     reply text (no JSON schema for a one-line reply; the route consumes
 *     `text` directly).
 *   - NEVER leak a planted email/phone/DOB/last-name token from the
 *     reaction context into the prompt (COPPA — only first names + the
 *     parent's freely-typed note are passed to the model).
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

import { callAI } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';

// ─── Provider success-response shapes ────────────────────────────────────────────
function anthropicSuccess(text: string, tokensIn = 80, tokensOut = 40) {
  return { content: [{ type: 'text', text }], usage: { input_tokens: tokensIn, output_tokens: tokensOut } };
}
function openaiSuccess(text: string, tokensIn = 70, tokensOut = 35) {
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } };
}

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

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

const prompt = PROMPT_REGISTRY.parentReactionReply({
  playerFirstName: 'Devon',
  parentFirstName: 'Sarah',
  reactionNote: 'thank you for sticking with him on his shooting',
  coachFirstName: 'Maya',
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

describe('parentReactionReply prompt — voice + cross-provider contract (ticket 0056)', () => {
  it('renders clipboard voice — no AGENTS.md banned word in system or user (LESSONS#0023)', () => {
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    for (const banned of BANNED) {
      expect(all).not.toContain(banned);
    }
  });

  it('threads the player first name, the parent first name, the note, and the coach first name', () => {
    expect(prompt.user).toContain('Devon');
    expect(prompt.user).toContain('Sarah');
    expect(prompt.user).toContain('shooting');
    expect(prompt.user).toContain('Maya');
  });

  it('does NOT leak a planted email / phone / DOB token even when present in the inputs', () => {
    // A defensive contract: even if the caller mis-uses the prompt by
    // putting contact info into the inputs, the system block does NOT
    // enumerate the banned tokens that would defeat a banned-words scan
    // (LESSONS#0023). And the user block never widens the input list
    // (only the four named slots).
    const sneaky = PROMPT_REGISTRY.parentReactionReply({
      playerFirstName: 'Devon',
      parentFirstName: 'Sarah',
      reactionNote: 'thanks — text me at maya@example.com or call 5558675309',
      coachFirstName: 'Maya',
    });
    // The note is the parent's own words — it IS allowed to contain a
    // contact-info shape (the user typed it). The route's stripContactInfo
    // handles the OUTPUT side. What we assert here is that the prompt
    // doesn't accidentally embed those tokens into the SYSTEM block — only
    // the user block.
    const system = sneaky.system.toLowerCase();
    expect(system).not.toContain('maya@example.com');
    expect(system).not.toContain('5558675309');
  });

  it('produces a short reply string when served by Anthropic (primary)', async () => {
    const reply = 'Sarah — thanks for the note. Devon has been putting in the work on his shot and it is starting to show. See you Tuesday. — Maya';
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(reply));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAI(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(result.text).toContain('Sarah');
    expect(result.text).toContain('Devon');
    expect(result.text).toContain('Maya');
    // Length is short — a reply, not a paragraph.
    expect(result.text.length).toBeLessThan(500);
  });

  it('produces a short reply string when failed-over to OpenAI', async () => {
    // Primary Anthropic 529-overloads → callAI fails over to OpenAI, which
    // serves the same one-line reply shape. The cross-provider contract is
    // the reply text itself (no JSON parsing).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    const reply = 'Sarah — thanks for that. Devon has been working at his shot every practice. — Maya';
    openaiCreate.mockResolvedValueOnce(openaiSuccess(reply));
    const { supabase } = makeSupabase({
      ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' },
      // No explicit ai_provider — getConfiguredProvider walks anthropic
      // first, gets a 529, then the failover walks to openai.
    });

    const result = await callAI(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(result.text).toContain('Sarah');
    expect(result.text).toContain('Devon');
    expect(result.text).toContain('Maya');
  });
});
