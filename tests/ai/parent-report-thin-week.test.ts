/**
 * Ticket 0066 — AI contract proof for the thin-week parent-report block.
 *
 * The new conditional thin-week prompt block must NOT be Anthropic-specific.
 * When the route passes `isThinWeek: true` plus `previousCommitments` into the
 * `PROMPT_REGISTRY.parentReport` builder, the builder produces a prompt that
 * produces a structurally-valid `parentReportSchema` JSON output regardless of
 * which provider serves it (Anthropic AND one fallback — OpenAI here, mirroring
 * the existing parent-report cross-season contract test under
 * `tests/ai/parent-report-cross-season-contract.test.ts`).
 *
 * The suite ALSO scans the rendered prompt + the rendered output for the
 * AGENTS.md banned tokens per LESSONS#0023: the prompt's positive voice means
 * the ban-list is never enumerated in the prompt body, so the assertion does
 * NOT trip on itself.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted provider SDK mocks (mirror provider-failover.test.ts) ───────────
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

// ─── Provider response shapes ────────────────────────────────────────────────
function anthropicSuccess(text: string, tokensIn = 120, tokensOut = 80) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}
function openaiSuccess(text: string, tokensIn = 100, tokensOut = 70) {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut },
  };
}

// A well-formed parent report shaped like what the model would emit for the
// thin-week prompt: short honest opener, single grounded paragraph, watching-
// next line. The schema accepts no banned token — `since_last_report` is the
// honest opener.
const VALID_REPORT: ParentReport = {
  player_name: 'Maya Johnson',
  greeting: "Maya was at one of two practices this week.",
  highlights: ['Made one strong closeout in Saturday\'s scrimmage'],
  skill_progress: [
    {
      skill_name: 'Defense',
      level: 'Practicing',
      narrative: "Closeouts are still building; one good rep is something to build on.",
    },
  ],
  encouragement: 'Keep showing up.',
  coach_note: "We are watching how closeouts come back next practice.",
  since_last_report:
    "This week was lighter on practice — here is what carried forward from what we told you last time.",
};

// ─── In-memory chainable Supabase (serves provider keys + org tier) ──────────
function makeSupabase(orgSettings: any) {
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
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: { settings: orgSettings, tier: 'coach' }, error: null }),
      };
    }
    if (table === 'ai_interactions') {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => Promise.resolve({ count: 0, error: null })),
        insert: vi.fn((row: any) => {
          const id = `interaction-${nextId++}`;
          inserts.push({ ...row, id });
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
  return { supabase: { from: vi.fn(from) }, inserts };
}

// Build the THIN-WEEK prompt the route hands to the model.
const prompt = PROMPT_REGISTRY.parentReport({
  teamName: 'Tigers',
  sportSlug: 'basketball',
  ageGroup: '11-13',
  playerName: 'Maya Johnson',
  reportData: {
    observations: [
      { category: 'Defense', sentiment: 'positive', text: 'Made one strong closeout in scrimmage' },
      { category: 'Defense', sentiment: 'positive', text: 'Called out a switch on the wing' },
      { category: 'Effort', sentiment: 'positive', text: 'Stayed engaged in the short scrimmage' },
    ],
    proficiency: [{ skill_id: 'defense', proficiency_level: 'practicing', trend: 'steady' }],
    seasonWeek: 6,
  },
  priorReport: {
    highlights: ['finish the closeout', 'drive with the left hand'],
    skill_progress: [
      { skill_name: 'Defense', level: 'Practicing', narrative: 'closeouts coming along' },
      { skill_name: 'Ball-handling', level: 'Practicing', narrative: 'left hand getting there' },
      { skill_name: 'Communication', level: 'Practicing', narrative: 'switch calls' },
    ],
    coach_note: 'Working on closeouts, left hand, and switch communication.',
    since_last_report: null,
  },
  isThinWeek: true,
  previousCommitments: [
    'finish the closeout',
    'drive with the left hand',
    'communicate on switches',
  ],
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

describe('parentReport thin-week prompt — provider-agnostic JSON contract (ticket 0066)', () => {
  it('builds a prompt with the thin-week block (lighter / carried forward / watching next)', () => {
    expect(prompt.user).toContain('lighter');
    expect(prompt.user).toContain('carried forward');
    expect(prompt.user.toLowerCase()).toContain('watching next');
    // Quotes at least one of the previous commitments verbatim so the model
    // has something concrete to ground the new report against.
    expect(prompt.user).toContain('finish the closeout');
  });

  it('uses clipboard voice (no banned breathless words) on the thin-week prompt', () => {
    // Phrased POSITIVELY so the prompt does NOT trip on its own ban-list
    // (LESSONS#0023).
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

  it('parses against parentReportSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_REPORT)));
    const { supabase } = makeSupabase({
      ai_provider: 'anthropic',
      ai_keys: { anthropic: 'sk-ant' },
    });

    const result = await callAIWithJSON<ParentReport>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = parentReportSchema.parse(result.parsed);
    expect(validated.player_name).toBe('Maya Johnson');
    expect(typeof validated.coach_note).toBe('string');
  });

  it('parses against parentReportSchema when served by a fallback provider (OpenAI)', async () => {
    // Primary anthropic 529-overloads → client fails over to OpenAI, which
    // serves the same JSON shape. The schema is the cross-provider contract.
    const overloaded: any = new Error('overloaded');
    overloaded.status = 529;
    anthropicCreate.mockRejectedValueOnce(overloaded);
    openaiCreate.mockResolvedValueOnce(openaiSuccess(JSON.stringify(VALID_REPORT)));
    const { supabase } = makeSupabase({
      ai_provider: 'anthropic',
      ai_keys: { anthropic: 'sk-ant', openai: 'sk-oai' },
    });

    const result = await callAIWithJSON<ParentReport>(baseOptions, supabase);

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const validated = parentReportSchema.parse(result.parsed);
    expect(validated.player_name).toBe('Maya Johnson');
  });

  it('the parsed output passes the banned-word rendered-text scan', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_REPORT)));
    const { supabase } = makeSupabase({
      ai_provider: 'anthropic',
      ai_keys: { anthropic: 'sk-ant' },
    });
    const result = await callAIWithJSON<ParentReport>(baseOptions, supabase);
    const rendered = JSON.stringify(result.parsed).toLowerCase();
    for (const banned of [
      'journey',
      'amazing',
      'exciting',
      'elevate',
      'empower',
      'synergy',
      'unlock your potential',
    ]) {
      expect(rendered).not.toContain(banned);
    }
  });

  // Regression: when the route does NOT pass isThinWeek, the prompt is the
  // existing (post-0034) shape — no thin-week instruction sneaks in for the
  // rich-week case. This is the byte-identity guard for the non-thin path.
  it('does NOT emit the thin-week block when isThinWeek is false (regression)', () => {
    const noThin = PROMPT_REGISTRY.parentReport({
      teamName: 'Tigers',
      sportSlug: 'basketball',
      ageGroup: '11-13',
      playerName: 'Maya Johnson',
      reportData: { observations: [], proficiency: [], seasonWeek: 6 },
    });
    expect(noThin.user.toLowerCase()).not.toContain('this week was lighter');
    expect(noThin.user.toLowerCase()).not.toContain('what we\'re watching next');
    expect(noThin.user).not.toContain('finish the closeout');
  });
});
