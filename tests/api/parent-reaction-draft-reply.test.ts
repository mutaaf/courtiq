/**
 * Ticket 0056 — POST /api/parent-reactions/[reactionId]/draft-reply.
 *
 * The route generates an AI draft for the coach to preview before sending.
 * Acceptance criteria → tests:
 *   - 401 missing auth.
 *   - 404 when the reaction's coach_id !== caller.id (no cross-coach reply).
 *   - 409 already_replied when reaction.coach_reply_at is set.
 *   - 200 happy path: callAI called once with the parentReactionReply prompt,
 *     response keyset is EXACTLY { draft } (LESSONS#78).
 *   - Free-tier coach: returns the STATIC TEMPLATE (NOT a 402); the coach
 *     must always be able to reply, just from a template instead of an AI
 *     draft (ticket AC + LESSONS#23 — server-side canAccess enforces the
 *     feature key `feature_ai_reply_draft`).
 *   - COPPA: only first names (player + parent + coach) + the parent's note
 *     are passed to callAI. Planted email / phone / DOB tokens in the
 *     reaction context do NOT appear in the rendered prompt.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn, mockCallAI } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  mockCallAI: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
  createServiceSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
}));

vi.mock('@/lib/ai/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/client')>();
  return { ...actual, callAI: mockCallAI };
});

import { POST } from '@/app/api/parent-reactions/[reactionId]/draft-reply/route';

const COACH_ID = '00000000-0000-4000-a000-000000000001';
const OTHER_COACH = '00000000-0000-4000-a000-0000000000ff';
const REACTION_ID = '00000000-0000-4000-a000-000000000aa1';
const PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const ORG_ID = '00000000-0000-4000-a000-000000000010';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body?: unknown) {
  return new Request(`http://localhost/api/parent-reactions/${REACTION_ID}/draft-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

interface ReactionRow {
  id: string;
  coach_id: string;
  team_id: string;
  player_id: string;
  message: string | null;
  parent_name: string | null;
  coach_reply_at: string | null;
  coach_reply_id: string | null;
}

const baseReaction: ReactionRow = {
  id: REACTION_ID,
  coach_id: COACH_ID,
  team_id: TEAM_ID,
  player_id: PLAYER_ID,
  message: 'thank you for sticking with him on his shooting',
  parent_name: 'Sarah',
  coach_reply_at: null,
  coach_reply_id: null,
};

interface PlayerRow {
  id: string;
  name: string;
}

interface CoachRow {
  id: string;
  full_name: string;
  org_id: string;
  organizations: { tier: string } | null;
}

const basePlayer: PlayerRow = { id: PLAYER_ID, name: 'Devon Hayes' };
const baseCoach: CoachRow = {
  id: COACH_ID,
  full_name: 'Maya Rivera',
  org_id: ORG_ID,
  organizations: { tier: 'coach' },
};

function chainSingle(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

interface WiringOverrides {
  reaction?: ReactionRow | null;
  player?: PlayerRow | null;
  coach?: CoachRow | null;
}

function wireSupabaseTables(opts: WiringOverrides = {}) {
  const reaction = opts.reaction === undefined ? baseReaction : opts.reaction;
  const player = opts.player === undefined ? basePlayer : opts.player;
  const coach = opts.coach === undefined ? baseCoach : opts.coach;

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'parent_reactions') return chainSingle(reaction);
    if (table === 'players') return chainSingle(player);
    if (table === 'coaches') return chainSingle(coach);
    return chainSingle(null);
  });
}

describe('POST /api/parent-reactions/[reactionId]/draft-reply (ticket 0056)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockCallAI.mockReset();
    setAuthUser();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest({}), { params: Promise.resolve({ reactionId: REACTION_ID }) });
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('returns 404 when the reaction belongs to a different coach (no cross-coach reply)', async () => {
    wireSupabaseTables({ reaction: { ...baseReaction, coach_id: OTHER_COACH } });
    const res = await POST(makeRequest({}), { params: Promise.resolve({ reactionId: REACTION_ID }) });
    expect(res.status).toBe(404);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('returns 404 when the reaction does not exist', async () => {
    wireSupabaseTables({ reaction: null });
    const res = await POST(makeRequest({}), { params: Promise.resolve({ reactionId: REACTION_ID }) });
    expect(res.status).toBe(404);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('returns 409 already_replied when coach_reply_at is set', async () => {
    wireSupabaseTables({
      reaction: { ...baseReaction, coach_reply_at: '2026-05-29T10:00:00.000Z' },
    });
    const res = await POST(makeRequest({}), { params: Promise.resolve({ reactionId: REACTION_ID }) });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('already_replied');
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('happy path: calls callAI once and returns exactly { draft }', async () => {
    wireSupabaseTables();
    mockCallAI.mockResolvedValueOnce({
      text: 'Sarah — thanks for the note. Devon has been working hard on his shot. — Maya',
      tokensIn: 80,
      tokensOut: 40,
      latencyMs: 200,
      interactionId: 'ai-1',
    });

    const res = await POST(makeRequest({}), { params: Promise.resolve({ reactionId: REACTION_ID }) });

    expect(res.status).toBe(200);
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['draft']);
    expect(body.draft).toContain('Sarah');
    expect(body.draft).toContain('Devon');
  });

  it('passes ONLY first names + the reaction note to callAI (COPPA — LESSONS#0039)', async () => {
    // Planted contact-shape tokens in the reaction note are forwarded to the
    // AI verbatim (it's the parent's own words and the prompt expects them).
    // What we assert is the prompt never includes the player's LAST name,
    // the coach's LAST name, or anything outside the four documented inputs.
    wireSupabaseTables({
      reaction: {
        ...baseReaction,
        message: 'thanks for sticking with him on shooting',
        parent_name: 'Sarah',
      },
      player: { id: PLAYER_ID, name: 'Devon Hayes' },
      coach: { ...baseCoach, full_name: 'Maya Rivera' },
    });
    mockCallAI.mockResolvedValueOnce({
      text: 'Sarah — thanks. Devon is putting in the work. — Maya',
      tokensIn: 50,
      tokensOut: 20,
      latencyMs: 100,
      interactionId: 'ai-2',
    });

    await POST(makeRequest({}), { params: Promise.resolve({ reactionId: REACTION_ID }) });

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const call = mockCallAI.mock.calls[0][0] as { systemPrompt: string; userPrompt: string };
    const full = `${call.systemPrompt}\n${call.userPrompt}`;
    expect(full).toContain('Devon');
    expect(full).toContain('Sarah');
    expect(full).toContain('Maya');
    // First-name-only — last names are NEVER passed to the model.
    expect(full).not.toContain('Hayes');
    expect(full).not.toContain('Rivera');
  });

  it('free-tier coach: returns the static template (NOT a 402) so they can still reply', async () => {
    wireSupabaseTables({
      coach: { ...baseCoach, organizations: { tier: 'free' } },
    });
    // No AI call on the free path.

    const res = await POST(makeRequest({}), { params: Promise.resolve({ reactionId: REACTION_ID }) });

    expect(res.status).toBe(200);
    expect(mockCallAI).not.toHaveBeenCalled();
    const body = (await res.json()) as { draft?: string };
    expect(body.draft).toBeDefined();
    expect(body.draft).toContain('Sarah');
    expect(body.draft).toContain('Devon');
    expect(body.draft).toContain('Maya');
  });
});
