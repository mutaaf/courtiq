/**
 * Ticket 0014 — Capture carryover strip: show last practice's focus areas.
 *
 * Tests the GET /api/capture/carryover route.
 *
 * Strategy mirrors tests/ai/weekly-star.test.ts: @/lib/supabase/server is replaced
 * with a chainable in-memory mock so the route runs without a real DB connection.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes spec files. See docs/LESSONS.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
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

import { GET } from '@/app/api/capture/carryover/route';

// ─── Chainable mock helpers ─────────────────────────────────────────────────────

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

function makeRequest(teamId?: string) {
  const url = teamId
    ? `http://localhost/api/capture/carryover?teamId=${teamId}`
    : 'http://localhost/api/capture/carryover';
  return new Request(url);
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/capture/carryover', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    setNoAuth();
    const res = await GET(makeRequest('team-1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 and performs no DB read when unauthenticated', async () => {
    setNoAuth();
    await GET(makeRequest('team-1'));
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 200 { focus: [] } when teamId is missing', async () => {
    setAuthUser();
    mockFromFn.mockReturnValue(buildChain({ org_id: 'org-1' }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).toEqual([]);
  });

  it('returns 200 { focus: [] } for a team with no sessions', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' })) // coaches
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' })) // teams
      .mockReturnValueOnce(buildChain([])); // sessions — empty
    const res = await GET(makeRequest('team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).toEqual([]);
  });

  it('returns 200 { focus: [] } for team with sessions but no debrief', async () => {
    setAuthUser();
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain([])); // no session with debrief
    const res = await GET(makeRequest('team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).toEqual([]);
  });

  it('returns focus strings from most recent debriefed session', async () => {
    setAuthUser();
    const session = {
      id: 'session-1',
      date: '2026-05-20',
      type: 'practice',
      coach_debrief_extracts: {
        next_practice_focus: [
          { focus: 'closeouts', rationale: '...', suggested_drill: '...' },
          { focus: 'weak-hand finishing', rationale: '...', suggested_drill: '...' },
        ],
      },
    };
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain([session]));
    const res = await GET(makeRequest('team-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).toEqual(['closeouts', 'weak-hand finishing']);
    expect(body.sessionDate).toBe('2026-05-20');
    expect(body.sessionType).toBe('practice');
  });

  it('slices focus to max 3 even when debrief has more', async () => {
    setAuthUser();
    const session = {
      id: 'session-2',
      date: '2026-05-19',
      type: 'practice',
      coach_debrief_extracts: {
        next_practice_focus: [
          { focus: 'A', rationale: '', suggested_drill: '' },
          { focus: 'B', rationale: '', suggested_drill: '' },
          { focus: 'C', rationale: '', suggested_drill: '' },
          { focus: 'D', rationale: '', suggested_drill: '' },
          { focus: 'E', rationale: '', suggested_drill: '' },
        ],
      },
    };
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain([session]));
    const res = await GET(makeRequest('team-1'));
    const body = await res.json();
    expect(body.focus).toHaveLength(3);
    expect(body.focus).toEqual(['A', 'B', 'C']);
  });

  it('returns { focus: [] } for a teamId belonging to another org (cross-org safety)', async () => {
    setAuthUser('coach-x');
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-mine' })) // coach's org
      .mockReturnValueOnce(buildChain({ org_id: 'org-other' })); // team belongs to different org
    const res = await GET(makeRequest('team-other'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus).toEqual([]);
    // Must NOT proceed to query sessions for a non-owned team
    expect(mockFromFn).toHaveBeenCalledTimes(2);
  });

  it('returns { focus: [] } when next_practice_focus is absent from debrief', async () => {
    setAuthUser();
    const session = {
      id: 'session-3',
      date: '2026-05-18',
      type: 'practice',
      coach_debrief_extracts: { session_summary: 'good practice' },
    };
    mockFromFn
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain({ org_id: 'org-1' }))
      .mockReturnValueOnce(buildChain([session]));
    const res = await GET(makeRequest('team-1'));
    const body = await res.json();
    expect(body.focus).toEqual([]);
  });
});
