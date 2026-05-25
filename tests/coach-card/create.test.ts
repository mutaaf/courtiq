/**
 * Ticket 0026 — POST /api/coach-card/create
 *
 * The coach-card create route turns the AUTHENTICATED coach's own profile into a
 * public, no-auth referral token at /coach/<token>. Unlike team-card / season-recap
 * (which key off a specific plan the coach owns), this surface is scoped to the
 * coach themselves, so it takes NO planId and is reuse-or-create: a coach has at
 * most one active profile token at a time.
 *
 * These specs assert the auth guard (401, no DB write) and the reuse-or-create
 * idempotency (a second create still yields a usable active token). Strategy
 * mirrors tests/team-card/create.test.ts: the whole @/lib/supabase/server module
 * is replaced with a chainable in-memory mock so the route's real branching logic
 * runs without a database.
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

import { POST as createPost } from '@/app/api/coach-card/create/route';

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
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
  };
  return chain;
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}
function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function req() {
  return new Request('http://localhost/api/coach-card/create', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/coach-card/create', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC: no auth → 401 and no token created (no DB write).
  it('returns 401 when unauthenticated and never touches the share table', async () => {
    setNoAuth();
    const res = await createPost(req());
    expect(res.status).toBe(401);
    // The insert path must never run for an unauthenticated caller.
    expect(mockFromFn).not.toHaveBeenCalledWith('coach_card_shares');
  });

  // AC: authenticated coach with no existing token → 200 { token, url } where url
  // ends in /coach/<token>, and a row is persisted keyed to coaches.id with
  // is_active true.
  it('returns 200 with token + /coach/<token> url and persists an active share row for the caller', async () => {
    setAuthUser('coach-1');
    const insertedShare = {
      id: 'ccs-1',
      token: 'deadbeefdeadbeefdeadbeefdeadbeef',
      coach_id: 'coach-1',
      is_active: true,
    };
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_card_shares') {
        // No existing active row (maybeSingle → null), then the insert resolves.
        const chain = buildChain(null);
        (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: null });
        (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: insertedShare, error: null });
        return chain;
      }
      return buildChain(null);
    });

    const res = await createPost(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.url).toMatch(/\/coach\//);
    expect(body.url.endsWith(`/coach/${body.token}`)).toBe(true);
    // The share table was actually written to and keyed to the caller.
    expect(mockFromFn).toHaveBeenCalledWith('coach_card_shares');
  });

  // AC: idempotent-friendly — a second create for the same coach returns a usable
  // active token (here, by reusing the existing active row) without erroring.
  it('reuses an existing active token on a repeat create (still 200 with a token)', async () => {
    setAuthUser('coach-1');
    const existing = {
      id: 'ccs-existing',
      token: 'cafebabecafebabecafebabecafebabe',
      coach_id: 'coach-1',
      is_active: true,
    };
    let insertCalled = false;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_card_shares') {
        const chain = buildChain(existing);
        (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: existing, error: null });
        (chain.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
          insertCalled = true;
          return chain;
        });
        return chain;
      }
      return buildChain(null);
    });

    const res = await createPost(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    // The repeat call returns the already-active token, not an error.
    expect(body.token).toBe(existing.token);
    expect(body.url).toBe(`/coach/${existing.token}`);
    // It reused rather than minting a second row.
    expect(insertCalled).toBe(false);
  });
});
