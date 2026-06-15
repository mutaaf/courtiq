/**
 * Ticket 0083 — POST /api/program/arc-history/adopt
 *
 * One-shot seed: copies the program arc shape into the caller's own
 * Practice Arc data (a single `plans` insert of type 'practice_arc'),
 * mirroring the existing 0018 arc-write primitive (a hand-built arc on
 * the existing generator route writes the same insert shape). The
 * adopt POST is a non-AI version of the same write — the new coach
 * can edit any week from there.
 *
 * .test.ts (NOT .spec.ts) — per docs/LESSONS.md.
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

import { POST as arcAdoptPost } from '@/app/api/program/arc-history/adopt/route';

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

const ORG = 'org-hawks';
const AGE = 'U10';
const SPORT = 'sport-basketball';
const CALLER_TEAM = 'team-caller';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const insertCalls: unknown[] = [];
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: unknown) => {
      insertCalls.push(payload);
      return chain;
    }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
    __insertCalls: insertCalls,
  };
  return chain;
}

function setAuthUser(id = 'coach-caller') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

interface WireOpts {
  callerTeamCoaches?: Array<{ team_id: string; coach_id: string }>;
  programTeams?: Array<{ id: string; org_id: string; age_group: string; sport_id: string }>;
  programPlans?: Array<{ team_id: string; skills_targeted: string[] | null; created_at: string; curriculum_week: number | null }>;
  callerExistingArc?: Array<{ id: string; type: string }>;
  insertedPlan?: { id: string; team_id: string; coach_id: string; type: string };
  organizationName?: string | null;
}

function defaultProgramTeams() {
  return [
    { id: CALLER_TEAM, org_id: ORG, age_group: AGE, sport_id: SPORT },
    { id: 'team-other', org_id: ORG, age_group: AGE, sport_id: SPORT },
  ];
}

function defaultProgramPlans() {
  // 14 plans on the "other" team — same as the GET test.
  const plans: Array<{ team_id: string; skills_targeted: string[] | null; created_at: string; curriculum_week: number | null }> = [];
  for (const wk of [2, 3, 4]) {
    plans.push({ team_id: 'team-other', skills_targeted: ['closeouts'], created_at: new Date(now - 200 * day).toISOString(), curriculum_week: wk });
    plans.push({ team_id: 'team-other', skills_targeted: ['closeouts'], created_at: new Date(now - 200 * day).toISOString(), curriculum_week: wk });
  }
  for (const wk of [5, 6, 7]) {
    plans.push({ team_id: 'team-other', skills_targeted: ['transitions'], created_at: new Date(now - 200 * day).toISOString(), curriculum_week: wk });
    plans.push({ team_id: 'team-other', skills_targeted: ['transitions'], created_at: new Date(now - 200 * day).toISOString(), curriculum_week: wk });
  }
  plans.push({ team_id: 'team-other', skills_targeted: ['warmup'], created_at: new Date(now - 200 * day).toISOString(), curriculum_week: 1 });
  plans.push({ team_id: 'team-other', skills_targeted: ['warmup'], created_at: new Date(now - 200 * day).toISOString(), curriculum_week: 8 });
  return plans;
}

let lastInsertedPlan: unknown = null;
let plansChain: ReturnType<typeof buildChain> | null = null;

function wire(opts: WireOpts = {}) {
  const callerTeamCoaches = opts.callerTeamCoaches ?? [
    { team_id: CALLER_TEAM, coach_id: 'coach-caller' },
  ];
  const programTeams = opts.programTeams ?? defaultProgramTeams();
  const programPlans = opts.programPlans ?? defaultProgramPlans();
  const callerExistingArc = opts.callerExistingArc ?? [];
  const insertedPlan = opts.insertedPlan ?? {
    id: 'plan-adopted',
    team_id: CALLER_TEAM,
    coach_id: 'coach-caller',
    type: 'practice_arc',
  };
  const organizationName = opts.organizationName ?? 'Hawks Basketball';

  lastInsertedPlan = null;

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'team_coaches') {
      return buildChain(callerTeamCoaches);
    }
    if (table === 'teams') {
      return buildChain(programTeams);
    }
    if (table === 'organizations') {
      return buildChain(
        organizationName ? { id: ORG, name: organizationName } : null,
      );
    }
    if (table === 'plans') {
      // Differentiate the "caller's existing arc" check from the
      // "program plans" read from the "insert" write. The route calls
      // .eq('team_id', callerTeamId).eq('type', 'practice_arc') for the
      // existing-arc check, then .in('team_id', programTeamIds) for the
      // program plans, then .insert(...) for the write.
      //
      // We share ONE chain across the three so the test can assert on
      // the insert payload. The chain's `then` resolves to whatever was
      // set on it most recently — which for the empty-arc check needs to
      // be callerExistingArc; for the program-plans read needs to be the
      // programPlans set; for the insert .select().single() needs to be
      // the insertedPlan.
      //
      // To keep this tractable we return a STATELESS chain that captures
      // the insert payload AND resolves any await to programPlans by
      // default. The empty-arc check uses .select(...).limit(1) which
      // resolves to plansArc; we wire that via a per-call decision below.
      const chain = buildChain(programPlans) as any;
      chain.insert = vi.fn((payload: unknown) => {
        lastInsertedPlan = payload;
        // The route follows .insert().select().single() — return the
        // inserted plan on .single().
        chain.single = vi.fn().mockResolvedValue({ data: insertedPlan, error: null });
        return chain;
      });
      // .limit(1) is used by the empty-arc check; have it resolve to the
      // caller's existing arc rows so the route can detect non-empty.
      chain.limit = vi.fn(() => {
        // Return a sub-chain whose await resolves to callerExistingArc.
        const sub = buildChain(callerExistingArc);
        return sub;
      });
      plansChain = chain;
      return chain;
    }
    return buildChain([]);
  });
}

function makeRequest(body: Record<string, unknown> | null = null) {
  const defaultBody = {
    teamId: CALLER_TEAM,
    orgId: ORG,
    ageGroup: AGE,
    sportId: SPORT,
  };
  return new Request('http://localhost/api/program/arc-history/adopt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? defaultBody),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  lastInsertedPlan = null;
  plansChain = null;
});

describe('POST /api/program/arc-history/adopt — auth', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await arcAdoptPost(makeRequest());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/program/arc-history/adopt — happy path', () => {
  it('returns 200 + writes the adopted arc on an empty arc', async () => {
    setAuthUser('coach-caller');
    wire();
    const res = await arcAdoptPost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adopted).toBe(true);
    expect(typeof body.weeks).toBe('number');
    expect(body.weeks).toBeGreaterThan(0);
    // The insert payload mirrors the 0018 arc-write primitive shape.
    expect(lastInsertedPlan).toBeTruthy();
    const insert = lastInsertedPlan as Record<string, unknown>;
    expect(insert.type).toBe('practice_arc');
    expect(insert.team_id).toBe(CALLER_TEAM);
    expect(insert.coach_id).toBe('coach-caller');
    expect(insert.content_structured).toBeTruthy();
    // The content_structured carries the program arc shape — every
    // week with top_skills + team_count + practice_count.
    const structured = insert.content_structured as { sessions: Array<unknown>; total_sessions: number };
    expect(Array.isArray(structured.sessions)).toBe(true);
    expect(structured.sessions.length).toBeGreaterThan(0);
  });
});

describe('POST /api/program/arc-history/adopt — already-populated arc', () => {
  it('returns 409 when the arc is not empty', async () => {
    setAuthUser('coach-caller');
    wire({
      callerExistingArc: [{ id: 'plan-existing', type: 'practice_arc' }],
    });
    const res = await arcAdoptPost(makeRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('arc_already_populated');
  });

  it('idempotency: a second adopt after one ran writes a 409, never a double-write', async () => {
    setAuthUser('coach-caller');
    // First call — arc is empty.
    wire();
    const r1 = await arcAdoptPost(makeRequest());
    expect(r1.status).toBe(200);
    // Now simulate the arc as populated (the 200 above wrote it).
    wire({
      callerExistingArc: [{ id: 'plan-adopted', type: 'practice_arc' }],
    });
    const r2 = await arcAdoptPost(makeRequest());
    expect(r2.status).toBe(409);
  });
});

describe('POST /api/program/arc-history/adopt — ownership', () => {
  it('returns 404 when the caller does not own the named team', async () => {
    setAuthUser('coach-caller');
    wire({ callerTeamCoaches: [] });
    const res = await arcAdoptPost(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 404 when the team is in a different org', async () => {
    setAuthUser('coach-caller');
    wire({ programTeams: [] });
    const res = await arcAdoptPost(makeRequest());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/program/arc-history/adopt — input validation', () => {
  it('returns 400 when teamId is missing', async () => {
    setAuthUser('coach-caller');
    wire();
    const res = await arcAdoptPost(
      makeRequest({ orgId: ORG, ageGroup: AGE, sportId: SPORT }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when orgId is missing', async () => {
    setAuthUser('coach-caller');
    wire();
    const res = await arcAdoptPost(
      makeRequest({ teamId: CALLER_TEAM, ageGroup: AGE, sportId: SPORT }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/program/arc-history/adopt — privacy contract', () => {
  it('never reads the players table', async () => {
    setAuthUser('coach-caller');
    wire();
    await arcAdoptPost(makeRequest());
    const tablesRead = mockFromFn.mock.calls.map((c) => c[0] as string);
    expect(tablesRead).not.toContain('players');
  });

  it('the inserted plan content_structured carries no minor field', async () => {
    setAuthUser('coach-caller');
    wire();
    await arcAdoptPost(makeRequest());
    const insert = lastInsertedPlan as Record<string, unknown>;
    const serialised = JSON.stringify(insert);
    expect(serialised).not.toContain('date_of_birth');
    expect(serialised).not.toContain('medical_notes');
    expect(serialised).not.toContain('parent_email');
    expect(serialised).not.toContain('jersey_number');
  });
});
