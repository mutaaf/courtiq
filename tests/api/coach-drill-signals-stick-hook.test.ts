/**
 * Ticket 0076 — write-side stick hook on the existing 0044 thumbs-up
 * PATCH endpoint at /api/coach-drill-signals.
 *
 * When the cloning coach thumbs-up a drill they previously cloned, the
 * hook upserts a `drill_clone_stick_signals` row keyed on
 * `(drill_share_id, cloner_coach_id)`. UNIQUE constraint makes repeat
 * thumbs-ups idempotent. A self-thumb (the publisher rating their own
 * drill) NEVER writes a stick row. A thumb-down never writes one.
 *
 * LESSONS#0036 — the hook is best-effort: a stick-row write failure
 * does NOT block the thumb-up path.
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
    from: mockFromFn,
  })),
  createServiceSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
}));

import { PATCH } from '@/app/api/coach-drill-signals/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const CLONER = '00000000-0000-4000-a000-000000000201';
const PUBLISHER = '00000000-0000-4000-a000-000000000202';
const DRILL_X = '00000000-0000-4000-a000-000000000210';
const SHARE_X = '00000000-0000-4000-a000-000000000220';
const CLONER_ORG = '00000000-0000-4000-a000-000000000230';

function setAuthUser(id: string | null) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function patchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/coach-drill-signals', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Queue the existing 0039 upsert chain (the thumbs-up itself) before
 * the new stick-hook reads/writes. The thumbs-up upsert response is
 * the only chain the existing route consumes BEFORE the stick hook
 * fires; everything after it is new.
 */
function queueThumbsUpHappyPath() {
  const upsertChain = buildChain({
    drill_id: DRILL_X,
    rating: 'up',
    run_count: 0,
    last_rated_at: '2026-06-09T20:00:00Z',
  });
  mockFromFn.mockReturnValueOnce(upsertChain);
  return upsertChain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
});

describe('PATCH /api/coach-drill-signals — stick hook (ticket 0076)', () => {
  it('thumb-up on a cloned drill AFTER the clone → one stick row written', async () => {
    setAuthUser(CLONER);
    queueThumbsUpHappyPath();
    // The hook reads drill_share_clones for (cloner_coach_id=caller,
    // drill_id of cloned drill) — finds one clone (cloned 30 days
    // before this thumb), AND the parent drill_share row's drill_id
    // matches. Hook then upserts a drill_clone_stick_signals row.
    //
    // Reads in order:
    //   1. drill_share_clones JOIN drill_shares — find clone rows
    //      for this cloner where the parent share's drill_id ===
    //      thumbed drill_id (the cloned-drill match) and cloned_at
    //      < signaled_at.
    //   2. coaches (cloner's org_id) — used as cloner_org_id on the
    //      stick row.
    //   3. drill_clone_stick_signals UPSERT.
    mockFromFn.mockReturnValueOnce(
      buildChain([
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER,
          cloned_at: '2026-05-09T20:00:00Z',
          drill_shares: {
            id: SHARE_X,
            drill_id: DRILL_X,
            coach_id: PUBLISHER,
          },
        },
      ]),
    );
    // cloner's org lookup.
    mockFromFn.mockReturnValueOnce(buildChain({ id: CLONER, org_id: CLONER_ORG }));
    // stick upsert.
    const stickUpsertChain = buildChain({ id: 'stick-new' });
    mockFromFn.mockReturnValueOnce(stickUpsertChain);

    // The milestone hook is the LAST step on the chain. We queue an
    // empty publisher-plans read so the hook short-circuits without
    // writing a milestone — every test here is about stick rows, not
    // milestones (those have their own test file).
    // 4. publisher's plans for the milestone hook.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 5. publisher's drill_shares.
    mockFromFn.mockReturnValueOnce(buildChain([{ id: SHARE_X, coach_id: PUBLISHER }]));
    // 6. drill_share_clones for milestone hook (uses publisher's shares).
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 7. coaches resolution for cloning org_ids.
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up' }));
    expect(res.status).toBe(200);

    expect(stickUpsertChain.upsert).toHaveBeenCalled();
    const upserted = (stickUpsertChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const row = Array.isArray(upserted) ? upserted[0] : upserted;
    expect(row.drill_share_id).toBe(SHARE_X);
    expect(row.cloner_coach_id).toBe(CLONER);
    expect(row.cloner_org_id).toBe(CLONER_ORG);
  });

  it('thumb-up on a cloned drill BEFORE the clone → no row written (defensive)', async () => {
    setAuthUser(CLONER);
    queueThumbsUpHappyPath();
    // The DB read returns ONE clone row whose cloned_at is AFTER the
    // thumb being recorded. The hook filters this out (signaled_at
    // must be >= cloned_at).
    mockFromFn.mockReturnValueOnce(
      buildChain([
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER,
          // Clone landed AFTER the thumb that's about to be recorded
          // (impossible in production but defensively guarded). The
          // helper's signaled_at >= cloned_at gate must filter it.
          cloned_at: '2099-12-31T20:00:00Z',
          drill_shares: { id: SHARE_X, drill_id: DRILL_X, coach_id: PUBLISHER },
        },
      ]),
    );
    // No further reads should fire if the hook filters cleanly. To
    // be safe queue empty chains for the milestone hook.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up' }));
    expect(res.status).toBe(200);

    // No stick upsert was called (the cloner-org coach read was never
    // queued — confirms the hook short-circuited before write).
    const allCalls = mockFromFn.mock.calls.map((c) => c[0]);
    expect(allCalls).not.toContain('drill_clone_stick_signals');
  });

  it('thumb-up by the publisher on their own drill → no row written (self-thumb filter)', async () => {
    setAuthUser(PUBLISHER);
    queueThumbsUpHappyPath();
    // The clone-lookup returns NO rows for the publisher (a publisher
    // is not in `drill_share_clones` for their own share). The hook
    // therefore writes nothing.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // Milestone hook reads still queued.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up' }));
    expect(res.status).toBe(200);
    const allCalls = mockFromFn.mock.calls.map((c) => c[0]);
    expect(allCalls).not.toContain('drill_clone_stick_signals');
  });

  it('thumb-DOWN on a cloned drill → no row written (only `up` signals are stick signals)', async () => {
    setAuthUser(CLONER);
    queueThumbsUpHappyPath();
    // No further reads are expected — the route MUST short-circuit
    // on rating !== 'up' BEFORE the clone-lookup read. We queue empty
    // chains just to keep the mock queue's length resilient.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'down' }));
    expect(res.status).toBe(200);
    const allCalls = mockFromFn.mock.calls.map((c) => c[0]);
    expect(allCalls).not.toContain('drill_clone_stick_signals');
  });

  it('duplicate thumb-up (re-tap) on the same cloned drill → idempotent (UPSERT on UNIQUE key)', async () => {
    setAuthUser(CLONER);
    queueThumbsUpHappyPath();
    mockFromFn.mockReturnValueOnce(
      buildChain([
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER,
          cloned_at: '2026-05-09T20:00:00Z',
          drill_shares: { id: SHARE_X, drill_id: DRILL_X, coach_id: PUBLISHER },
        },
      ]),
    );
    mockFromFn.mockReturnValueOnce(buildChain({ id: CLONER, org_id: CLONER_ORG }));
    const stickUpsertChain = buildChain({ id: 'stick-existing' });
    mockFromFn.mockReturnValueOnce(stickUpsertChain);
    // Milestone hook reads.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([{ id: SHARE_X, coach_id: PUBLISHER }]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up' }));
    expect(res.status).toBe(200);

    // Route uses UPSERT with onConflict to make the second tap a no-op
    // structurally — the test just asserts upsert was called with the
    // correct onConflict tuple.
    expect(stickUpsertChain.upsert).toHaveBeenCalled();
    const upsertOpts = (stickUpsertChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][1] as
      | { onConflict?: string }
      | undefined;
    expect(upsertOpts?.onConflict).toContain('drill_share_id');
    expect(upsertOpts?.onConflict).toContain('cloner_coach_id');
  });

  it('best-effort: a stick-row write failure still returns 200 on the thumb-up path', async () => {
    setAuthUser(CLONER);
    queueThumbsUpHappyPath();
    // The clone-lookup throws — the hook MUST swallow and return 200
    // on the upstream thumb-up path.
    mockFromFn.mockReturnValueOnce(buildChain(null, new Error('boom')));
    // Milestone hook empty reads.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up' }));
    expect(res.status).toBe(200);
  });
});
