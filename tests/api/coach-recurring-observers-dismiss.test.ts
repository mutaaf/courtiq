/**
 * Ticket 0092 — POST /api/coach/recurring-observers/dismiss.
 *
 * Acceptance criteria mapping:
 *  (i)   authed dismiss succeeds and UPSERTs the row.
 *  (ii)  re-dismiss is idempotent (UPSERT on the composite key).
 *  (iii) unauthed → 401.
 *  (iv)  missing helperIdentifier or teamId → 400.
 *
 * Coverage of "post-dismiss GET excludes the dismissed helper-team
 * pair for 30 days" lives in the GET route's `(iv)` scenario which
 * already plants a dismissals row and asserts the response shape.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockUpsertFn, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpsertFn: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { POST } from '@/app/api/coach/recurring-observers/dismiss/route';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';
const TEAM_A = '00000000-0000-4000-a000-0000000000ta';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/coach/recurring-observers/dismiss', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/coach/recurring-observers/dismiss (ticket 0092)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockUpsertFn.mockReset();
    mockUpsertFn.mockResolvedValue({ data: null, error: null });
    mockFromFn.mockImplementation(() => ({
      upsert: mockUpsertFn,
    }));
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
  });

  it('(iii) unauthed → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      makeRequest({ helperIdentifier: 'aisha', teamId: TEAM_A }),
    );
    expect(res.status).toBe(401);
  });

  it('(iv) missing helperIdentifier → 400', async () => {
    const res = await POST(makeRequest({ teamId: TEAM_A }));
    expect(res.status).toBe(400);
  });

  it('(iv) missing teamId → 400', async () => {
    const res = await POST(makeRequest({ helperIdentifier: 'aisha' }));
    expect(res.status).toBe(400);
  });

  it('(i) authed dismiss succeeds and UPSERTs the row', async () => {
    const res = await POST(
      makeRequest({ helperIdentifier: 'aisha', teamId: TEAM_A }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockFromFn).toHaveBeenCalledWith('recurring_observer_dismissals');
    expect(mockUpsertFn).toHaveBeenCalledTimes(1);
    const [payload, options] = mockUpsertFn.mock.calls[0];
    expect(payload).toMatchObject({
      coach_id: COACH_ID,
      helper_identifier: 'aisha',
      team_id: TEAM_A,
    });
    expect(payload.dismissed_at).toBeDefined();
    expect(options).toMatchObject({
      onConflict: 'coach_id,helper_identifier,team_id',
    });
  });

  it('(ii) re-dismiss is idempotent (same UPSERT call shape)', async () => {
    await POST(makeRequest({ helperIdentifier: 'aisha', teamId: TEAM_A }));
    await POST(makeRequest({ helperIdentifier: 'aisha', teamId: TEAM_A }));
    expect(mockUpsertFn).toHaveBeenCalledTimes(2);
    const opts1 = mockUpsertFn.mock.calls[0][1];
    const opts2 = mockUpsertFn.mock.calls[1][1];
    expect(opts1).toEqual(opts2);
  });

  it('upstream upsert error → 500 with error message', async () => {
    mockUpsertFn.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const res = await POST(
      makeRequest({ helperIdentifier: 'aisha', teamId: TEAM_A }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('db down');
  });

  it('trims whitespace on helperIdentifier and teamId', async () => {
    const res = await POST(
      makeRequest({
        helperIdentifier: '  aisha  ',
        teamId: `  ${TEAM_A}  `,
      }),
    );
    expect(res.status).toBe(200);
    const [payload] = mockUpsertFn.mock.calls[0];
    expect(payload.helper_identifier).toBe('aisha');
    expect(payload.team_id).toBe(TEAM_A);
  });
});
