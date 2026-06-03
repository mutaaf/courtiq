/**
 * Ticket 0064 — GET /api/drill-shares/mine.
 *
 * Returns the caller's own published drills + per-share clone counts. Used
 * by the new "Drills I have published" panel on the authed coach-profile
 * dashboard page; the existing public /coach/<handle> profile is
 * BYTE-IDENTICAL (this list lives only on the AUTHED surface).
 *
 * Acceptance criteria → tests:
 *  - 401 unauthed.
 *  - 200 happy path returns a list of { token, drillId, drillName, caption,
 *    publishedAt, isActive, cloneCount } scoped to the caller.
 *  - 200 empty list for a caller who has no shares.
 *  - Includes BOTH active and inactive (the publisher needs to see and
 *    re-activate their unpublished drills).
 *
 * Mocking pattern mirrors tests/api/practice-plan-shares-create.test.ts.
 * .test.ts NOT .spec.ts (LESSONS#38). The route reads no body; it takes
 * zero handler params (LESSONS#0055).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { GET } from '@/app/api/drill-shares/mine/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-1';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

describe('GET /api/drill-shares/mine (ticket 0064)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 + an empty list when the caller has no shares', async () => {
    setAuthUser();
    const sharesChain = buildChain([]);
    mockFromFn.mockReturnValueOnce(sharesChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shares?: unknown[] };
    expect(Array.isArray(body.shares)).toBe(true);
    expect(body.shares!.length).toBe(0);
  });

  it('returns the caller\'s shares with cloneCount + drillName + isActive', async () => {
    setAuthUser();
    const sharesChain = buildChain([
      {
        id: 'share-1',
        coach_id: COACH_ID,
        drill_id: 'drill-a',
        share_token: 'tok-a',
        caption: 'this one finally worked',
        is_active: true,
        created_at: '2026-06-01T00:00:00Z',
      },
      {
        id: 'share-2',
        coach_id: COACH_ID,
        drill_id: 'drill-b',
        share_token: 'tok-b',
        caption: null,
        is_active: false,
        created_at: '2026-05-25T00:00:00Z',
      },
    ]);
    const drillsChain = buildChain([
      { id: 'drill-a', name: 'Closeout Drill' },
      { id: 'drill-b', name: 'Box-Out Drill' },
    ]);
    const cloneCountsChain = buildChain([
      { drill_share_id: 'share-1' },
      { drill_share_id: 'share-1' },
      { drill_share_id: 'share-1' },
      { drill_share_id: 'share-2' },
    ]);
    mockFromFn
      .mockReturnValueOnce(sharesChain) // drill_shares for coach
      .mockReturnValueOnce(drillsChain) // drills.in(id, ids)
      .mockReturnValueOnce(cloneCountsChain); // drill_share_clones rollup

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shares: Array<{
        token: string;
        drillId: string;
        drillName: string;
        caption: string | null;
        publishedAt: string;
        isActive: boolean;
        cloneCount: number;
      }>;
    };

    expect(body.shares.length).toBe(2);

    const a = body.shares.find((s) => s.token === 'tok-a')!;
    expect(a.drillName).toBe('Closeout Drill');
    expect(a.caption).toBe('this one finally worked');
    expect(a.isActive).toBe(true);
    expect(a.cloneCount).toBe(3);

    const b = body.shares.find((s) => s.token === 'tok-b')!;
    expect(b.drillName).toBe('Box-Out Drill');
    expect(b.caption).toBeNull();
    expect(b.isActive).toBe(false);
    expect(b.cloneCount).toBe(1);
  });
});
