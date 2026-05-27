/**
 * Ticket 0051 — Delete a practice.
 *
 * Tests the DELETE /api/sessions/[sessionId] route's role gating and the two
 * delete modes (preserve / cascade).
 *
 * Strategy mirrors tests/capture/carryover.test.ts and tests/ai/weekly-star.test.ts:
 * @/lib/supabase/server is replaced with a chainable in-memory mock so the route
 * runs without a real DB connection. The mock keeps a tiny key/value store of
 * "tables" so we can assert on the rows the route deleted / nulled-out.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (see docs/LESSONS.md).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted in-memory DB + mocks ─────────────────────────────────────────────

type Row = Record<string, unknown>;

const { db, mockGetUser, mockFromFn } = vi.hoisted(() => {
  // Toy in-memory store keyed by table name. Reset in beforeEach.
  const db: Record<string, Row[]> = {};
  return {
    db,
    mockGetUser: vi.fn(),
    mockFromFn: vi.fn((table: string) => buildChain(db, table)),
  };

  // Defined inside hoisted closure so the mock can reach it.
  function buildChain(store: Record<string, Row[]>, table: string) {
    const state: { filters: Array<[string, unknown]>; op: null | 'select' | 'update' | 'delete'; payload?: Row } = {
      filters: [],
      op: null,
    };

    function matches(row: Row) {
      return state.filters.every(([k, v]) => row[k] === v);
    }

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      update: vi.fn((payload: Row) => {
        state.op = 'update';
        state.payload = payload;
        return chain;
      }),
      delete: vi.fn(() => {
        state.op = 'delete';
        return chain;
      }),
      eq: vi.fn((k: string, v: unknown) => {
        state.filters.push([k, v]);
        return chain;
      }),
      maybeSingle: vi.fn(async () => {
        const rows = (store[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      single: vi.fn(async () => {
        const rows = (store[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
        // Terminal: execute the op.
        if (state.op === 'update') {
          const rows = store[table] || [];
          for (const r of rows) {
            if (matches(r)) Object.assign(r, state.payload || {});
          }
          return Promise.resolve(resolve({ data: rows.filter(matches), error: null }));
        }
        if (state.op === 'delete') {
          const rows = store[table] || [];
          const keep = rows.filter((r) => !matches(r));
          store[table] = keep;
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        // SELECT (no .single): return matching rows.
        const rows = (store[table] || []).filter(matches);
        return Promise.resolve(resolve({ data: rows, error: null }));
      },
    };
    return chain;
  }
});

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

import { DELETE } from '@/app/api/sessions/[sessionId]/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetDb() {
  for (const k of Object.keys(db)) delete db[k];
}

function setAuth(userId: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function makeReq(sessionId: string, opts: { mode?: string; body?: Row } = {}) {
  const url = new URL(`http://localhost/api/sessions/${sessionId}`);
  if (opts.mode) url.searchParams.set('mode', opts.mode);
  return new Request(url.toString(), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function callDelete(sessionId: string, opts: { mode?: string; body?: Row } = {}) {
  return DELETE(makeReq(sessionId, opts), { params: Promise.resolve({ sessionId }) });
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * A baseline seed: one org, the caller-coach as head_coach on the team, a
 * session with three observations, one recording, one media row, one plan
 * (session-scoped), one attendance row.
 */
function seedBaseline(opts: { creatorId: string; callerRole?: 'head_coach' | 'coach' | 'assistant' } = { creatorId: 'caller-1' }) {
  resetDb();
  db.organizations = [{ id: 'org-1', tier: 'free' }];
  db.coaches = [{ id: 'caller-1', org_id: 'org-1' }];
  db.teams = [{ id: 'team-1', org_id: 'org-1', name: 'Wildcats' }];
  db.team_coaches = [
    { team_id: 'team-1', coach_id: 'caller-1', role: opts.callerRole ?? 'head_coach' },
  ];
  db.sessions = [
    { id: 'sess-1', team_id: 'team-1', coach_id: opts.creatorId, type: 'practice', date: '2026-05-10' },
  ];
  db.observations = [
    { id: 'obs-1', session_id: 'sess-1', team_id: 'team-1', text: 'great closeout', player_id: 'p1' },
    { id: 'obs-2', session_id: 'sess-1', team_id: 'team-1', text: 'weak-hand finish', player_id: 'p2' },
    { id: 'obs-3', session_id: 'sess-1', team_id: 'team-1', text: 'hustle play', player_id: 'p1' },
  ];
  db.recordings = [
    { id: 'rec-1', session_id: 'sess-1', team_id: 'team-1' },
  ];
  db.media = [
    { id: 'med-1', session_id: 'sess-1', team_id: 'team-1' },
  ];
  db.plans = [
    { id: 'plan-1', session_id: 'sess-1', team_id: 'team-1', type: 'practice' },
  ];
  db.session_attendance = [
    { id: 'att-1', session_id: 'sess-1', player_id: 'p1', status: 'present' },
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DELETE /api/sessions/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
  });

  it('returns 401 when not authenticated', async () => {
    setNoAuth();
    seedBaseline({ creatorId: 'caller-1' });
    const res = await callDelete('sess-1');
    expect(res.status).toBe(401);
    expect(db.sessions).toHaveLength(1);
  });

  it('returns 404 for an unknown session id', async () => {
    setAuth('caller-1');
    seedBaseline({ creatorId: 'caller-1' });
    const res = await callDelete('nope');
    expect(res.status).toBe(404);
    expect(db.sessions).toHaveLength(1);
  });

  it('returns 404 (not 403) for a session in a different org — never leaks existence', async () => {
    setAuth('caller-1');
    resetDb();
    db.coaches = [{ id: 'caller-1', org_id: 'org-mine' }];
    db.teams = [{ id: 'team-other', org_id: 'org-other', name: 'Other Team' }];
    db.sessions = [{ id: 'sess-other', team_id: 'team-other', coach_id: 'someone-else', type: 'practice' }];
    const res = await callDelete('sess-other');
    expect(res.status).toBe(404);
    expect(db.sessions).toHaveLength(1);
  });

  it('returns 403 for an authenticated coach who is neither creator nor head_coach', async () => {
    setAuth('caller-1');
    seedBaseline({ creatorId: 'someone-else', callerRole: 'assistant' });
    const res = await callDelete('sess-1');
    expect(res.status).toBe(403);
    expect(db.sessions).toHaveLength(1);
    expect(db.observations).toHaveLength(3);
  });

  it('returns 200 for the session creator even if they have no team_coaches row', async () => {
    setAuth('caller-1');
    seedBaseline({ creatorId: 'caller-1' });
    db.team_coaches = []; // creator with no membership row still owns the session
    const res = await callDelete('sess-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(db.sessions).toHaveLength(0);
  });

  it('returns 200 for a head_coach who did NOT create the session', async () => {
    setAuth('caller-1');
    seedBaseline({ creatorId: 'someone-else', callerRole: 'head_coach' });
    const res = await callDelete('sess-1');
    expect(res.status).toBe(200);
    expect(db.sessions).toHaveLength(0);
  });

  describe('preserve mode (default)', () => {
    it('removes the session row and nulls out session_id on observations/recordings/media', async () => {
      setAuth('caller-1');
      seedBaseline({ creatorId: 'caller-1' });
      const res = await callDelete('sess-1');
      expect(res.status).toBe(200);
      // Session gone
      expect(db.sessions.filter((s) => s.id === 'sess-1')).toHaveLength(0);
      // Observation rows still exist but are detached from the session
      expect(db.observations.filter((o) => o.session_id === 'sess-1')).toHaveLength(0);
      expect(db.observations.filter((o) => o.session_id === null)).toHaveLength(3);
      // Original observation text is preserved
      expect(db.observations.map((o) => o.text).sort()).toEqual(
        ['great closeout', 'hustle play', 'weak-hand finish']
      );
      // Recording + media also detached
      expect(db.recordings.filter((r) => r.session_id === 'sess-1')).toHaveLength(0);
      expect(db.recordings.filter((r) => r.session_id === null)).toHaveLength(1);
      expect(db.media.filter((m) => m.session_id === 'sess-1')).toHaveLength(0);
      expect(db.media.filter((m) => m.session_id === null)).toHaveLength(1);
    });

    it('hard-deletes session_attendance rows for the session', async () => {
      setAuth('caller-1');
      seedBaseline({ creatorId: 'caller-1' });
      const res = await callDelete('sess-1');
      expect(res.status).toBe(200);
      expect(db.session_attendance.filter((a) => a.session_id === 'sess-1')).toHaveLength(0);
    });

    it('honors an explicit ?mode=preserve and behaves the same as no mode', async () => {
      setAuth('caller-1');
      seedBaseline({ creatorId: 'caller-1' });
      const res = await callDelete('sess-1', { mode: 'preserve' });
      expect(res.status).toBe(200);
      expect(db.sessions).toHaveLength(0);
      expect(db.observations.filter((o) => o.session_id === null)).toHaveLength(3);
    });
  });

  describe('cascade mode', () => {
    it('returns 400 and changes nothing if mode=cascade is passed without a confirm field', async () => {
      setAuth('caller-1');
      seedBaseline({ creatorId: 'caller-1' });
      const res = await callDelete('sess-1', { mode: 'cascade' });
      expect(res.status).toBe(400);
      expect(db.sessions).toHaveLength(1);
      expect(db.observations).toHaveLength(3);
    });

    it('returns 400 if the confirm field does not match the team name (case-insensitive, trimmed)', async () => {
      setAuth('caller-1');
      seedBaseline({ creatorId: 'caller-1' });
      const res = await callDelete('sess-1', { mode: 'cascade', body: { confirm: 'Lakers' } });
      expect(res.status).toBe(400);
      expect(db.sessions).toHaveLength(1);
      expect(db.observations).toHaveLength(3);
    });

    it('matches confirm case-insensitively and with surrounding whitespace trimmed', async () => {
      setAuth('caller-1');
      seedBaseline({ creatorId: 'caller-1' });
      const res = await callDelete('sess-1', { mode: 'cascade', body: { confirm: '  wildcats  ' } });
      expect(res.status).toBe(200);
      expect(db.sessions).toHaveLength(0);
    });

    it('hard-deletes every observation for the session when confirmed', async () => {
      setAuth('caller-1');
      seedBaseline({ creatorId: 'caller-1' });
      const res = await callDelete('sess-1', { mode: 'cascade', body: { confirm: 'Wildcats' } });
      expect(res.status).toBe(200);
      expect(db.sessions).toHaveLength(0);
      // Observations gone entirely, not just detached
      expect(db.observations.filter((o) => o.session_id === 'sess-1')).toHaveLength(0);
      expect(db.observations).toHaveLength(0);
      // Recordings + media still detached (cascade applies to observations only)
      expect(db.recordings.filter((r) => r.session_id === null)).toHaveLength(1);
      expect(db.media.filter((m) => m.session_id === null)).toHaveLength(1);
    });
  });
});
