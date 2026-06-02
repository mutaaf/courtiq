/**
 * Ticket 0063 — DELETE /api/coach-follows/[followeeId].
 *
 * The caller dissolves their follow edge. Idempotent: no row → 200 with
 * { wasFollowing: false }. With a row → 200 with { wasFollowing: true } and
 * the row gone.
 *
 * Acceptance criteria → tests:
 *  - 401 unauthed.
 *  - 200 + delete when the row exists.
 *  - 200 idempotent when no row exists.
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

import { DELETE } from '@/app/api/coach-follows/[followeeId]/route';

interface BuildChainOpts {
  selectData?: unknown;
  deleteData?: unknown;
  deleteError?: unknown;
}

/**
 * Thenable chain that supports `.delete().eq().eq()` followed by `await`
 * (the chain object stays the same across `.eq()` calls; the final await
 * resolves to { data, error }).
 */
function buildChain(opts: BuildChainOpts = {}) {
  const { selectData = null, deleteData = null, deleteError = null } = opts;
  const selectResolved = { data: selectData, error: null };
  const deleteResolved = { data: deleteData, error: deleteError };
  let mode: 'select' | 'delete' = 'select';

  const chain: Record<string, unknown> = {
    select: vi.fn(() => {
      mode = 'select';
      return chain;
    }),
    delete: vi.fn(() => {
      mode = 'delete';
      return chain;
    }),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => selectResolved),
    single: vi.fn(async () => selectResolved),
    then: (onFulfilled: (v: unknown) => unknown) => {
      const resolved = mode === 'delete' ? deleteResolved : selectResolved;
      return Promise.resolve(resolved).then(onFulfilled);
    },
  };
  return chain;
}

const FOLLOWER_ID = 'follower-coach-id';
const FOLLOWEE_ID = 'followee-coach-id';

function setAuthUser(id: string | null = FOLLOWER_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request(`http://localhost/api/coach-follows/${FOLLOWEE_ID}`, { method: 'DELETE' });
}

function makeContext() {
  return { params: Promise.resolve({ followeeId: FOLLOWEE_ID }) };
}

describe('DELETE /api/coach-follows/[followeeId] (ticket 0063)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('deletes the existing follow row and returns { wasFollowing: true }', async () => {
    setAuthUser();

    // Chain order:
    //   1) lookup existing row → present
    //   2) delete the row → ok
    const lookupChain = buildChain({
      selectData: { id: 'row-1', follower_id: FOLLOWER_ID, followee_id: FOLLOWEE_ID },
    });
    const deleteChain = buildChain({ deleteData: null });
    mockFromFn.mockReturnValueOnce(lookupChain).mockReturnValueOnce(deleteChain);

    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; wasFollowing?: boolean };
    expect(body.ok).toBe(true);
    expect(body.wasFollowing).toBe(true);

    expect(deleteChain.delete).toHaveBeenCalledTimes(1);
  });

  it('idempotent: returns 200 with { wasFollowing: false } when no row exists', async () => {
    setAuthUser();

    const lookupChain = buildChain({ selectData: null });
    mockFromFn.mockReturnValueOnce(lookupChain);

    const res = await DELETE(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; wasFollowing?: boolean };
    expect(body.ok).toBe(true);
    expect(body.wasFollowing).toBe(false);
  });
});
