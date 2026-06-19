/**
 * Ticket 0091 — sport-pulse named-program notification.
 *
 * When the GET /api/sport-wide-convergence route resolves an eligible
 * payload AND the calling director's own program is in the named list,
 * the route writes a row to `coach_first_signal_celebrations` with
 * `kind: 'sport_pulse_named'`. The existing 0088 first-cross-coach-
 * signal card surfaces this as ONE more variant.
 *
 * Idempotent: the UNIQUE (coach_id, kind) constraint on the
 * celebrations table makes duplicate inserts a no-op, so the same
 * director firing the named pulse again in a subsequent week never
 * writes a second row (LESSONS#0088 schema).
 *
 * Acceptance criteria mapping (from the ticket):
 *  (i)   director's program is in `namedPrograms` for the first time
 *        → celebration row written
 *  (ii)  same program named again → idempotent (no second row)
 *  (iii) opted-out program is NEVER named in celebration (the opt-out
 *        is honored upstream by the helper)
 *
 * .test.ts NOT .spec.ts (LESSONS#0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn, capturedInserts } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  capturedInserts: { rows: [] as Array<{ table: string; values: unknown }> },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET } from '@/app/api/sport-wide-convergence/route';

const DIRECTOR_ID = '00000000-0000-4000-a000-0000000000d1';
const NON_DIRECTOR_ID = '00000000-0000-4000-a000-0000000000c1';
const ORG_ID = 'org-0000';
const SPORT_ID = '00000000-0000-4000-a000-0000000000b1';
const SKILL_ID = 'closeouts';

function chain<T extends Record<string, unknown>>(
  rows: T[] | null = null,
  opts: { inFilterField?: keyof T; tableName?: string; insertResult?: { error: unknown } } = {},
) {
  let resolvedRows: T[] = Array.isArray(rows) ? [...rows] : [];
  let inFilter: { field: string; values: unknown[] } | null = null;
  const c: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn(function (this: unknown, field: string, values: unknown[]) {
      inFilter = { field, values };
      return c;
    }),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn(async function (this: unknown, values: unknown) {
      if (opts.tableName) {
        capturedInserts.rows.push({ table: opts.tableName, values });
      }
      // Honor the simulated insert result (e.g. unique-violation error).
      if (opts.insertResult) {
        return opts.insertResult;
      }
      return { error: null };
    }),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => {
      const filtered = applyInFilter(resolvedRows, inFilter, opts.inFilterField);
      return { data: filtered[0] ?? null, error: null };
    }),
    single: vi.fn(async () => {
      const filtered = applyInFilter(resolvedRows, inFilter, opts.inFilterField);
      return { data: filtered[0] ?? null, error: null };
    }),
    then: (onFulfilled: (v: { data: T[]; error: null }) => unknown) => {
      const filtered = applyInFilter(resolvedRows, inFilter, opts.inFilterField);
      return Promise.resolve({ data: filtered, error: null }).then(onFulfilled);
    },
  };
  return c;
}

function applyInFilter<T extends Record<string, unknown>>(
  rows: T[],
  inFilter: { field: string; values: unknown[] } | null,
  inFilterField: keyof T | undefined,
): T[] {
  if (!inFilter || !inFilterField) return rows;
  if (inFilter.field !== inFilterField) return rows;
  const valueSet = new Set(inFilter.values);
  return rows.filter((r) => valueSet.has(r[inFilterField]));
}

function makeReq(): Request {
  const url = new URL('http://localhost/api/sport-wide-convergence');
  url.searchParams.set('skillId', SKILL_ID);
  url.searchParams.set('sportId', SPORT_ID);
  return new Request(url.toString());
}

function setupEligibleNamedProgram(opts: {
  callerId: string;
  callerRole: 'admin' | 'coach';
  callerOrgId: string;
  optedOutOrgs?: string[];
  insertResult?: { error: unknown };
}) {
  const NUM_PROGRAMS = 25;
  const programs = Array.from({ length: NUM_PROGRAMS }, (_, i) => ({
    id: `org-${String(i).padStart(4, '0')}`,
    name: `Program ${String(i).padStart(4, '0')}`,
    opted_out_of_sport_pulse: (opts.optedOutOrgs ?? []).includes(`org-${String(i).padStart(4, '0')}`),
  }));
  const teams = programs.map((p, i) => ({
    id: `team-${String(i).padStart(4, '0')}`,
    org_id: p.id,
    sport_id: SPORT_ID,
    age_group: '8-10',
  }));
  const plans = teams.map((t, i) => ({
    id: `plan-${String(i).padStart(4, '0')}`,
    team_id: t.id,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    skills_targeted: [SKILL_ID],
  }));
  // org-0000 ships more plans than the others — wins the named slot.
  for (let k = 0; k < 5; k++) {
    plans.push({
      id: `plan-bonus-${k}`,
      team_id: 'team-0000',
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      skills_targeted: [SKILL_ID],
    });
  }
  // Director coaches per org — each program has its own admin.
  const directors = programs.map((p, i) => ({
    id: i === 0 ? DIRECTOR_ID : `director-${String(i).padStart(4, '0')}`,
    org_id: p.id,
    full_name: 'Riya Walker',
    role: 'admin',
  }));
  // The caller might be a non-director coach (in which case the
  // director row for their org belongs to a different coach).
  const callerRow = {
    id: opts.callerId,
    org_id: opts.callerOrgId,
    role: opts.callerRole,
  };

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'teams') return chain(teams, { inFilterField: 'id' });
    if (table === 'plans') return chain(plans, { inFilterField: 'team_id' });
    if (table === 'organizations') return chain(programs, { inFilterField: 'id' });
    if (table === 'coaches') {
      // Two distinct shapes to handle:
      //   (a) the role-filtered .in('org_id', orgIds).eq('role','admin')
      //       used to resolve directors → return directors filtered by
      //       .in() on org_id
      //   (b) the .eq('id', caller.id).maybeSingle() used to resolve
      //       the caller → return ONLY the caller row when the
      //       narrowed maybeSingle path is hit; the filter-aware chain
      //       handles in() but eq() collapses to the first row, which
      //       we want to be the caller. To support both, return BOTH
      //       directors+caller and let maybeSingle pick the right one.
      return chain([callerRow, ...directors], { inFilterField: 'org_id' });
    }
    if (table === 'coach_first_signal_celebrations') {
      return chain([], { tableName: 'coach_first_signal_celebrations', insertResult: opts.insertResult });
    }
    return chain([]);
  });
}

describe('sport-pulse name notification (ticket 0091)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    capturedInserts.rows = [];
    mockGetUser.mockResolvedValue({ data: { user: { id: DIRECTOR_ID } } });
  });

  it("(i) director's program is in namedPrograms → celebration row written", async () => {
    setupEligibleNamedProgram({
      callerId: DIRECTOR_ID,
      callerRole: 'admin',
      callerOrgId: ORG_ID,
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.namedPrograms.map((p: { orgId: string }) => p.orgId)).toContain(ORG_ID);

    const inserts = capturedInserts.rows.filter(
      (r) => r.table === 'coach_first_signal_celebrations',
    );
    expect(inserts.length).toBeGreaterThanOrEqual(1);
    const values = inserts[0].values as { coach_id: string; kind: string };
    expect(values.coach_id).toBe(DIRECTOR_ID);
    expect(values.kind).toBe('sport_pulse_named');
  });

  it('(ii) same program named again → idempotent (insert may collide with UNIQUE constraint and the route swallows the error)', async () => {
    // Simulate a unique-constraint error from the celebrations insert.
    // The route MUST swallow it — the read path never fails because
    // of a duplicate celebration write.
    setupEligibleNamedProgram({
      callerId: DIRECTOR_ID,
      callerRole: 'admin',
      callerOrgId: ORG_ID,
      insertResult: { error: { code: '23505', message: 'duplicate key value' } },
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
  });

  it('(iii) non-director caller in an opted-out program → NO celebration row written', async () => {
    setupEligibleNamedProgram({
      callerId: NON_DIRECTOR_ID,
      callerRole: 'coach',
      callerOrgId: ORG_ID,
      optedOutOrgs: [ORG_ID],
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: NON_DIRECTOR_ID } } });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    // org-0000 opted out — should NOT be in namedPrograms.
    expect(body.namedPrograms.map((p: { orgId: string }) => p.orgId)).not.toContain(ORG_ID);
    // No celebration row should be written for the caller's org.
    const inserts = capturedInserts.rows.filter(
      (r) => r.table === 'coach_first_signal_celebrations',
    );
    expect(inserts.length).toBe(0);
  });

  it('(iii) caller is a non-director coach in a NAMED program → NO celebration row (role gate)', async () => {
    setupEligibleNamedProgram({
      callerId: NON_DIRECTOR_ID,
      callerRole: 'coach',
      callerOrgId: ORG_ID,
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: NON_DIRECTOR_ID } } });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const inserts = capturedInserts.rows.filter(
      (r) => r.table === 'coach_first_signal_celebrations',
    );
    expect(inserts.length).toBe(0);
  });
});
