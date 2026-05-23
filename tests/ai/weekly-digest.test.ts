/**
 * Ticket 0023 — POST /api/ai/weekly-digest: the coach-private "your week in
 * coaching" recap built from the last 7 days of a team's observations.
 *
 * Backend behaviours under test (one per acceptance-criteria box):
 *  (A) authenticated coach + { teamId } → 200 with a structured digest
 *      (week_summary string, top_players[], next_action) built from the last 7
 *      days of that team's observations; the call goes through callAIWithJSON
 *      with the resolved orgId so quota + provider routing apply.
 *  (B) below the observation threshold (0–2 weekly obs) → 200 { digest: null }
 *      with NO AI call.
 *  (C) no auth → 401 and no DB read.
 *  (D) team-scoped: a teamId the caller's org does not own → 404 and the team's
 *      observations are never read.
 *  (E) tier enforcement is server-side: free → 403, coach → 200.
 *  (F) COPPA: the prompt is fed only existing observation text + player first
 *      names the coach already entered; no new minor-scoped field is introduced.
 *
 * Strategy mirrors tests/ai/weekly-star.test.ts: @/lib/supabase/server is a
 * chainable in-memory mock; @/lib/ai/client's callAIWithJSON is mocked.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (reserved for
 * Playwright). See docs/LESSONS.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser, mockFromFn, mockCallAIWithJSON, mockBuildAIContext } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockFromFn: vi.fn(),
    mockCallAIWithJSON: vi.fn(),
    mockBuildAIContext: vi.fn(),
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

vi.mock('@/lib/ai/client', () => ({
  callAIWithJSON: mockCallAIWithJSON,
}));

vi.mock('@/lib/ai/context-builder', () => ({
  buildAIContext: mockBuildAIContext,
}));

import { POST as weeklyDigestPost } from '@/app/api/ai/weekly-digest/route';

// ─── Chainable mock helpers (mirror weekly-star.test.ts) ─────────────────────────

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

/** A week of positive/needs-work observations across two players. */
function weekOfObs() {
  return [
    { id: 'o1', player_id: 'p-maya', category: 'Defense', sentiment: 'positive', text: 'Great closeouts all night', created_at: new Date(now - 4 * day).toISOString(), players: { name: 'Maya Lopez' } },
    { id: 'o2', player_id: 'p-maya', category: 'Effort', sentiment: 'positive', text: 'First one back on defense every possession', created_at: new Date(now - 3 * day).toISOString(), players: { name: 'Maya Lopez' } },
    { id: 'o3', player_id: 'p-maya', category: 'Offense', sentiment: 'needs-work', text: 'Rushed the open shot a few times', created_at: new Date(now - 2 * day).toISOString(), players: { name: 'Maya Lopez' } },
    { id: 'o4', player_id: 'p-devon', category: 'IQ', sentiment: 'positive', text: 'Read the help defense well', created_at: new Date(now - 2 * day).toISOString(), players: { name: 'Devon Pierce' } },
    { id: 'o5', player_id: 'p-devon', category: 'Offense', sentiment: 'positive', text: 'Strong finish at the rim', created_at: new Date(now - 1 * day).toISOString(), players: { name: 'Devon Pierce' } },
  ];
}

/** The digest shape callAIWithJSON resolves to in the happy path. */
function digestResult() {
  return {
    parsed: {
      week_summary: 'Two practices, 5 notes. The team brought real defensive energy.',
      top_players: [
        { player_name: 'Maya', note: 'Locked down on defense and led the hustle.' },
        { player_name: 'Devon', note: 'Read the help defense and finished strong.' },
      ],
      next_action: {
        label: "Send Maya's parents her report",
        kind: 'parent_report',
        rationale: "It has been three weeks since Maya's family got an update.",
      },
    },
    interactionId: 'ai-int-digest-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildAIContext.mockResolvedValue({ teamName: 'Wildcats', sportName: 'basketball', ageGroup: '11-13', seasonWeek: 4 });
});

function makeRequest(teamId: unknown = 'team-1') {
  return new Request('http://localhost/api/ai/weekly-digest', {
    method: 'POST',
    body: JSON.stringify({ teamId }),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── C. No auth → 401, no DB read ───────────────────────────────────────────────

describe('POST /api/ai/weekly-digest — auth', () => {
  it('returns 401 and performs no DB read when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await weeklyDigestPost(makeRequest());

    expect(res.status).toBe(401);
    // No DB read attempted before the auth gate.
    expect(mockFromFn).not.toHaveBeenCalled();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── E. Tier enforcement is server-side ─────────────────────────────────────────

describe('POST /api/ai/weekly-digest — tier gate', () => {
  it('returns 403 for a free coach and makes no AI call', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'free' } });
      return buildChain(null);
    });

    const res = await weeklyDigestPost(makeRequest());

    expect(res.status).toBe(403);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns 200 for a coach-tier coach (gate passes)', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      if (table === 'observations') return buildChain(weekOfObs());
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(digestResult());

    const res = await weeklyDigestPost(makeRequest());

    expect(res.status).toBe(200);
  });
});

// ─── D. Team-scoped: cross-org teamId → 404, no obs read for that team ───────────

describe('POST /api/ai/weekly-digest — team ownership', () => {
  it('returns 404 for a teamId the caller org does not own and never reads its observations', async () => {
    setAuthUser('coach-1');
    let observationsRead = false;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      // The team belongs to a DIFFERENT org.
      if (table === 'teams') return buildChain({ id: 'team-other', org_id: 'org-999' });
      if (table === 'observations') {
        observationsRead = true;
        return buildChain(weekOfObs());
      }
      return buildChain(null);
    });

    const res = await weeklyDigestPost(makeRequest('team-other'));

    expect(res.status).toBe(404);
    expect(observationsRead).toBe(false);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── B. Below threshold → 200 { digest: null }, no AI call ───────────────────────

describe('POST /api/ai/weekly-digest — below observation threshold', () => {
  it('returns 200 { digest: null } and makes NO AI call when fewer than 3 weekly observations', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      // Only two observations this week — below the threshold.
      if (table === 'observations') return buildChain([
        { id: 'o1', player_id: 'p-maya', category: 'Defense', sentiment: 'positive', text: 'Nice closeout', created_at: new Date(now - 1 * day).toISOString(), players: { name: 'Maya Lopez' } },
        { id: 'o2', player_id: 'p-maya', category: 'Effort', sentiment: 'positive', text: 'Hustled back', created_at: new Date(now - 1 * day).toISOString(), players: { name: 'Maya Lopez' } },
      ]);
      return buildChain(null);
    });

    const res = await weeklyDigestPost(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.digest).toBeNull();
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });
});

// ─── A + F. Happy path: structured digest via callAIWithJSON with orgId ──────────

describe('POST /api/ai/weekly-digest — happy path', () => {
  it('returns 200 with a structured digest built from the last 7 days of observations', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      if (table === 'observations') return buildChain(weekOfObs());
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(digestResult());

    const res = await weeklyDigestPost(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.digest).not.toBeNull();
    expect(typeof body.digest.week_summary).toBe('string');
    expect(Array.isArray(body.digest.top_players)).toBe(true);
    expect(body.digest.next_action.kind).toBe('parent_report');
  });

  it('routes through callAIWithJSON with the resolved orgId and interactionType custom', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-42', organizations: { tier: 'pro_coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-42' });
      if (table === 'observations') return buildChain(weekOfObs());
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(digestResult());

    await weeklyDigestPost(makeRequest());

    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
    const callArgs = mockCallAIWithJSON.mock.calls[0][0];
    expect(callArgs.orgId).toBe('org-42');
    expect(callArgs.interactionType).toBe('custom');
    expect(callArgs.teamId).toBe('team-1');
    expect(callArgs.coachId).toBe('coach-1');
  });

  it('COPPA: the prompt is fed only existing observation text + player names — never a last name beyond what the coach entered, no new fields', async () => {
    setAuthUser('coach-1');
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain({ org_id: 'org-1', organizations: { tier: 'coach' } });
      if (table === 'teams') return buildChain({ id: 'team-1', org_id: 'org-1' });
      if (table === 'observations') return buildChain(weekOfObs());
      return buildChain(null);
    });
    mockCallAIWithJSON.mockResolvedValue(digestResult());

    await weeklyDigestPost(makeRequest());

    const callArgs = mockCallAIWithJSON.mock.calls[0][0];
    const promptText = `${callArgs.systemPrompt}\n${callArgs.userPrompt}`;
    // The prompt carries the observation text the coach already entered…
    expect(promptText).toContain('Great closeouts all night');
    // …and player names from the coach's own observations.
    expect(promptText).toContain('Maya');
    // It must NOT carry any field we do not collect on a minor (e.g. a fabricated
    // birthdate / address / email). The prompt is built only from obs + names.
    expect(promptText).not.toMatch(/birthdate|address|email|phone/i);
  });
});
