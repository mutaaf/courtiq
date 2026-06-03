/**
 * Ticket 0064 — POST /api/drill-shares/create.
 *
 * Turn ONE drill the caller chose into a public, no-auth share token a peer
 * coach can tap to clone into their own favorites library. The public page
 * at /drill/[token] renders the drill name + setup + caption.
 *
 * Acceptance criteria → tests:
 *  - 401 when there is no authenticated user (before any DB read).
 *  - 400 when drillId is missing.
 *  - 404 when the drill does not exist.
 *  - 400 when the caption is longer than 240 characters.
 *  - 400 { reason: 'voice', field: 'caption' } when the caption contains a
 *    banned word (LESSONS#0023 — render-time scan on coach-typed text).
 *  - 200 happy path: returns { token, url, caption, alreadyPublished:false }
 *    and inserts a drill_shares row with the same token.
 *  - 200 idempotent re-publish with a different caption updates the same row
 *    (same token), alreadyPublished:true.
 *
 * Mocking pattern mirrors tests/api/practice-plan-shares-create.test.ts
 * byte-for-byte where applicable. .test.ts NOT .spec.ts (LESSONS#38). Free
 * for every tier — the route does NOT import tier.ts (a publish gate would
 * invert the network effect).
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

import { POST } from '@/app/api/drill-shares/create/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
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
const DRILL_ID = 'drill-uuid-1';

const DRILL = {
  id: DRILL_ID,
  name: 'Closeout Drill',
  setup_instructions: 'Players close out on the shooter from the elbow.',
};

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body: unknown = { drillId: DRILL_ID }) {
  return new Request('http://localhost/api/drill-shares/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/drill-shares/create (ticket 0064)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when drillId is missing', async () => {
    setAuthUser();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the drill does not exist', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 400 when the caption is longer than 240 characters', async () => {
    setAuthUser();
    const drillChain = buildChain(DRILL);
    mockFromFn.mockReturnValueOnce(drillChain);
    const longCaption = 'a'.repeat(241);
    const res = await POST(makeRequest({ drillId: DRILL_ID, caption: longCaption }));
    expect(res.status).toBe(400);
  });

  it("returns 400 { reason: 'voice', field: 'caption' } on a banned word", async () => {
    setAuthUser();
    const drillChain = buildChain(DRILL);
    mockFromFn.mockReturnValueOnce(drillChain);
    // 'amazing' is in the AGENTS.md banned list.
    const res = await POST(
      makeRequest({ drillId: DRILL_ID, caption: 'this drill was amazing for my team' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string; field?: string };
    expect(body.reason).toBe('voice');
    expect(body.field).toBe('caption');
  });

  it('happy path returns { token, url, caption, alreadyPublished:false } and inserts a row', async () => {
    setAuthUser();
    const drillChain = buildChain(DRILL);
    const existingChain = buildChain(null); // no existing row
    const insertedChain = buildChain({
      id: 'share-1',
      coach_id: COACH_ID,
      drill_id: DRILL_ID,
      share_token: 'deadbeef',
      caption: 'Finally got my U10s to finish their closeouts.',
      is_active: true,
    });
    mockFromFn
      .mockReturnValueOnce(drillChain) // drill lookup
      .mockReturnValueOnce(existingChain) // drill_shares (idempotency lookup)
      .mockReturnValueOnce(insertedChain); // insert

    const res = await POST(
      makeRequest({
        drillId: DRILL_ID,
        caption: 'Finally got my U10s to finish their closeouts.',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token?: string;
      url?: string;
      caption?: string;
      alreadyPublished?: boolean;
    };
    expect(typeof body.token).toBe('string');
    expect(body.token!.length).toBeGreaterThan(0);
    expect(body.url).toBe(`/drill/${body.token}`);
    expect(body.caption).toBe('Finally got my U10s to finish their closeouts.');
    expect(body.alreadyPublished).toBe(false);
  });

  it('idempotent re-publish updates caption + reuses token, alreadyPublished:true', async () => {
    setAuthUser();
    const drillChain = buildChain(DRILL);
    const existingChain = buildChain({
      id: 'share-existing',
      coach_id: COACH_ID,
      drill_id: DRILL_ID,
      share_token: 'existing-token-abc',
      caption: 'old caption',
      is_active: true,
    });
    const updatedChain = buildChain({
      id: 'share-existing',
      coach_id: COACH_ID,
      drill_id: DRILL_ID,
      share_token: 'existing-token-abc',
      caption: 'new caption that finally landed',
      is_active: true,
    });
    mockFromFn
      .mockReturnValueOnce(drillChain) // drill lookup
      .mockReturnValueOnce(existingChain) // drill_shares (idempotency)
      .mockReturnValueOnce(updatedChain); // update

    const res = await POST(
      makeRequest({
        drillId: DRILL_ID,
        caption: 'new caption that finally landed',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token?: string;
      url?: string;
      caption?: string;
      alreadyPublished?: boolean;
    };
    expect(body.token).toBe('existing-token-abc');
    expect(body.url).toBe('/drill/existing-token-abc');
    expect(body.caption).toBe('new caption that finally landed');
    expect(body.alreadyPublished).toBe(true);
  });

  it('idempotent re-publish on an UNPUBLISHED share flips is_active=true + reuses token', async () => {
    setAuthUser();
    const drillChain = buildChain(DRILL);
    const existingChain = buildChain({
      id: 'share-existing',
      coach_id: COACH_ID,
      drill_id: DRILL_ID,
      share_token: 'existing-token-abc',
      caption: 'old caption',
      is_active: false, // unpublished — re-publish should flip it on
    });
    const updatedChain = buildChain({
      id: 'share-existing',
      coach_id: COACH_ID,
      drill_id: DRILL_ID,
      share_token: 'existing-token-abc',
      caption: 'old caption',
      is_active: true,
    });
    mockFromFn
      .mockReturnValueOnce(drillChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(updatedChain);

    const res = await POST(makeRequest({ drillId: DRILL_ID }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string; alreadyPublished?: boolean };
    expect(body.token).toBe('existing-token-abc');
    expect(body.alreadyPublished).toBe(true);
  });
});
