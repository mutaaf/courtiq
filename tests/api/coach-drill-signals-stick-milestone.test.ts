/**
 * Ticket 0076 — when a stick-signal write pushes the publishing coach's
 * stuckCloneCount across 1 / 3 / 8, fire the corresponding
 * `stuck_1 / stuck_3 / stuck_8` milestone row via the existing 0073
 * milestone hook.
 *
 * The existing 0073 `clones_3 / programs_2` etc. milestones still
 * fire on the clone-route hook (covered by
 * `tests/api/practice-plan-clone-reputation.test.ts` and
 * `tests/api/drill-share-clone-reputation.test.ts`); this file pins
 * the NEW stuck-kind milestones that fire from the thumbs-up hook.
 *
 * LESSONS#0036 — milestone-row write failure is best-effort and
 * never blocks the upstream thumb-up.
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

describe('PATCH /api/coach-drill-signals — stuck-milestone hook (ticket 0076)', () => {
  it('stuck_1: a stick signal that pushes stuckCloneCount from 0 to 1 → stuck_1 milestone row', async () => {
    setAuthUser(CLONER);
    queueThumbsUpHappyPath();
    // Stick-hook reads:
    //   1. drill_share_clones JOIN drill_shares — one clone for this cloner.
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
    //   2. coaches (cloner org).
    mockFromFn.mockReturnValueOnce(buildChain({ id: CLONER, org_id: CLONER_ORG }));
    //   3. stick UPSERT.
    mockFromFn.mockReturnValueOnce(buildChain({ id: 'stick-new' }));
    // Milestone-hook reads (existing 0073 chain + the NEW stick rollup):
    //   4. publisher plans → empty.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    //   5. publisher drill_shares → the one share.
    mockFromFn.mockReturnValueOnce(buildChain([{ id: SHARE_X, coach_id: PUBLISHER }]));
    //   6. drill_share_clones (existing).
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { drill_share_id: SHARE_X, cloner_coach_id: CLONER, cloned_at: '2026-05-09T20:00:00Z' },
      ]),
    );
    //   7. coaches batch read for cloning org_ids.
    mockFromFn.mockReturnValueOnce(
      buildChain([{ id: CLONER, org_id: CLONER_ORG }]),
    );
    //   8. drill_clone_stick_signals read — exactly ONE stuck row
    //      (the one we just wrote at step 3).
    mockFromFn.mockReturnValueOnce(
      buildChain([
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER,
          cloner_org_id: CLONER_ORG,
          stuck_at: '2026-06-09T20:00:00Z',
        },
      ]),
    );
    //   9. milestone UPSERT.
    const milestoneUpsertChain = buildChain({ id: 'm-stuck-1' });
    mockFromFn.mockReturnValueOnce(milestoneUpsertChain);

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up' }));
    expect(res.status).toBe(200);

    expect(milestoneUpsertChain.upsert).toHaveBeenCalled();
    const upserted = (milestoneUpsertChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const rows = Array.isArray(upserted) ? upserted : [upserted];
    const kinds = rows.map((r) => r.milestone_kind);
    expect(kinds).toContain('stuck_1');
  });

  it('stuck_3: a stick signal that pushes stuckCloneCount from 2 to 3 → stuck_3 milestone row', async () => {
    setAuthUser(CLONER);
    queueThumbsUpHappyPath();
    // Stick-hook reads (same shape).
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
    mockFromFn.mockReturnValueOnce(buildChain({ id: 'stick-new' }));
    // Milestone-hook reads.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([{ id: SHARE_X, coach_id: PUBLISHER }]));
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { drill_share_id: SHARE_X, cloner_coach_id: 'c-prior-1', cloned_at: '2026-05-01T00:00:00Z' },
        { drill_share_id: SHARE_X, cloner_coach_id: 'c-prior-2', cloned_at: '2026-05-05T00:00:00Z' },
        { drill_share_id: SHARE_X, cloner_coach_id: CLONER, cloned_at: '2026-05-09T20:00:00Z' },
      ]),
    );
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { id: 'c-prior-1', org_id: 'org-prior-1' },
        { id: 'c-prior-2', org_id: 'org-prior-2' },
        { id: CLONER, org_id: CLONER_ORG },
      ]),
    );
    // drill_clone_stick_signals returns 3 rows (the existing 2 + the new one).
    mockFromFn.mockReturnValueOnce(
      buildChain([
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: 'c-prior-1',
          cloner_org_id: 'org-prior-1',
          stuck_at: '2026-05-10T00:00:00Z',
        },
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: 'c-prior-2',
          cloner_org_id: 'org-prior-2',
          stuck_at: '2026-05-20T00:00:00Z',
        },
        {
          drill_share_id: SHARE_X,
          cloner_coach_id: CLONER,
          cloner_org_id: CLONER_ORG,
          stuck_at: '2026-06-09T20:00:00Z',
        },
      ]),
    );
    const milestoneUpsertChain = buildChain({ id: 'm-stuck-3' });
    mockFromFn.mockReturnValueOnce(milestoneUpsertChain);

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up' }));
    expect(res.status).toBe(200);

    expect(milestoneUpsertChain.upsert).toHaveBeenCalled();
    const upserted = (milestoneUpsertChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const rows = Array.isArray(upserted) ? upserted : [upserted];
    const kinds = rows.map((r) => r.milestone_kind);
    expect(kinds).toContain('stuck_3');
    // stuck_1 ALSO fires because the upsert is idempotent — it just
    // gets a no-op on the existing row.
    expect(kinds).toContain('stuck_1');
  });

  it('best-effort: a milestone write failure still returns 200 on the thumb-up path', async () => {
    setAuthUser(CLONER);
    queueThumbsUpHappyPath();
    // Stick-hook OK.
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
    mockFromFn.mockReturnValueOnce(buildChain({ id: 'stick-new' }));
    // Milestone-hook throws on first read.
    mockFromFn.mockReturnValueOnce(buildChain(null, new Error('milestone boom')));
    // Trail empty chains in case the hook crashes downstream.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));
    mockFromFn.mockReturnValueOnce(buildChain([]));

    const res = await PATCH(patchRequest({ drill_id: DRILL_X, rating: 'up' }));
    expect(res.status).toBe(200);
  });
});
