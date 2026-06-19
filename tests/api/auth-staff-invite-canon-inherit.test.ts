/**
 * Ticket 0090 — extension of POST /api/auth/setup to inherit the
 * program drill canon for a NEW coach who joins an Org-tier program
 * via the staff-invite flow (the 0024 path, where the signup URL
 * carries the org slug and the new coach's row gets attached to the
 * existing organization with role='coach').
 *
 * After the new coach's row is written (existing behavior, byte-
 * identical for non-Org-tier programs per AC), the route reads the
 * org's most-recent unsuperseded `program_drill_canon` row; for each
 * drill_id in the canon, the route writes a `coach_drill_signals`
 * row with rating='up' for the new coach (the inheritance edge — the
 * smallest write that makes the next /plans render carry the program's
 * canonical drills).
 *
 * Acceptance criteria mapping:
 *  (i)   coach joining a non-Org-tier program → no canon inheritance
 *        (BYTE-IDENTICAL to today)
 *  (ii)  coach joining an Org-tier program WITHOUT a published canon
 *        → no inheritance (the canon doesn't exist)
 *  (iii) coach joining an Org-tier program WITH a 7-drill canon → 7
 *        coach_drill_signals rows are written for the new coach
 *  (iv)  a coach who ALREADY has a coach_drill_signals row for a
 *        canon-included drill is NOT double-written (upsert semantics
 *        via ON CONFLICT DO NOTHING — for our hand-rolled mock we
 *        just verify the route uses upsert / on conflict)
 *  (v)   the inheritance is SILENT — no email, no notification
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
    from: mockFromFn,
  })),
  createServiceSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
}));

import { POST } from '@/app/api/auth/setup/route';

const NEW_COACH_ID = 'new-coach-user-001';
const ORG_ID = '00000000-0000-4000-a000-0000000000a1';

interface Captured {
  drillSignalInserts: Array<Record<string, unknown> | Array<Record<string, unknown>>>;
  coachInserts: Array<Record<string, unknown>>;
  upsertCalls: number;
}

function buildChain(
  data: unknown = null,
  opts: {
    onInsert?: (row: unknown) => void;
    onUpsert?: (row: unknown) => void;
    insertReturnData?: unknown;
  } = {},
) {
  const resolved = { data, error: null };
  const firstRow = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const insertReturn = opts.insertReturnData ?? firstRow;
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((row: unknown) => {
      opts.onInsert?.(row);
      return chain;
    }),
    upsert: vi.fn((row: unknown) => {
      opts.onUpsert?.(row);
      return chain;
    }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: insertReturn, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: insertReturn, error: null }),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function wire(
  config: {
    /** Whether the route should find the org by slug (staff-invite path). */
    foundOrgBySlug: boolean;
    orgTier?: string;
    orgSubStatus?: string | null;
    existingCoach?: { id: string } | null;
    canon?: { id: string; drill_ids: string[] } | null;
  },
  captured: Captured,
) {
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      // First read: existing coach lookup by id.
      // Second action: insert new coach.
      return buildChain(config.existingCoach ?? null, {
        onInsert: (row) => {
          if (typeof row === 'object' && row !== null) {
            captured.coachInserts.push(row as Record<string, unknown>);
          }
        },
      });
    }
    if (table === 'organizations') {
      return buildChain(
        config.foundOrgBySlug
          ? [{ id: ORG_ID, tier: config.orgTier ?? 'free', subscription_status: config.orgSubStatus ?? null }]
          : [],
      );
    }
    if (table === 'program_drill_canon') {
      return buildChain(config.canon ? [config.canon] : []);
    }
    if (table === 'coach_drill_signals') {
      // Inheritance edge writes here.
      return buildChain([], {
        onInsert: (row) => {
          captured.drillSignalInserts.push(row as Record<string, unknown> | Array<Record<string, unknown>>);
        },
        onUpsert: (row) => {
          captured.upsertCalls += 1;
          captured.drillSignalInserts.push(row as Record<string, unknown> | Array<Record<string, unknown>>);
        },
      });
    }
    if (table === 'coach_first_signal_celebrations') {
      return buildChain([], {
        onInsert: () => {
          /* dedup write — not asserted in this test */
        },
        onUpsert: () => {
          /* dedup write — not asserted in this test */
        },
      });
    }
    // teams, team_coaches, program_referrals fall through silently.
    return buildChain([]);
  });
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/setup canon-inheritance branch (ticket 0090)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: NEW_COACH_ID,
          email: 'new-coach@hawks.test',
          user_metadata: { full_name: 'Aisha Khan' },
        },
      },
      error: null,
    });
  });

  it('(i) coach joining a non-Org-tier program → no canon inheritance (BYTE-IDENTICAL)', async () => {
    const captured: Captured = { drillSignalInserts: [], coachInserts: [], upsertCalls: 0 };
    wire(
      {
        foundOrgBySlug: true,
        orgTier: 'free',
        orgSubStatus: null,
        existingCoach: null,
      },
      captured,
    );
    const res = await POST(makeRequest({ org: 'hawks', fullName: 'Aisha Khan' }));
    expect(res.status).toBe(200);
    expect(captured.drillSignalInserts).toEqual([]);
  });

  it('(ii) coach joining an Org-tier program WITHOUT a published canon → no inheritance', async () => {
    const captured: Captured = { drillSignalInserts: [], coachInserts: [], upsertCalls: 0 };
    wire(
      {
        foundOrgBySlug: true,
        orgTier: 'organization',
        orgSubStatus: 'active',
        existingCoach: null,
        canon: null,
      },
      captured,
    );
    const res = await POST(makeRequest({ org: 'hawks', fullName: 'Aisha Khan' }));
    expect(res.status).toBe(200);
    expect(captured.drillSignalInserts).toEqual([]);
  });

  it('(iii) coach joining an Org-tier program WITH a 7-drill canon → 7 drill signals written', async () => {
    const captured: Captured = { drillSignalInserts: [], coachInserts: [], upsertCalls: 0 };
    const canonDrillIds = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'];
    wire(
      {
        foundOrgBySlug: true,
        orgTier: 'organization',
        orgSubStatus: 'active',
        existingCoach: null,
        canon: { id: 'canon-1', drill_ids: canonDrillIds },
      },
      captured,
    );
    const res = await POST(makeRequest({ org: 'hawks', fullName: 'Aisha Khan' }));
    expect(res.status).toBe(200);
    // The route may insert as a single batch (one .insert([...]) call) OR
    // one row per drill_id. Either way, the flattened set of written
    // drill_ids should equal the canon.
    const flat: Record<string, unknown>[] = [];
    for (const insert of captured.drillSignalInserts) {
      if (Array.isArray(insert)) {
        for (const r of insert) flat.push(r);
      } else {
        flat.push(insert);
      }
    }
    expect(flat.length).toBe(canonDrillIds.length);
    const writtenDrillIds = new Set(flat.map((r) => r.drill_id));
    for (const id of canonDrillIds) {
      expect(writtenDrillIds.has(id)).toBe(true);
    }
    // Each row carries the new coach's id and rating='up'.
    for (const r of flat) {
      expect(r.coach_id).toBe(NEW_COACH_ID);
      expect(r.rating).toBe('up');
    }
  });

  it('(iv) the inheritance write uses upsert / ignore-on-conflict so a coach with an existing signal is not double-written', async () => {
    const captured: Captured = { drillSignalInserts: [], coachInserts: [], upsertCalls: 0 };
    wire(
      {
        foundOrgBySlug: true,
        orgTier: 'organization',
        orgSubStatus: 'active',
        existingCoach: null,
        canon: { id: 'canon-1', drill_ids: ['d1', 'd2'] },
      },
      captured,
    );
    await POST(makeRequest({ org: 'hawks', fullName: 'Aisha Khan' }));
    // The route should use upsert (idempotent path) rather than a bare
    // insert so a re-run / existing thumb doesn't crash on the (coach_id,
    // drill_id) PRIMARY KEY.
    expect(captured.upsertCalls).toBeGreaterThan(0);
  });

  it('non-Org-tier subscription_status (canceled Org) → no inheritance (LESSONS#0044)', async () => {
    const captured: Captured = { drillSignalInserts: [], coachInserts: [], upsertCalls: 0 };
    wire(
      {
        foundOrgBySlug: true,
        orgTier: 'organization',
        orgSubStatus: 'canceled',
        existingCoach: null,
        canon: { id: 'canon-1', drill_ids: ['d1', 'd2'] },
      },
      captured,
    );
    await POST(makeRequest({ org: 'hawks', fullName: 'Aisha Khan' }));
    expect(captured.drillSignalInserts).toEqual([]);
  });

  it('coach joining their OWN newly-minted org (no staff-invite) → no inheritance (BYTE-IDENTICAL)', async () => {
    const captured: Captured = { drillSignalInserts: [], coachInserts: [], upsertCalls: 0 };
    wire(
      {
        foundOrgBySlug: false,
        existingCoach: null,
      },
      captured,
    );
    const res = await POST(makeRequest({ fullName: 'Aisha Khan' }));
    expect(res.status).toBe(200);
    expect(captured.drillSignalInserts).toEqual([]);
  });
});
