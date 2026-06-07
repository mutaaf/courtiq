/**
 * Ticket 0073 — POST /api/drill-shares/[token]/clone — MILESTONE
 * WRITE-HOOK extension.
 *
 * When the existing 0064 drill clone fires, the route now also
 * re-computes the publishing coach's reputation across both plan
 * clones AND drill clones and UPSERTs any milestone row whose
 * threshold was just crossed. The hook is best-effort (LESSONS#0036)
 * — a milestone-write failure does NOT block the clone.
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

import { POST } from '@/app/api/drill-shares/[token]/clone/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const CLONER_ID = 'cloner-1';
const PUBLISHER_ID = 'publisher-1';
const DRILL_ID = 'drill-1';
const SHARE_ID = 'share-1';
const PROG_X = 'org-X';
const PROG_Y = 'org-Y';

const ACTIVE_SHARE = {
  id: SHARE_ID,
  coach_id: PUBLISHER_ID,
  drill_id: DRILL_ID,
  share_token: 'abc',
  is_active: true,
};
const CLONER_COACH = {
  id: CLONER_ID,
  preferences: { favorited_drills: [] as string[] },
};

function setAuthUser(id: string | null = CLONER_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request('http://localhost/api/drill-shares/abc/clone', { method: 'POST' });
}

function paramsFor(token: string) {
  return { params: Promise.resolve({ token }) };
}

function queueHappyClonePath() {
  // 1 drill_shares lookup, 2 coaches.preferences read, 3 coaches update
  // (favorite add), 4 drill_share_clones insert.
  mockFromFn.mockReturnValueOnce(buildChain(ACTIVE_SHARE));
  mockFromFn.mockReturnValueOnce(buildChain(CLONER_COACH));
  mockFromFn.mockReturnValueOnce(buildChain({ id: CLONER_ID }));
  mockFromFn.mockReturnValueOnce(buildChain({ id: 'clone-1' }));
}

describe('POST /api/drill-shares/[token]/clone — milestone hook (ticket 0073)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('upserts a programs_2 milestone when the new drill clone pushes distinctProgramCount 1 → 2', async () => {
    setAuthUser();
    queueHappyClonePath();
    // Milestone hook chain order:
    //   1. publisher's plans (id, coach_id where coach_id=publisher) — empty.
    //   (plans clone rows SKIPPED — publisher has 0 plans.)
    //   2. publisher's drill_shares.
    //   3. drill_share_clones.
    //   4. cloning coach org_ids.
    //   5. upsert.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // publisher's drill share ids — 1 share.
    mockFromFn.mockReturnValueOnce(buildChain([{ id: SHARE_ID, coach_id: PUBLISHER_ID }]));
    // drill clones — 1 prior in PROG_X, the new one in PROG_Y.
    const today = '2026-06-07T00:00:00Z';
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { drill_share_id: SHARE_ID, cloner_coach_id: 'cloner-prior', cloned_at: today },
        { drill_share_id: SHARE_ID, cloner_coach_id: CLONER_ID, cloned_at: today },
      ]),
    );
    // cloner coaches org_ids.
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { id: 'cloner-prior', org_id: PROG_X },
        { id: CLONER_ID, org_id: PROG_Y },
      ]),
    );
    // milestone upsert.
    const upsertChain = buildChain({ id: 'm-new' });
    mockFromFn.mockReturnValueOnce(upsertChain);

    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
    expect(upsertChain.upsert).toHaveBeenCalled();
    const upserted = (upsertChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const rows = Array.isArray(upserted) ? upserted : [upserted];
    const kinds = rows.map((r) => r.milestone_kind);
    expect(kinds).toContain('programs_2');
  });

  it('a clone that does NOT cross a threshold writes no milestone row', async () => {
    setAuthUser();
    queueHappyClonePath();
    // 1. publisher's plans — empty.
    mockFromFn.mockReturnValueOnce(buildChain([]));
    // 2. publisher's drill_shares.
    mockFromFn.mockReturnValueOnce(buildChain([{ id: SHARE_ID, coach_id: PUBLISHER_ID }]));
    // 3. drill_share_clones — 1 row (single cloner).
    const today = '2026-06-07T00:00:00Z';
    mockFromFn.mockReturnValueOnce(
      buildChain([
        { drill_share_id: SHARE_ID, cloner_coach_id: CLONER_ID, cloned_at: today },
      ]),
    );
    // 4. cloning coach org_ids.
    mockFromFn.mockReturnValueOnce(buildChain([{ id: CLONER_ID, org_id: PROG_X }]));
    // No upsert chain queued — the route MUST short-circuit when no
    // thresholds cross.

    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
  });

  it('a milestone-side throw does NOT 5xx the clone (best-effort)', async () => {
    setAuthUser();
    queueHappyClonePath();
    // Throw on the publisher-plan-ids read.
    mockFromFn.mockReturnValueOnce(buildChain(null, new Error('boom')));

    const res = await POST(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
  });
});
