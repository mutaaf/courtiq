/**
 * Ticket 0061 — AI contract proof for the `playerTrajectory` prompt.
 *
 * The prompt must:
 *   - render with clipboard voice (no AGENTS.md banned words in
 *     `${system}\n${user}` — instruct positively per LESSONS#0023; never
 *     enumerate the banned tokens)
 *   - receive ONLY the structured per-observation rows for ONE player +
 *     the player's first name + age group + sport name (no parent contact,
 *     no DOB, no last name — COPPA)
 *   - parse against `playerTrajectorySchema` when served by Anthropic AND
 *     when served by the OpenAI fallback
 *   - reject any extra top-level key (strict allow-list)
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
import { playerTrajectorySchema, type PlayerTrajectoryAIOutput } from '@/lib/ai/schemas';

function anthropicSuccess(text: string, tokensIn = 200, tokensOut = 90) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}
function openaiSuccess(text: string, tokensIn = 180, tokensOut = 80) {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut },
  };
}

const VALID_OUTPUT: PlayerTrajectoryAIOutput = {
  started: {
    headline: 'Tentative on closeouts',
    sentence: 'Started the season hesitating on closeouts; never got her weight forward.',
    observation_id: 'o-1',
  },
  now: {
    headline: 'Closes out and recovers',
    sentence: 'Now closes out and recovers without losing her balance.',
    observation_id: 'o-9',
  },
  turning_points: [
    { observation_id: 'o-4', one_word_label: 'forward' },
    { observation_id: 'o-7', one_word_label: 'recovers' },
  ],
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

const prompt = PROMPT_REGISTRY.playerTrajectory({
  playerFirstName: 'Maya',
  ageGroup: '11-13',
  sportName: 'basketball',
  weeksObserved: 11,
  observations: [
    { id: 'o-1', text: 'Hesitated on closeouts, never got her weight forward.', sentiment: 'needs-work', category: 'Defense', skill_id: 'closeout', observed_at: '2026-03-01T00:00:00Z' },
    { id: 'o-2', text: 'Lost her player on the second pass.', sentiment: 'needs-work', category: 'Defense', skill_id: null, observed_at: '2026-03-08T00:00:00Z' },
    { id: 'o-3', text: 'Talked teammates through a closeout.', sentiment: 'positive', category: 'IQ', skill_id: 'communication', observed_at: '2026-03-15T00:00:00Z' },
    { id: 'o-4', text: 'Stayed forward on a closeout for the first time.', sentiment: 'positive', category: 'Defense', skill_id: 'closeout', observed_at: '2026-03-22T00:00:00Z' },
    { id: 'o-5', text: 'Started using her left hand on the drive.', sentiment: 'positive', category: 'Offense', skill_id: 'finishing', observed_at: '2026-04-05T00:00:00Z' },
    { id: 'o-6', text: 'Held a defensive stance through three reps.', sentiment: 'positive', category: 'Effort', skill_id: null, observed_at: '2026-04-12T00:00:00Z' },
    { id: 'o-7', text: 'Recovered to the next shooter without losing balance.', sentiment: 'positive', category: 'Defense', skill_id: 'closeout', observed_at: '2026-04-19T00:00:00Z' },
    { id: 'o-8', text: 'Cleared the help defender on the drive.', sentiment: 'positive', category: 'Offense', skill_id: 'finishing', observed_at: '2026-05-03T00:00:00Z' },
    { id: 'o-9', text: 'Closes out and recovers without losing her balance.', sentiment: 'positive', category: 'Defense', skill_id: 'closeout', observed_at: '2026-05-20T00:00:00Z' },
  ],
});

const baseOptions = {
  coachId: 'coach-1',
  teamId: 'team-1',
  interactionType: 'generate_player_trajectory' as const,
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

describe('playerTrajectory prompt — voice + provider-agnostic JSON contract (ticket 0061)', () => {
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

  it('threads the player first name + age + sport + observation text into the user prompt', () => {
    expect(prompt.user).toContain('Maya');
    expect(prompt.user).toContain('11-13');
    expect(prompt.user).toContain('basketball');
    expect(prompt.user).toContain('Hesitated on closeouts');
    expect(prompt.user).toContain('Closes out and recovers');
  });

  it('does NOT leak a last name / parent contact / DOB shape (defensive scan)', () => {
    const all = `${prompt.system}\n${prompt.user}`;
    expect(all).not.toMatch(/@\S+\.\S+/);
    expect(all).not.toMatch(/\b\d{7,}\b/);
    expect(all).not.toMatch(/\bdob\b/i);
    expect(all).not.toMatch(/\bdate\s+of\s+birth\b/i);
    // Last names are never threaded — only the first name "Maya" appears.
    // The regex matches a same-line "Maya<space>Capitalized" — which would
    // be a "Maya Walker"-shaped surname. Newline-separated `Maya\nAge group:`
    // is fine: that's the labelled-key shape, not a person's first+last name.
    expect(all).not.toMatch(/Maya [A-Z][a-z]+/);
  });

  it('parses against playerTrajectorySchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_OUTPUT)));
    const { supabase } = makeSupabase({ ai_provider: 'anthropic', ai_keys: { anthropic: 'sk-ant' } });

    const result = await callAIWithJSON<PlayerTrajectoryAIOutput>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = playerTrajectorySchema.parse(result.parsed);
    expect(validated.started.sentence.length).toBeGreaterThan(10);
    expect(validated.now.sentence.length).toBeGreaterThan(10);
  });

  it('parses against playerTrajectorySchema when served by the OpenAI fallback', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_OUTPUT)));
    const { supabase } = makeSupabase({
      ai_provider: 'anthropic',
      ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' },
    });

    const result = await callAIWithJSON<PlayerTrajectoryAIOutput>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = playerTrajectorySchema.parse(result.parsed);
    expect(validated.turning_points.length).toBeLessThanOrEqual(3);
  });

  it('rejects an extra top-level key (strict allow-list)', () => {
    expect(() =>
      playerTrajectorySchema.parse({ ...VALID_OUTPUT, extra_field: 'nope' }),
    ).toThrow();
  });

  it('rejects an empty started.sentence', () => {
    expect(() =>
      playerTrajectorySchema.parse({
        ...VALID_OUTPUT,
        started: { ...VALID_OUTPUT.started, sentence: '' },
      }),
    ).toThrow();
  });
});
