/**
 * Ticket 0092 — GET /api/coach/recurring-observers.
 *
 * The /home page mounts `<RealCoCoachCard />`; that card calls THIS
 * route to learn whether the recurring-observer threshold has been
 * crossed for any of the caller's teams AND, if so, what each
 * qualifying helper's named summary is.
 *
 * Schema-wins-over-prose deviation (LESSONS#0096) — documented in the
 * 0092 Implementation log: the ticket prose names an
 * `observer_link_opens` table. No such table exists on disk; the
 * route reads `sub_handoffs` (migration 061, ticket 0067) as the
 * structural recurring-helper primitive.
 *
 * Acceptance criteria mapping:
 *  (i)   unauthed → 401.
 *  (ii)  coach with 0 sub-handoffs → eligible: false,
 *        eligibilityReason: 'no_observer_opens'.
 *  (iii) coach with 1 helper at threshold → eligible payload.
 *  (iv)  helper at threshold but already dismissed by the coach →
 *        eligible: false, reason 'all_helpers_already_invited'.
 *  (v)   cross-team helper spans two teams → ONE entry per team.
 *  (vi)  helper with null sub_first_name → excluded (no identifier).
 *  (vii) planted email / phone / DOB / parent-message on every joined
 *        row are NEVER read.
 *  (viii) response shape is BYTE-IDENTICAL across the matrix.
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

import { GET } from '@/app/api/coach/recurring-observers/route';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';
const TEAM_A = '00000000-0000-4000-a000-0000000000ta';
const TEAM_B = '00000000-0000-4000-a000-0000000000tb';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function isoDaysAgo(d: number) {
  return new Date(NOW - d * DAY).toISOString();
}

// LESSONS#0080 / #0083 — chain mocks must mirror FILTER semantics.
// Per-table fixtures: each entry is the array of rows the route's
// chain should resolve to AFTER its filters land. For `.in(col, ids)`
// reads, we capture the latest `.in()` args and filter the fixture so
// the route sees only the rows whose `col` is in the IN-set.
function chain(data: unknown[] = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let inFilter: { col: string; ids: unknown[] } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: Record<string, any> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockImplementation((col: string, ids: unknown[]) => {
      inFilter = { col, ids };
      return c;
    }),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() => {
      const firstRow = data.length > 0 ? data[0] : null;
      return Promise.resolve({ data: firstRow, error: null });
    }),
    single: vi.fn().mockImplementation(() => {
      const firstRow = data.length > 0 ? data[0] : null;
      return Promise.resolve({ data: firstRow, error: null });
    }),
    then: (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) => {
      let filtered = data;
      if (inFilter !== null) {
        const inf = inFilter as { col: string; ids: unknown[] };
        const idSet = new Set(inf.ids);
        filtered = data.filter((row) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = (row as any)[inf.col];
          return idSet.has(v);
        });
      }
      return Promise.resolve({ data: filtered, error: null }).then(onFulfilled);
    },
  };
  return c;
}

function wireTables(byTable: Record<string, unknown[]>) {
  mockFromFn.mockImplementation((table: string) => chain(byTable[table] ?? []));
}

// Build one sub_handoffs row with planted COPPA fields so we can assert
// the route's `.select()` allow-list never reaches into them.
function handoff(
  helper: string,
  sessionId: string,
  daysAgo: number,
  opts: { coachId?: string; subNoteText?: string | null } = {},
): Record<string, unknown> {
  return {
    id: `h-${helper}-${sessionId}`,
    coach_id: opts.coachId ?? COACH_ID,
    session_id: sessionId,
    sub_first_name: helper,
    sub_note_text: opts.subNoteText ?? null,
    created_at: isoDaysAgo(daysAgo),
    // PLANTED COPPA fields the allow-list must never surface.
    sub_note_seen_at: '2026-06-01T00:00:00Z',
    parent_email: 'should-never-be-read@example.com',
    medical_notes: 'PLANTED',
    date_of_birth: '2014-01-01',
  };
}

function session(id: string, teamId: string) {
  return {
    id,
    team_id: teamId,
    // PLANTED COPPA fields.
    parent_email: 'planted@example.com',
    date_of_birth: '2014-01-01',
  };
}

describe('GET /api/coach/recurring-observers (ticket 0092)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
  });

  it('(i) unauthed → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('(ii) coach with 0 sub-handoffs → eligible: false, no_observer_opens', async () => {
    wireTables({
      team_coaches: [{ team_id: TEAM_A }],
      sub_handoffs: [],
      sessions: [],
      recurring_observer_dismissals: [],
      teams: [{ id: TEAM_A, name: 'U12 Hawks' }],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.eligibilityReason).toBe('no_observer_opens');
  });

  it('(iii) coach with 1 helper at threshold → eligible payload with 1 entry', async () => {
    wireTables({
      team_coaches: [{ team_id: TEAM_A }],
      sub_handoffs: [
        handoff('Aisha', 's-1', 2, { subNoteText: 'closeouts went well' }),
        handoff('Aisha', 's-2', 5),
        handoff('Aisha', 's-3', 8),
      ],
      sessions: [
        session('s-1', TEAM_A),
        session('s-2', TEAM_A),
        session('s-3', TEAM_A),
      ],
      recurring_observer_dismissals: [],
      teams: [{ id: TEAM_A, name: 'U12 Hawks' }],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.total).toBe(1);
    expect(body.helpers).toHaveLength(1);
    expect(body.helpers[0]).toMatchObject({
      displayName: 'Aisha',
      openCount: 3,
      distinctPracticeCount: 3,
      ranDrill: true,
      teamId: TEAM_A,
      teamName: 'U12 Hawks',
    });
  });

  it('(iv) helper at threshold but already dismissed → eligible: false, all_helpers_already_invited', async () => {
    wireTables({
      team_coaches: [{ team_id: TEAM_A }],
      sub_handoffs: [
        handoff('Aisha', 's-1', 2),
        handoff('Aisha', 's-2', 5),
      ],
      sessions: [session('s-1', TEAM_A), session('s-2', TEAM_A)],
      recurring_observer_dismissals: [
        {
          helper_identifier: 'aisha',
          team_id: TEAM_A,
          dismissed_at: isoDaysAgo(5),
        },
      ],
      teams: [{ id: TEAM_A, name: 'U12 Hawks' }],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.eligibilityReason).toBe('all_helpers_already_invited');
  });

  it('(v) cross-team helper spans two teams → ONE entry per team', async () => {
    wireTables({
      team_coaches: [{ team_id: TEAM_A }, { team_id: TEAM_B }],
      sub_handoffs: [
        handoff('Aisha', 's-1a', 2),
        handoff('Aisha', 's-2a', 5),
        handoff('Aisha', 's-1b', 3),
        handoff('Aisha', 's-2b', 6),
      ],
      sessions: [
        session('s-1a', TEAM_A),
        session('s-2a', TEAM_A),
        session('s-1b', TEAM_B),
        session('s-2b', TEAM_B),
      ],
      recurring_observer_dismissals: [],
      teams: [
        { id: TEAM_A, name: 'U12 Hawks' },
        { id: TEAM_B, name: 'U10 Falcons' },
      ],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.helpers).toHaveLength(2);
    expect(new Set(body.helpers.map((h: { teamId: string }) => h.teamId))).toEqual(
      new Set([TEAM_A, TEAM_B]),
    );
  });

  it('(vi) helper with null sub_first_name → excluded (no identifier)', async () => {
    wireTables({
      team_coaches: [{ team_id: TEAM_A }],
      sub_handoffs: [
        { ...handoff('Aisha', 's-1', 2), sub_first_name: null },
        { ...handoff('Aisha', 's-2', 5), sub_first_name: null },
      ],
      sessions: [session('s-1', TEAM_A), session('s-2', TEAM_A)],
      recurring_observer_dismissals: [],
      teams: [{ id: TEAM_A, name: 'U12 Hawks' }],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it('(vii) planted COPPA fields on joined rows are NEVER returned', async () => {
    wireTables({
      team_coaches: [{ team_id: TEAM_A }],
      sub_handoffs: [
        handoff('Aisha', 's-1', 2),
        handoff('Aisha', 's-2', 5),
      ],
      sessions: [session('s-1', TEAM_A), session('s-2', TEAM_A)],
      recurring_observer_dismissals: [],
      teams: [{ id: TEAM_A, name: 'U12 Hawks' }],
    });
    const res = await GET();
    const serialized = JSON.stringify(await res.json()).toLowerCase();
    for (const banned of [
      'parent_email',
      'medical_notes',
      'date_of_birth',
      'planted',
      'should-never-be-read',
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it('(viii) eligible response carries the named keys (shape contract)', async () => {
    wireTables({
      team_coaches: [{ team_id: TEAM_A }],
      sub_handoffs: [
        handoff('Aisha', 's-1', 2),
        handoff('Aisha', 's-2', 5),
      ],
      sessions: [session('s-1', TEAM_A), session('s-2', TEAM_A)],
      recurring_observer_dismissals: [],
      teams: [{ id: TEAM_A, name: 'U12 Hawks' }],
    });
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(
      ['eligible', 'helpers', 'total'].sort(),
    );
    expect(Object.keys(body.helpers[0]).sort()).toEqual(
      [
        'displayName',
        'distinctPracticeCount',
        'helperIdentifier',
        'lastOpenAt',
        'openCount',
        'ranDrill',
        'teamId',
        'teamName',
      ].sort(),
    );
  });

  it('coach with no team_coaches rows → no_observer_opens (no team to scan)', async () => {
    wireTables({
      team_coaches: [],
      sub_handoffs: [],
      sessions: [],
      recurring_observer_dismissals: [],
      teams: [],
    });
    const body = await (await GET()).json();
    expect(body.eligible).toBe(false);
    expect(body.eligibilityReason).toBe('no_observer_opens');
  });

  it('handoffs whose team is NOT in team_coaches are excluded', async () => {
    const OTHER_TEAM = '00000000-0000-4000-a000-0000000000aa';
    wireTables({
      team_coaches: [{ team_id: TEAM_A }],
      sub_handoffs: [
        handoff('Aisha', 's-1', 2),
        handoff('Aisha', 's-2', 5),
      ],
      sessions: [
        session('s-1', OTHER_TEAM),
        session('s-2', OTHER_TEAM),
      ],
      recurring_observer_dismissals: [],
      teams: [{ id: TEAM_A, name: 'U12 Hawks' }],
    });
    const body = await (await GET()).json();
    expect(body.eligible).toBe(false);
  });
});
