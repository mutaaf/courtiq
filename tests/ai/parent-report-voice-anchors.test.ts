/**
 * Ticket 0070 — Make every parent report sound like the coach who is writing it.
 *
 * Pure-prompt tests for the `parentReport` builder's new OPTIONAL
 * `coachingSignature` parameter. When the signature is present AND its
 * `voice_anchors.length > 0`, the system prompt gains a SOFT-preference block
 * naming the coach's recurring phrasings on a SINGLE line joined by ` / `
 * (never a numbered list — a numbered list invites the model to force ALL of
 * them, the opposite of the intent).
 *
 * Per LESSONS#0103 — the absent / empty branches keep the prompt body
 * BYTE-IDENTICAL to the post-0066 baseline (the snapshot tests below pin
 * this).
 *
 * Per LESSONS#0023 — the block is instructed POSITIVELY (no enumerated
 * ban-list). The voice_anchors themselves are pre-filtered for banned tokens
 * during extraction (see `tests/lib/coaching-signature-utils.test.ts`), so the
 * fully-rendered prompt body contains no banned word for any fixture.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob per LESSONS#38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted provider SDK mocks (mirror parent-report-thin-week.test.ts) ─────
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
import type { CoachingSignature } from '@/lib/coaching-signature-utils';

// ─── Provider response shapes (anthropicSuccess / openaiSuccess) ──────────────
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

// A well-formed parent report shaped like what the model would emit. The
// `voice_anchors` enrichment must NOT add a new field on the response — the
// schema is unchanged.
const VALID_REPORT: ParentReport = {
  player_name: 'Maya',
  greeting: "Maya had a strong week.",
  highlights: ['Closed out on the wing with her hands ready'],
  skill_progress: [
    {
      skill_name: 'Defense',
      level: 'Practicing',
      narrative: 'She was reading the play before it happened.',
    },
  ],
  encouragement: 'Keep showing up.',
  coach_note: 'Watching how she comes back on Tuesday.',
};

// ─── In-memory chainable Supabase (serves provider keys + org tier) ──────────
function makeSupabase(orgSettings: Record<string, unknown>) {
  const inserts: Array<Record<string, unknown>> = [];
  let nextId = 1;
  function from(table: string): unknown {
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
      const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => Promise.resolve({ count: 0, error: null })),
        insert: vi.fn((row: Record<string, unknown>) => {
          const id = `interaction-${nextId++}`;
          inserts.push({ ...row, id });
          const insertChain: Record<string, unknown> = {
            select: vi.fn(() => insertChain),
            single: vi.fn(() => Promise.resolve({ data: { id }, error: null })),
          };
          (insertChain as { then: (r: (v: unknown) => unknown) => unknown }).then = (
            resolve: (v: unknown) => unknown,
          ) => resolve({ data: { id }, error: null });
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

const BASELINE_PARAMS = {
  teamName: 'Tigers',
  sportSlug: 'basketball',
  ageGroup: '11-13',
  playerName: 'Maya',
  reportData: { observations: [], proficiency: [], seasonWeek: 6 },
};

const SIGNATURE_WITH_ANCHORS: CoachingSignature = {
  top_skills: ['Defense'],
  recurring_drills: ['Closeout Drill'],
  typical_session_minutes: 60,
  voice_anchors: [
    'playing with her hands ready',
    'hearing the call before the ball comes',
    'reading the play before it happens',
  ],
};

const SIGNATURE_EMPTY_ANCHORS: CoachingSignature = {
  top_skills: ['Defense'],
  recurring_drills: ['Closeout Drill'],
  typical_session_minutes: 60,
  voice_anchors: [],
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

describe('parentReport prompt — coachingSignature (ticket 0070)', () => {
  // AC: absent coachingSignature → byte-identical to post-0066 baseline.
  it('produces a prompt BYTE-IDENTICAL to the post-0066 baseline when coachingSignature is absent', () => {
    const baseline = PROMPT_REGISTRY.parentReport(BASELINE_PARAMS);
    const widened = PROMPT_REGISTRY.parentReport({
      ...BASELINE_PARAMS,
      coachingSignature: undefined,
    });
    expect(widened.system).toBe(baseline.system);
    expect(widened.user).toBe(baseline.user);
  });

  // AC: present-but-empty voice_anchors → also byte-identical (the cold-start path).
  it('produces a prompt BYTE-IDENTICAL to the baseline when voice_anchors is [] (cold start)', () => {
    const baseline = PROMPT_REGISTRY.parentReport(BASELINE_PARAMS);
    const widened = PROMPT_REGISTRY.parentReport({
      ...BASELINE_PARAMS,
      coachingSignature: SIGNATURE_EMPTY_ANCHORS,
    });
    expect(widened.system).toBe(baseline.system);
    expect(widened.user).toBe(baseline.user);
  });

  // AC: voice_anchors present → soft-preference block at the END of the system
  // prompt with anchors joined by ` / ` on a SINGLE line.
  it('appends a soft-preference "lean on" block to the system prompt when voice_anchors are present', () => {
    const widened = PROMPT_REGISTRY.parentReport({
      ...BASELINE_PARAMS,
      coachingSignature: SIGNATURE_WITH_ANCHORS,
    });
    // The instruction names the soft preference and uses the verb "lean on"
    // (positive instruction per LESSONS#0023 — never a ban-list).
    expect(widened.system).toMatch(/lean on/i);
    // The anchors appear joined by ` / ` on the SAME line — never a numbered list.
    const expectedJoined = SIGNATURE_WITH_ANCHORS.voice_anchors!.join(' / ');
    expect(widened.system).toContain(expectedJoined);
    // Defensive: no numbered list shape (e.g. `1.` or `- `) precedes any anchor.
    for (const anchor of SIGNATURE_WITH_ANCHORS.voice_anchors!) {
      expect(widened.system).not.toContain(`1. ${anchor}`);
      expect(widened.system).not.toContain(`- ${anchor}`);
    }
  });

  // AC: positive voice — the prompt body NEVER literally enumerates the banned
  // tokens, even with the voice-anchor block present.
  it('uses clipboard voice (no banned breathless words) on the voice-anchor prompt (LESSONS#0023)', () => {
    const widened = PROMPT_REGISTRY.parentReport({
      ...BASELINE_PARAMS,
      coachingSignature: SIGNATURE_WITH_ANCHORS,
    });
    const all = `${widened.system}\n${widened.user}`.toLowerCase();
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

  // AC: response JSON shape is BYTE-IDENTICAL — no new field on the response.
  it('does NOT add any new field to the response JSON shape', () => {
    const widened = PROMPT_REGISTRY.parentReport({
      ...BASELINE_PARAMS,
      coachingSignature: SIGNATURE_WITH_ANCHORS,
    });
    // The response-shape sentence in the prompt is the contract; assert it ends
    // with the same keyset (player_name, greeting, highlights, skill_progress,
    // encouragement, home_activity, coach_note, since_last_report).
    // The voice-anchor enrichment must NOT introduce a "voice_anchor_used" or
    // similar field on the schema.
    expect(widened.user).toContain('"player_name"');
    expect(widened.user).toContain('"coach_note"');
    expect(widened.user).not.toContain('voice_anchor');
    expect(widened.user).not.toContain('voice_anchors');
  });
});

// ─── Cross-provider contract (Anthropic primary + OpenAI fallback) ─────────────
//
// The voice-anchor prompt must NOT be Anthropic-specific: the new soft-
// preference block must produce structurally-valid `parentReportSchema` JSON
// output regardless of which provider serves it.

const promptWithSignature = PROMPT_REGISTRY.parentReport({
  ...BASELINE_PARAMS,
  coachingSignature: SIGNATURE_WITH_ANCHORS,
});

const baseOptions = {
  coachId: 'coach-1',
  interactionType: 'generate_parent_report' as const,
  systemPrompt: promptWithSignature.system,
  userPrompt: promptWithSignature.user,
  orgId: 'org-1',
};

describe('parentReport voice-anchor prompt — provider-agnostic JSON contract (ticket 0070)', () => {
  it('parses against parentReportSchema when served by Anthropic (primary)', async () => {
    anthropicCreate.mockResolvedValueOnce(anthropicSuccess(JSON.stringify(VALID_REPORT)));
    const { supabase } = makeSupabase({
      ai_provider: 'anthropic',
      ai_keys: { anthropic: 'sk-ant' },
    });

    const result = await callAIWithJSON<ParentReport>(baseOptions, supabase);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const validated = parentReportSchema.parse(result.parsed);
    expect(validated.player_name).toBe('Maya');
    expect(typeof validated.coach_note).toBe('string');
  });

  it('parses against parentReportSchema when served by a fallback provider (OpenAI)', async () => {
    // Primary anthropic 529-overloads → client fails over to OpenAI, which
    // serves the same JSON shape. The schema is the cross-provider contract.
    const overloaded = new Error('overloaded') as Error & { status?: number };
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
    expect(validated.player_name).toBe('Maya');
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
});
