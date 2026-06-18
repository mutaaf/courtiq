/**
 * Ticket 0090 — POST /api/admin/program-drill-canon/publish.
 *
 * The director taps "Publish as <Org name> drill canon" on the admin
 * card; that button POSTs THIS route with the eligible drillIds. The
 * route writes a NEW `program_drill_canon` row (superseding any prior
 * unsuperseded canon for the same org) so every new coach joining
 * the program post-publish inherits these drill ids on day one.
 *
 * Acceptance criteria mapping (from the ticket):
 *  (i)   director on Org-tier org → publish succeeds (200, returns
 *        the new canon id)
 *  (ii)  re-publish supersedes prior canon (one active at a time)
 *  (iii) drillId not in the eligible canon set → 400 (defensive)
 *  (iv)  non-director caller → 403
 *  (v)   Coach-tier org → 403
 *  (vi)  unauthed → 401
 *  (vii) the inserted row carries the publishing coach_id correctly
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

import { POST } from '@/app/api/admin/program-drill-canon/publish/route';

const DIRECTOR_ID = '00000000-0000-4000-a000-0000000000d1';
const ORG_ID = '00000000-0000-4000-a000-0000000000a1';
const COACH_C2 = '00000000-0000-4000-a000-0000000000c2';
const COACH_C3 = '00000000-0000-4000-a000-0000000000c3';

// Capture inserts + updates for assertion.
type InsertCall = { table: string; row: Record<string, unknown> };
type UpdateCall = { table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> };

function chain<T = unknown>(
  data: T | null = null,
  opts: {
    onInsert?: (row: Record<string, unknown>) => void;
    onUpdate?: (patch: Record<string, unknown>, filters: Array<[string, unknown]>) => void;
    insertReturn?: unknown;
  } = {},
) {
  const resolved = { data, error: null };
  const firstRow = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const resolvedSingle = { data: firstRow, error: null };
  const filterCalls: Array<[string, unknown]> = [];
  const c: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      filterCalls.push([col, val]);
      return c;
    }),
    in: vi.fn().mockReturnThis(),
    is: vi.fn((col: string, val: unknown) => {
      filterCalls.push([col, val]);
      return c;
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedSingle),
    single: vi.fn().mockResolvedValue({ data: opts.insertReturn ?? firstRow, error: null }),
    insert: vi.fn((row: Record<string, unknown>) => {
      opts.onInsert?.(row);
      return c;
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      opts.onUpdate?.(patch, filterCalls);
      return c;
    }),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return c;
}

function makeReq(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/program-drill-canon/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface WireConfig {
  coaches?: Array<{ id: string; org_id: string; full_name: string; role: string }>;
  org?: { id: string; tier: string; subscription_status: string; name?: string } | null;
  drillSignals?: Array<{ coach_id: string; drill_id: string; rating?: string }>;
  drills?: Array<{ id: string; name: string; sport_id: string; age_groups: string[] }>;
  existingCanons?: Array<{ id: string; org_id: string; superseded_at: string | null }>;
}

function wireForPublish(
  config: WireConfig,
  captured: { inserts: InsertCall[]; updates: UpdateCall[] },
  newCanonId = 'new-canon-1',
) {
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      return chain(config.coaches ?? []);
    }
    if (table === 'organizations') {
      return chain(config.org ? [config.org] : []);
    }
    if (table === 'coach_drill_signals') {
      return chain(config.drillSignals ?? []);
    }
    if (table === 'drills') {
      return chain(config.drills ?? []);
    }
    if (table === 'program_drill_canon') {
      return chain(config.existingCanons ?? [], {
        onInsert: (row) => captured.inserts.push({ table, row }),
        onUpdate: (patch, filters) => captured.updates.push({ table, patch, filters }),
        insertReturn: {
          id: newCanonId,
          org_id: (config.org?.id ?? ORG_ID) as string,
          drill_ids: [],
          published_at: new Date().toISOString(),
          superseded_at: null,
        },
      });
    }
    return chain([]);
  });
}

describe('POST /api/admin/program-drill-canon/publish (ticket 0090)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: DIRECTOR_ID } } });
  });

  it('(vi) unauthed caller → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ orgId: ORG_ID, drillIds: ['d1'] }));
    expect(res.status).toBe(401);
  });

  it('(iv) non-director caller → 403', async () => {
    wireForPublish(
      {
        coaches: [{ id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'coach' }],
        org: { id: ORG_ID, tier: 'organization', subscription_status: 'active' },
      },
      { inserts: [], updates: [] },
    );
    const res = await POST(makeReq({ orgId: ORG_ID, drillIds: ['d1'] }));
    expect(res.status).toBe(403);
  });

  it('(v) Coach-tier org → 403', async () => {
    wireForPublish(
      {
        coaches: [{ id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'admin' }],
        org: { id: ORG_ID, tier: 'coach', subscription_status: 'active' },
      },
      { inserts: [], updates: [] },
    );
    const res = await POST(makeReq({ orgId: ORG_ID, drillIds: ['d1'] }));
    expect(res.status).toBe(403);
  });

  it('(v) Org-tier canceled subscription → 403 (LESSONS#0044)', async () => {
    wireForPublish(
      {
        coaches: [{ id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'admin' }],
        org: { id: ORG_ID, tier: 'organization', subscription_status: 'canceled' },
      },
      { inserts: [], updates: [] },
    );
    const res = await POST(makeReq({ orgId: ORG_ID, drillIds: ['d1'] }));
    expect(res.status).toBe(403);
  });

  it('(i) director on Org-tier org → publish succeeds (200)', async () => {
    const captured = { inserts: [] as InsertCall[], updates: [] as UpdateCall[] };
    wireForPublish(
      {
        coaches: [
          { id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya Patel', role: 'admin' },
          { id: COACH_C2, org_id: ORG_ID, full_name: 'Maya Walker', role: 'coach' },
          { id: COACH_C3, org_id: ORG_ID, full_name: 'James Park', role: 'coach' },
        ],
        org: { id: ORG_ID, tier: 'organization', subscription_status: 'active', name: 'Hawks' },
        drillSignals: [
          { coach_id: DIRECTOR_ID, drill_id: 'd1', rating: 'up' },
          { coach_id: COACH_C2, drill_id: 'd1', rating: 'up' },
          { coach_id: COACH_C3, drill_id: 'd1', rating: 'up' },
        ],
        drills: [{ id: 'd1', name: 'Closeout', sport_id: 'basketball', age_groups: ['8-10'] }],
      },
      captured,
    );
    const res = await POST(makeReq({ orgId: ORG_ID, drillIds: ['d1'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.canonId).toBeDefined();
    expect(captured.inserts).toHaveLength(1);
    expect(captured.inserts[0].table).toBe('program_drill_canon');
    expect(captured.inserts[0].row.org_id).toBe(ORG_ID);
    expect(captured.inserts[0].row.published_by_coach_id).toBe(DIRECTOR_ID);
    expect(captured.inserts[0].row.drill_ids).toEqual(['d1']);
  });

  it('(ii) re-publish supersedes prior canon (one active at a time)', async () => {
    const captured = { inserts: [] as InsertCall[], updates: [] as UpdateCall[] };
    wireForPublish(
      {
        coaches: [
          { id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'admin' },
          { id: COACH_C2, org_id: ORG_ID, full_name: 'Maya', role: 'coach' },
          { id: COACH_C3, org_id: ORG_ID, full_name: 'James', role: 'coach' },
        ],
        org: { id: ORG_ID, tier: 'organization', subscription_status: 'active' },
        drillSignals: [
          { coach_id: DIRECTOR_ID, drill_id: 'd1', rating: 'up' },
          { coach_id: COACH_C2, drill_id: 'd1', rating: 'up' },
          { coach_id: COACH_C3, drill_id: 'd1', rating: 'up' },
        ],
        drills: [{ id: 'd1', name: 'Closeout', sport_id: 'basketball', age_groups: ['8-10'] }],
        existingCanons: [
          { id: 'prior-canon', org_id: ORG_ID, superseded_at: null },
        ],
      },
      captured,
    );
    const res = await POST(makeReq({ orgId: ORG_ID, drillIds: ['d1'] }));
    expect(res.status).toBe(200);
    // The route must issue an UPDATE on prior unsuperseded rows setting
    // superseded_at to a non-null timestamp.
    const supersedeUpdate = captured.updates.find(
      (u) => u.table === 'program_drill_canon' && 'superseded_at' in u.patch,
    );
    expect(supersedeUpdate).toBeDefined();
    expect(supersedeUpdate!.patch.superseded_at).toBeTruthy();
    // And then a new canon insert.
    expect(captured.inserts).toHaveLength(1);
  });

  it('(iii) drillId not in the eligible canon set → 400 (defensive)', async () => {
    const captured = { inserts: [] as InsertCall[], updates: [] as UpdateCall[] };
    wireForPublish(
      {
        coaches: [
          { id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'admin' },
          { id: COACH_C2, org_id: ORG_ID, full_name: 'Maya', role: 'coach' },
          { id: COACH_C3, org_id: ORG_ID, full_name: 'James', role: 'coach' },
        ],
        org: { id: ORG_ID, tier: 'organization', subscription_status: 'active' },
        // Eligible canon contains 'd1' only. The caller posts 'd-bogus'.
        drillSignals: [
          { coach_id: DIRECTOR_ID, drill_id: 'd1', rating: 'up' },
          { coach_id: COACH_C2, drill_id: 'd1', rating: 'up' },
          { coach_id: COACH_C3, drill_id: 'd1', rating: 'up' },
        ],
        drills: [{ id: 'd1', name: 'Closeout', sport_id: 'basketball', age_groups: ['8-10'] }],
      },
      captured,
    );
    const res = await POST(makeReq({ orgId: ORG_ID, drillIds: ['d-bogus'] }));
    expect(res.status).toBe(400);
    expect(captured.inserts).toHaveLength(0);
  });

  it('(vii) the inserted row carries the publishing coach_id correctly', async () => {
    const captured = { inserts: [] as InsertCall[], updates: [] as UpdateCall[] };
    wireForPublish(
      {
        coaches: [
          { id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'admin' },
          { id: COACH_C2, org_id: ORG_ID, full_name: 'Maya', role: 'coach' },
          { id: COACH_C3, org_id: ORG_ID, full_name: 'James', role: 'coach' },
        ],
        org: { id: ORG_ID, tier: 'organization', subscription_status: 'active' },
        drillSignals: [
          { coach_id: DIRECTOR_ID, drill_id: 'd1', rating: 'up' },
          { coach_id: COACH_C2, drill_id: 'd1', rating: 'up' },
          { coach_id: COACH_C3, drill_id: 'd1', rating: 'up' },
        ],
        drills: [{ id: 'd1', name: 'Closeout', sport_id: 'basketball', age_groups: ['8-10'] }],
      },
      captured,
    );
    await POST(makeReq({ orgId: ORG_ID, drillIds: ['d1'] }));
    expect(captured.inserts[0].row.published_by_coach_id).toBe(DIRECTOR_ID);
  });

  it('rejects an empty drillIds array → 400', async () => {
    wireForPublish(
      {
        coaches: [{ id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'admin' }],
        org: { id: ORG_ID, tier: 'organization', subscription_status: 'active' },
      },
      { inserts: [], updates: [] },
    );
    const res = await POST(makeReq({ orgId: ORG_ID, drillIds: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects a cross-org orgId (caller can only publish their own org canon)', async () => {
    wireForPublish(
      {
        coaches: [{ id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'admin' }],
        org: { id: ORG_ID, tier: 'organization', subscription_status: 'active' },
      },
      { inserts: [], updates: [] },
    );
    const res = await POST(
      makeReq({ orgId: '00000000-0000-4000-a000-0000000000a9', drillIds: ['d1'] }),
    );
    expect(res.status).toBe(403);
  });
});
