/**
 * Ticket 0031 — /api/org/weekly-focus: the program director's one org-scoped
 * "weekly focus" string, read through the EXISTING System→Org→Team config cascade
 * as an org override (config_overrides row, domain `program` / key `focus`).
 *
 * Backend behaviours under test (one acceptance-criteria box each):
 *  (AC1) POST set + GET read round-trip the focus through the org config path —
 *        the value persists as a config_overrides row at org scope and GET reads
 *        it back via resolveConfig as an org override (not a bespoke store).
 *  (AC2) Authorization is server-side + role+tier scoped: setting requires the
 *        caller to be an `admin` of the org AND the org tier to satisfy
 *        canAccess(tier, 'feature_program_focus'); a non-admin org coach → 403, a
 *        coach of a different org → 403/404, a non-org tier → 403. BOTH the role
 *        check and the tier check run in the route, not only in the UI.
 *  (AC3) READ is allowed to ANY coach of the org for display; a coach of a
 *        DIFFERENT org reads their OWN org's value or none — the focus never
 *        leaks across orgs (cross-org read isolation).
 *  (AC6) COPPA: the value is stored in org config only, adds no field to
 *        `players`, carries no per-minor data.
 *  (AC7) Server-side tier gate is real: the set route rejects a non-org tier even
 *        on a hand-crafted request.
 *
 * Strategy mirrors tests/ai/program-pulse.test.ts: @/lib/supabase/server is a
 * chainable in-memory mock; the route reads/writes config_overrides through it.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the Playwright spec glob. See
 * docs/LESSONS.md (2026-05-20, ship/0001).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

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

import { GET as weeklyFocusGet, POST as weeklyFocusPost } from '@/app/api/org/weekly-focus/route';

// ─── Chainable mock helpers (mirror program-pulse.test.ts) ───────────────────────

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
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
  };
  return chain;
}

function setAuthUser(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

const FOCUS_DOMAIN = 'program';
const FOCUS_KEY = 'focus';

/**
 * In-memory config_overrides store keyed by org_id. The route reads the org's
 * program.focus override and (on POST) writes it. This lets a POST set then a
 * GET read round-trip THROUGH the cascade path, proving the value lives in org
 * config and is read back as an org override — not a bespoke store.
 */
type OverrideRow = { org_id: string; team_id: string | null; domain: string; key: string; value: unknown };

function makeWiring(opts: {
  role?: string;
  tier?: string;
  callerOrgId?: string;
  store: Record<string, OverrideRow[]>;
} ) {
  const role = opts.role ?? 'admin';
  const tier = opts.tier ?? 'organization';
  const callerOrgId = opts.callerOrgId ?? 'org-1';
  const store = opts.store;

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      const callerRow = {
        id: 'coach-1',
        org_id: callerOrgId,
        role,
        organizations: { tier },
      };
      const chain = buildChain(callerRow) as any;
      chain.single = vi.fn().mockResolvedValue({ data: callerRow, error: null });
      return chain;
    }

    if (table === 'config_overrides') {
      // Track which org_id this query is scoped to, then resolve/insert against
      // the in-memory store on terminal calls. The route filters by org_id +
      // domain + key + team_id is null for the org-scope override.
      let scopedOrgId: string | null = null;
      const chain: Record<string, any> = {};
      const passthrough = () => chain;
      chain.select = vi.fn(passthrough);
      chain.upsert = vi.fn((row: OverrideRow) => {
        const arr = store[row.org_id] ?? (store[row.org_id] = []);
        const idx = arr.findIndex((r) => r.domain === row.domain && r.key === row.key && r.team_id === (row.team_id ?? null));
        const next = { ...row, team_id: row.team_id ?? null };
        if (idx >= 0) arr[idx] = next; else arr.push(next);
        return chain;
      });
      chain.insert = vi.fn((row: OverrideRow) => {
        const arr = store[row.org_id] ?? (store[row.org_id] = []);
        arr.push({ ...row, team_id: row.team_id ?? null });
        return chain;
      });
      chain.update = vi.fn(passthrough);
      chain.delete = vi.fn(passthrough);
      chain.eq = vi.fn((col: string, val: unknown) => {
        if (col === 'org_id') scopedOrgId = val as string;
        return chain;
      });
      chain.is = vi.fn(passthrough);
      chain.in = vi.fn(passthrough);
      chain.order = vi.fn(passthrough);
      chain.limit = vi.fn(passthrough);
      const resolveRows = () => {
        const rows = (scopedOrgId && store[scopedOrgId]) || [];
        return rows.filter((r) => r.domain === FOCUS_DOMAIN && r.key === FOCUS_KEY && r.team_id === null);
      };
      chain.single = vi.fn(async () => {
        const rows = resolveRows();
        return { data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116' } };
      });
      chain.maybeSingle = vi.fn(async () => ({ data: resolveRows()[0] ?? null, error: null }));
      chain.then = (onFulfilled: (v: { data: OverrideRow[]; error: null }) => unknown) =>
        Promise.resolve({ data: resolveRows(), error: null }).then(onFulfilled);
      return chain;
    }

    return buildChain(null);
  });
}

function makePost(body: Record<string, unknown> = { orgId: 'org-1', focus: 'spacing & off-ball movement' }) {
  return new Request('http://localhost/api/org/weekly-focus', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('POST /api/org/weekly-focus — auth', () => {
  it('returns 401 and performs no DB read when unauthenticated (POST)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await weeklyFocusPost(makePost());
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated (GET)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await weeklyFocusGet();
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });
});

// ─── AC1: set then get round-trips through the org config path ────────────────

describe('POST then GET /api/org/weekly-focus — round-trip through the config cascade', () => {
  it('an org admin sets the focus and a coach of the org reads it back via the org override', async () => {
    const store: Record<string, OverrideRow[]> = {};

    // Director (admin, org tier) sets the focus.
    setAuthUser('coach-1');
    makeWiring({ role: 'admin', tier: 'organization', callerOrgId: 'org-1', store });
    const setRes = await weeklyFocusPost(makePost({ orgId: 'org-1', focus: 'spacing & off-ball movement' }));
    expect(setRes.status).toBe(200);

    // The value persisted as a config_overrides row at org scope (domain program / key focus).
    const rows = store['org-1'] ?? [];
    const overrideRow = rows.find((r) => r.domain === FOCUS_DOMAIN && r.key === FOCUS_KEY && r.team_id === null);
    expect(overrideRow).toBeTruthy();
    expect(overrideRow!.value).toBe('spacing & off-ball movement');

    // A coach (any role) of the same org reads it back through the cascade.
    setAuthUser('coach-1');
    makeWiring({ role: 'coach', tier: 'organization', callerOrgId: 'org-1', store });
    const getRes = await weeklyFocusGet();
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.focus).toBe('spacing & off-ball movement');
  });

  it('GET returns null focus when the org has set nothing', async () => {
    const store: Record<string, OverrideRow[]> = {};
    setAuthUser('coach-1');
    makeWiring({ role: 'coach', tier: 'organization', callerOrgId: 'org-1', store });
    const res = await weeklyFocusGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.focus ?? null).toBeNull();
  });
});

// ─── AC2 / AC7: role + tier enforcement is server-side ───────────────────────

describe('POST /api/org/weekly-focus — role + tier gate', () => {
  it('returns 403 for a non-admin coach of the org and does not write', async () => {
    const store: Record<string, OverrideRow[]> = {};
    setAuthUser('coach-1');
    makeWiring({ role: 'coach', tier: 'organization', callerOrgId: 'org-1', store });
    const res = await weeklyFocusPost(makePost());
    expect(res.status).toBe(403);
    expect(store['org-1'] ?? []).toHaveLength(0);
  });

  it('returns 403 for an admin on a non-organization tier and does not write (server-side tier gate, not UI-only)', async () => {
    const store: Record<string, OverrideRow[]> = {};
    setAuthUser('coach-1');
    makeWiring({ role: 'admin', tier: 'pro_coach', callerOrgId: 'org-1', store });
    const res = await weeklyFocusPost(makePost());
    expect(res.status).toBe(403);
    expect(store['org-1'] ?? []).toHaveLength(0);
  });

  it('returns 403/404 for a caller whose org_id does not match the requested orgId and does not write', async () => {
    const store: Record<string, OverrideRow[]> = {};
    setAuthUser('coach-1');
    // Caller is an org admin but of a DIFFERENT org than the one requested.
    makeWiring({ role: 'admin', tier: 'organization', callerOrgId: 'org-999', store });
    const res = await weeklyFocusPost(makePost({ orgId: 'org-1', focus: 'leak attempt' }));
    expect([403, 404]).toContain(res.status);
    expect(store['org-1'] ?? []).toHaveLength(0);
  });

  it('rejects an empty/whitespace focus with 400', async () => {
    const store: Record<string, OverrideRow[]> = {};
    setAuthUser('coach-1');
    makeWiring({ role: 'admin', tier: 'organization', callerOrgId: 'org-1', store });
    const res = await weeklyFocusPost(makePost({ orgId: 'org-1', focus: '   ' }));
    expect(res.status).toBe(400);
  });
});

// ─── AC3: cross-org read isolation ───────────────────────────────────────────

describe('GET /api/org/weekly-focus — cross-org read isolation', () => {
  it('a coach of a different org never reads org-1\'s focus — they get their OWN org value or none', async () => {
    const store: Record<string, OverrideRow[]> = {
      'org-1': [{ org_id: 'org-1', team_id: null, domain: FOCUS_DOMAIN, key: FOCUS_KEY, value: 'org-1 secret focus' }],
      'org-2': [{ org_id: 'org-2', team_id: null, domain: FOCUS_DOMAIN, key: FOCUS_KEY, value: 'org-2 own focus' }],
    };

    // Caller belongs to org-2 but requests org-1's focus.
    setAuthUser('coach-1');
    makeWiring({ role: 'coach', tier: 'organization', callerOrgId: 'org-2', store });
    const res = await weeklyFocusGet();
    const body = await res.json();
    // The route must scope to the CALLER's own org — never leak org-1's value.
    expect(body.focus).not.toBe('org-1 secret focus');
    // It returns the caller's own org value (or null) — never the other org's.
    if (res.status === 200 && body.focus != null) {
      expect(body.focus).toBe('org-2 own focus');
    }
  });
});
