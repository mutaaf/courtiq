/**
 * Ticket 0088 — POST /api/home/first-cross-coach-signal/dismiss.
 *
 * The card's "Got it" button calls this route with the kind that was
 * just dismissed; the route UPSERTs a row into
 * coach_first_signal_celebrations so the next /home read sees the
 * kind in alreadyCelebrated and silences the card forever.
 *
 * Acceptance criteria mapping:
 *  (i)   happy path: an authed dismiss writes the row.
 *  (ii)  a second dismiss for the same coach + kind is idempotent
 *        (UNIQUE on (coach_id, kind); the route uses UPSERT).
 *  (iii) unauthed caller → 401.
 *  (iv)  missing kind in the body → 400.
 *  (v)   kind outside the CHECK enum → 400.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
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

import { POST } from '@/app/api/home/first-cross-coach-signal/dismiss/route';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';

function buildUpsertChain() {
  const resolved = { data: null, error: null };
  const c: Record<string, unknown> = {
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return c;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/home/first-cross-coach-signal/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/home/first-cross-coach-signal/dismiss (ticket 0088)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('(iii) unauthed caller → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ kind: 'clone', firedAt: '2026-06-10T12:00:00Z' }));
    expect(res.status).toBe(401);
  });

  it('(iv) missing kind in the body → 400', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const res = await POST(makeRequest({ firedAt: '2026-06-10T12:00:00Z' }));
    expect(res.status).toBe(400);
  });

  it('(v) kind outside the CHECK enum → 400', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const res = await POST(makeRequest({ kind: 'not-a-kind', firedAt: '2026-06-10T12:00:00Z' }));
    expect(res.status).toBe(400);
  });

  it('(i) happy path: an authed dismiss writes the row via UPSERT', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const chain = buildUpsertChain();
    mockFromFn.mockReturnValue(chain);
    const res = await POST(makeRequest({ kind: 'clone', firedAt: '2026-06-10T12:00:00Z' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(chain.upsert).toHaveBeenCalled();
    const upsertArg = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(upsertArg.coach_id).toBe(COACH_ID);
    expect(upsertArg.kind).toBe('clone');
    expect(typeof upsertArg.dismissed_at).toBe('string');
  });

  it('(ii) a second dismiss for the same coach+kind is idempotent (UPSERT-shaped)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    const chain = buildUpsertChain();
    mockFromFn.mockReturnValue(chain);
    await POST(makeRequest({ kind: 'thank', firedAt: '2026-06-05T12:00:00Z' }));
    const res = await POST(makeRequest({ kind: 'thank', firedAt: '2026-06-05T12:00:00Z' }));
    expect(res.status).toBe(200);
    // Verify the upsert pattern uses the unique-key conflict target
    // so a re-dismiss is a no-op rather than a 23505 row error.
    const lastCall = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    const opts = lastCall?.[1] as { onConflict?: string } | undefined;
    expect(opts?.onConflict).toContain('coach_id');
    expect(opts?.onConflict).toContain('kind');
  });

  it('accepts each of the five enum kinds', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    mockFromFn.mockReturnValue(buildUpsertChain());
    for (const kind of [
      'clone',
      'thank',
      'parent_forward',
      'parent_forward_cross_team',
      'reaction_cross_team',
    ]) {
      const res = await POST(makeRequest({ kind, firedAt: '2026-06-05T12:00:00Z' }));
      expect(res.status).toBe(200);
    }
  });
});
