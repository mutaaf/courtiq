/**
 * Ticket 0054 — POST /api/coach-handle/claim
 *
 * Accepts { handle: string }, validates server-side, and on success persists
 * the caller's coaches.handle. v1 is one-time claim:
 *   - 401: missing auth.
 *   - 400: invalid shape or reserved handle.
 *   - 409 already_claimed: the caller's handle is already set.
 *   - 409 taken: another coach already holds this handle (unique violation).
 *   - 200 { handle }: success.
 * The route NEVER trusts a client-supplied id — only the AUTHED caller's row
 * is written (same pattern as LESSONS#0039).
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

import { POST } from '@/app/api/coach-handle/claim/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
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

function makeRequest(body?: unknown) {
  return new Request('http://localhost/api/coach-handle/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

describe('POST /api/coach-handle/claim (ticket 0054)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest({ handle: 'sarah-rodriguez' }));
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when the handle shape is invalid (and never touches coaches)', async () => {
    setAuthUser();
    const res = await POST(makeRequest({ handle: 'SARAH ROD!' }));
    expect(res.status).toBe(400);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when the handle is reserved', async () => {
    setAuthUser();
    const res = await POST(makeRequest({ handle: 'admin' }));
    expect(res.status).toBe(400);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is missing or malformed', async () => {
    setAuthUser();
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it('returns 409 already_claimed when the caller already has a handle', async () => {
    setAuthUser();
    // 1) caller -> select handle -> already 'sarah-r'
    mockFromFn.mockReturnValueOnce(buildChain({ handle: 'sarah-r' }));
    const res = await POST(makeRequest({ handle: 'sarah-rodriguez' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('already_claimed');
  });

  it('writes coaches.handle on the happy path and returns 200 { handle }', async () => {
    setAuthUser();
    // 1) caller select handle -> null
    const callerChain = buildChain({ handle: null });
    // 2) update success
    const updateChain = buildChain(null);
    mockFromFn.mockReturnValueOnce(callerChain).mockReturnValueOnce(updateChain);

    const res = await POST(makeRequest({ handle: 'sarah-rodriguez' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handle).toBe('sarah-rodriguez');

    // The update payload set the handle on the AUTHED caller's row only.
    const updateArg = (updateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateArg).toEqual({ handle: 'sarah-rodriguez' });
    const eqCalls = (updateChain.eq as ReturnType<typeof vi.fn>).mock.calls;
    const eqOnId = eqCalls.find(([col]) => String(col) === 'id');
    expect(eqOnId?.[1]).toBe(COACH_ID);
  });

  it('returns 409 taken on a concurrent unique-constraint violation (SQLSTATE 23505)', async () => {
    setAuthUser();
    const callerChain = buildChain({ handle: null });
    // Postgres unique-violation surfaces as { code: '23505' } via supabase-js.
    const updateChain = buildChain(null, { code: '23505', message: 'duplicate key value' });
    mockFromFn.mockReturnValueOnce(callerChain).mockReturnValueOnce(updateChain);

    const res = await POST(makeRequest({ handle: 'sarah-rodriguez' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('taken');
  });

  it('never accepts a client-supplied coach id — the eq() is always on the authed user', async () => {
    setAuthUser();
    const callerChain = buildChain({ handle: null });
    const updateChain = buildChain(null);
    mockFromFn.mockReturnValueOnce(callerChain).mockReturnValueOnce(updateChain);

    // A forged coach_id in the body MUST be ignored.
    const res = await POST(makeRequest({ handle: 'sarah-rodriguez', coach_id: 'forged-other-coach' }));
    expect(res.status).toBe(200);

    const eqCalls = (updateChain.eq as ReturnType<typeof vi.fn>).mock.calls;
    const idCall = eqCalls.find(([col]) => String(col) === 'id');
    expect(idCall?.[1]).toBe(COACH_ID);
    expect(idCall?.[1]).not.toBe('forged-other-coach');
  });
});
