/**
 * Ticket 0091 — POST /api/admin/sport-pulse-opt-out.
 *
 * The /admin (director) surface mounts <SportPulseOptOutToggle />;
 * that toggle POSTs THIS route with `{ orgId, optedOut }`. The route
 * (a) validates the caller is the director on the org (LESSONS#0087 —
 * `coaches.role === 'admin'`), and (b) writes
 * `organizations.opted_out_of_sport_pulse = <optedOut>`.
 *
 * The POST is a FREE affordance: every director can opt their program
 * out regardless of tier — privacy trumps growth.
 *
 * Acceptance criteria mapping (from the ticket):
 *  (i)   director toggles opt-out true → succeeds, row updated
 *  (ii)  director toggles back false → succeeds
 *  (iii) non-director caller → 403
 *  (iv)  cross-org caller → 403
 *  (v)   unauthed → 401
 *
 * .test.ts NOT .spec.ts (LESSONS#0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn, capturedUpdates } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  capturedUpdates: { last: undefined as { table: string; values: unknown } | undefined },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { POST } from '@/app/api/admin/sport-pulse-opt-out/route';

const DIRECTOR_ID = '00000000-0000-4000-a000-0000000000d1';
const ORG_ID = '00000000-0000-4000-a000-0000000000a1';
const OTHER_ORG_ID = '00000000-0000-4000-a000-0000000000a2';

function chain<T = unknown>(data: T | null = null, opts: { tableName?: string } = {}) {
  const resolved = { data, error: null };
  const firstRow = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const c: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn(function (this: unknown, values: unknown) {
      if (opts.tableName) {
        capturedUpdates.last = { table: opts.tableName, values };
      }
      return c;
    }),
    insert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: firstRow, error: null }),
    single: vi.fn().mockResolvedValue({ data: firstRow, error: null }),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return c;
}

function makeReq(body: { orgId?: string; optedOut?: boolean }): Request {
  return new Request('http://localhost/api/admin/sport-pulse-opt-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/sport-pulse-opt-out (ticket 0091)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    capturedUpdates.last = undefined;
    mockGetUser.mockResolvedValue({ data: { user: { id: DIRECTOR_ID } } });
  });

  it('(v) unauthed caller → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ orgId: ORG_ID, optedOut: true }));
    expect(res.status).toBe(401);
  });

  it('(iii) non-director caller → 403', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([{ id: DIRECTOR_ID, org_id: ORG_ID, role: 'coach' }]);
      }
      return chain([], { tableName: table });
    });
    const res = await POST(makeReq({ orgId: ORG_ID, optedOut: true }));
    expect(res.status).toBe(403);
  });

  it('(iv) cross-org caller → 403', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([{ id: DIRECTOR_ID, org_id: OTHER_ORG_ID, role: 'admin' }]);
      }
      return chain([], { tableName: table });
    });
    const res = await POST(makeReq({ orgId: ORG_ID, optedOut: true }));
    expect(res.status).toBe(403);
  });

  it('(i) director toggles opt-out true → succeeds, row updated', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([{ id: DIRECTOR_ID, org_id: ORG_ID, role: 'admin' }]);
      }
      if (table === 'organizations') {
        return chain([{ id: ORG_ID, opted_out_of_sport_pulse: false }], { tableName: 'organizations' });
      }
      return chain([], { tableName: table });
    });
    const res = await POST(makeReq({ orgId: ORG_ID, optedOut: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.optedOut).toBe(true);
    expect(capturedUpdates.last?.table).toBe('organizations');
    expect((capturedUpdates.last?.values as { opted_out_of_sport_pulse: boolean }).opted_out_of_sport_pulse).toBe(true);
  });

  it('(ii) director toggles back false → succeeds', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([{ id: DIRECTOR_ID, org_id: ORG_ID, role: 'admin' }]);
      }
      if (table === 'organizations') {
        return chain([{ id: ORG_ID, opted_out_of_sport_pulse: true }], { tableName: 'organizations' });
      }
      return chain([], { tableName: table });
    });
    const res = await POST(makeReq({ orgId: ORG_ID, optedOut: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.optedOut).toBe(false);
    expect((capturedUpdates.last?.values as { opted_out_of_sport_pulse: boolean }).opted_out_of_sport_pulse).toBe(false);
  });

  it('missing orgId or optedOut → 400', async () => {
    mockFromFn.mockImplementation(() => chain([]));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });
});
