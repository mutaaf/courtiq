/**
 * Ticket 0073 — GET /api/coach/reputation-milestones.
 *
 * Returns the authed coach's unconsumed milestones from the last 14
 * days, joined with the publishing-coach's most-recent plan title +
 * a recent cloning program name when one is derivable. Asserts:
 *  - 401 on unauthed.
 *  - 200 with the milestone rows when the caller has unconsumed
 *    rows.
 *  - 200 with an empty array when the caller has none.
 *  - Notified-and-consumed (notified_at IS NOT NULL) milestones are
 *    excluded.
 *  - The response payload contains NO cloning-coach name (only the
 *    cloning PROGRAM name is acceptable on this surface per the
 *    ticket's consent posture).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET } from '@/app/api/coach/reputation-milestones/route';

function buildChain<T = unknown>(data: T | null = null, error: unknown = null) {
  const resolved = { data, error };
  const selectCalls: string[] = [];
  const chain: Record<string, unknown> = {
    select: vi.fn((sel: string) => {
      selectCalls.push(sel);
      return chain;
    }),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
    _selectCalls: selectCalls,
  };
  return chain;
}

const COACH_ID = '00000000-0000-4000-a000-0000000000b1';

describe('GET /api/coach/reputation-milestones (ticket 0073)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when no user is authed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with the caller unconsumed milestones', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const milestoneRows = [
      {
        id: 'm-1',
        milestone_kind: 'programs_2',
        crossed_at: '2026-06-06T00:00:00Z',
        notified_at: null,
      },
      {
        id: 'm-2',
        milestone_kind: 'clones_10',
        crossed_at: '2026-06-05T00:00:00Z',
        notified_at: null,
      },
    ];
    mockFromFn.mockReturnValueOnce(buildChain(milestoneRows));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { milestones: Array<Record<string, unknown>> };
    expect(body.milestones).toHaveLength(2);
    expect(body.milestones[0].kind).toBe('programs_2');
    expect(body.milestones[1].kind).toBe('clones_10');
  });

  it('returns an empty array when the caller has no unconsumed milestones', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    mockFromFn.mockReturnValueOnce(buildChain([]));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.milestones).toEqual([]);
  });

  it('filters notified milestones via .is(notified_at, null)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const chain = buildChain([]);
    mockFromFn.mockReturnValueOnce(chain);
    await GET();
    const isCalls = (chain.is as { mock: { calls: unknown[][] } }).mock.calls;
    expect(isCalls.some((c) => c[0] === 'notified_at' && c[1] === null)).toBe(true);
  });

  it('the response contains NO cloning-coach name or email field', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const milestoneRows = [
      {
        id: 'm-1',
        milestone_kind: 'programs_2',
        crossed_at: '2026-06-06T00:00:00Z',
        notified_at: null,
      },
    ];
    mockFromFn.mockReturnValueOnce(buildChain(milestoneRows));
    const res = await GET();
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/parent_email/);
    expect(json).not.toMatch(/full_name/);
    expect(json).not.toMatch(/cloningCoachName/);
    expect(json).not.toMatch(/@/);
  });
});
