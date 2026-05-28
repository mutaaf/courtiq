/**
 * Ticket 0054 — GET /api/coach-handle/available?handle=<h>
 *
 * Returns { available: boolean, reason: 'taken'|'reserved'|'invalid'|null }.
 * Auth required (401 on missing user). The response NEVER reveals which coach
 * holds a taken handle — the keyset is exactly { available, reason }.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
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

import { GET } from '@/app/api/coach-handle/available/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
  };
  return chain;
}

const COACH_ID = '00000000-0000-4000-a000-000000000aaa';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(handle: string | null) {
  const url = new URL('http://localhost/api/coach-handle/available');
  if (handle !== null) url.searchParams.set('handle', handle);
  return new Request(url.toString(), { method: 'GET' });
}

describe('GET /api/coach-handle/available (ticket 0054)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await GET(makeRequest('sarah-rodriguez'));
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns available=false reason=reserved on a reserved handle (and never queries coaches)', async () => {
    setAuthUser();
    const res = await GET(makeRequest('admin'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'reserved' });
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns available=false reason=invalid on a malformed handle (and never queries coaches)', async () => {
    setAuthUser();
    const res = await GET(makeRequest('SARAH ROD!'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'invalid' });
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns available=false reason=invalid when the handle param is missing or empty', async () => {
    setAuthUser();
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'invalid' });
  });

  it('returns available=true reason=null on a fresh handle (no row found)', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await GET(makeRequest('sarah-rodriguez'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: true, reason: null });
  });

  it('returns available=false reason=taken when another coach holds the handle', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain({ id: 'other-coach' }));
    const res = await GET(makeRequest('sarah-rodriguez'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: 'taken' });
  });

  it('response payload keyset is exactly { available, reason } — no coach_id / coach_name leak', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain({ id: 'other-coach', full_name: 'Sarah Rodriguez' }));
    const res = await GET(makeRequest('sarah-rodriguez'));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['available', 'reason']);
  });
});
