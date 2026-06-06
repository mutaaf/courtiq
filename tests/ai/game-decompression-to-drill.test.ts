/**
 * Ticket 0069 — AI contract proof for the gameDecompressionToDrill prompt.
 *
 * The `gameDecompressionToDrill` prompt must:
 *  - read clipboard-plain across the rendered ${system}\n${user} body
 *    (LESSONS#0023 — positive instruction only, NEVER an enumerated
 *    ban-list inside the prompt body, which would trip the scan itself);
 *  - thread the transcript into the user block verbatim;
 *  - thread the drill library entries into the user block (drill names +
 *    focus), so the model can lean on team-known drills first;
 *  - thread the coachingSignature's recurring drills if present;
 *  - produce structurally-valid JSON across Anthropic primary AND one
 *    fallback provider (the cross-provider contract per AGENTS.md);
 *  - return JSON whose shape is { drill_name, setup_lines, why } and
 *    nothing else — the route reads only those three keys.
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#0020/#38).
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

const VALID_RECOMMENDATION = {
  drill_name: 'Live-ball rebound 2-on-2',
  setup_lines: [
    'Pair up at the elbows; one shooter at the wing.',
    'Box out on the shot; first to 5 boards wins the round.',
    'Eight minutes. Switch partners every two.',
  ],
  why: 'Saturday\'s note said rebounding and effort. Starting here.',
};

// In-memory chainable Supabase (serves provider keys + org tier).
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
        single: vi.fn().mockResolvedValue({
          data: { settings: orgSettings, tier: 'coach' },
          error: null,
        }),
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
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
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

function anthropicSuccess(text: string, tokensIn = 80, tokensOut = 40) {
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

const TRANSCRIPT =
  "We couldn't get a single rebound. They outran us on every transition. Three kids gave up by the second quarter. Need to work on rebounding and effort.";

const prompt = PROMPT_REGISTRY.gameDecompressionToDrill({
  transcript: TRANSCRIPT,
  sportName: 'basketball',
  ageGroup: '11-13',
  drillLibrary: [
    { name: 'Live-ball rebound 2-on-2', focus: 'rebounding' },
    { name: '3-on-3 transition', focus: 'transition' },
    { name: 'Closeout to contest', focus: 'defense' },
  ],
  coachingSignature: {
    top_skills: ['Defense', 'Effort'],
    recurring_drills: ['Box-out drill', 'Wave drill'],
    typical_session_minutes: 60,
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
  mockRateCheck.mockResolvedValue({
    allowed: true,
    limit: 20,
    remaining: 19,
    resetAt: Date.now() + 3_600_000,
  });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

describe('gameDecompressionToDrill prompt — clipboard voice contract (ticket 0069)', () => {
  it('renders clipboard voice (no banned hype words anywhere in the prompt body)', () => {
    const all = `${prompt.system}\n${prompt.user}`.toLowerCase();
    // The AGENTS.md banned set. LESSONS#0023 — positive instruction only;
    // the prompt itself must not enumerate the ban-list.
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

  it('threads the transcript into the user prompt verbatim', () => {
    expect(prompt.user).toContain(TRANSCRIPT);
  });

  it('threads the drill library into the user prompt (names + focus tags)', () => {
    expect(prompt.user).toContain('Live-ball rebound 2-on-2');
    expect(prompt.user).toContain('rebounding');
    expect(prompt.user).toContain('3-on-3 transition');
    expect(prompt.user).toContain('Closeout to contest');
  });

  it('threads the coachingSignature recurring drills when present', () => {
    expect(prompt.user).toContain('Box-out drill');
    expect(prompt.user).toContain('Wave drill');
  });

  it('names the response JSON shape (drill_name + setup_lines + why)', () => {
    expect(prompt.system).toMatch(/drill_name/);
    expect(prompt.system).toMatch(/setup_lines/);
    expect(prompt.system).toMatch(/\bwhy\b/);
  });

  it('instructs first-name-only on player references (COPPA)', () => {
    expect(prompt.system.toLowerCase()).toContain('first name');
  });
});

describe('gameDecompressionToDrill — cross-provider JSON contract (ticket 0069)', () => {
  it('parses on Anthropic primary into the { drill_name, setup_lines, why } shape', async () => {
    anthropicCreate.mockResolvedValueOnce(
      anthropicSuccess(JSON.stringify(VALID_RECOMMENDATION)),
    );
    const { supabase } = makeSupabase({
      ai_provider: 'anthropic',
      ai_keys: { anthropic: 'sk-ant' },
    });

    const result = await callAIWithJSON<typeof VALID_RECOMMENDATION>(
      baseOptions,
      supabase,
    );

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(typeof result.parsed.drill_name).toBe('string');
    expect(result.parsed.drill_name.length).toBeGreaterThan(0);
    expect(Array.isArray(result.parsed.setup_lines)).toBe(true);
    expect(result.parsed.setup_lines.length).toBeGreaterThan(0);
    expect(result.parsed.setup_lines.length).toBeLessThanOrEqual(3);
    expect(typeof result.parsed.why).toBe('string');
    expect(result.parsed.why.length).toBeLessThanOrEqual(160);
  });

  it('parses on the OpenAI fallback when Anthropic overloads', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(
      openaiSuccess(JSON.stringify(VALID_RECOMMENDATION)),
    );
    const { supabase } = makeSupabase({
      ai_provider: 'anthropic',
      ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' },
    });

    const result = await callAIWithJSON<typeof VALID_RECOMMENDATION>(
      baseOptions,
      supabase,
    );

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(typeof result.parsed.drill_name).toBe('string');
    expect(Array.isArray(result.parsed.setup_lines)).toBe(true);
    expect(typeof result.parsed.why).toBe('string');
  });
});
