/**
 * Ticket 0051 — /api/data/mutate must REJECT raw deletes on sessions / teams /
 * players. Those rows have non-trivial cascade behavior (orphans, child rows,
 * minors' data) that demands a typed, role-gated endpoint — never the generic
 * "I'm logged in, ergo I can delete" mutate route.
 *
 * Sibling ticket 0053 (delete-a-team) will inherit this denial primitive.
 *
 * The route must still ALLOW:
 *   - operation: 'update' on players (the existing roster soft-delete sets
 *     players.is_active = false via this route — regression-guarding that here)
 *   - operation: 'delete' on other allow-listed tables (observations, plans,
 *     team_announcements, etc. — unchanged)
 *
 * .test.ts NOT .spec.ts (vitest exclude glob — LESSONS.md).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn, lastQueries } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  lastQueries: [] as Array<{ table: string; op: string; filters: Record<string, unknown>; payload?: unknown }>,
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

// Webhooks + cache helpers are no-ops for these tests.
vi.mock('@/lib/webhooks', () => ({
  fireWebhooks: vi.fn(async () => undefined),
}));
vi.mock('@/lib/cache/memory', () => ({
  memBustPrefix: vi.fn(),
}));

import { POST } from '@/app/api/data/mutate/route';

function buildChain(table: string, op: string, finalData: unknown = null) {
  const state: Record<string, unknown> = { filters: {} };
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    insert: vi.fn((payload: unknown) => {
      lastQueries.push({ table, op: 'insert', filters: state.filters as Record<string, unknown>, payload });
      return chain;
    }),
    update: vi.fn((payload: unknown) => {
      lastQueries.push({ table, op: 'update', filters: state.filters as Record<string, unknown>, payload });
      return chain;
    }),
    delete: vi.fn(() => {
      lastQueries.push({ table, op: 'delete', filters: state.filters as Record<string, unknown> });
      return chain;
    }),
    eq: vi.fn((k: string, v: unknown) => {
      (state.filters as Record<string, unknown>)[k] = v;
      return chain;
    }),
    single: vi.fn(async () => ({ data: finalData, error: null })),
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(resolve({ data: finalData, error: null })),
  };
  return chain;
}

function setAuth(id = 'coach-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function makeReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/data/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/data/mutate — delete-denial primitive (ticket 0051)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastQueries.length = 0;
    setAuth();
  });

  for (const table of ['sessions', 'teams', 'players'] as const) {
    it(`returns 403 and performs NO delete when operation:delete is requested on ${table}`, async () => {
      // Even if a delete query ran, the chain would log to lastQueries — assert it doesn't.
      mockFromFn.mockImplementation((t: string) => buildChain(t, 'unknown'));
      const res = await POST(makeReq({
        table,
        operation: 'delete',
        filters: { id: 'row-1' },
      }));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/typed endpoint/i);
      const deletes = lastQueries.filter((q) => q.op === 'delete' && q.table === table);
      expect(deletes).toHaveLength(0);
    });
  }

  it('still allows operation:update on players (roster soft-delete via is_active=false)', async () => {
    mockFromFn.mockImplementation((t: string) => buildChain(t, 'update', [{ id: 'p1', is_active: false }]));
    const res = await POST(makeReq({
      table: 'players',
      operation: 'update',
      filters: { id: 'p1' },
      data: { is_active: false },
    }));
    expect(res.status).toBe(200);
    const updates = lastQueries.filter((q) => q.op === 'update' && q.table === 'players');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.payload).toEqual({ is_active: false });
  });

  it('still allows operation:delete on non-restricted tables (observations)', async () => {
    mockFromFn.mockImplementation((t: string) => buildChain(t, 'delete'));
    const res = await POST(makeReq({
      table: 'observations',
      operation: 'delete',
      filters: { id: 'obs-1' },
    }));
    expect(res.status).toBe(200);
    const deletes = lastQueries.filter((q) => q.op === 'delete' && q.table === 'observations');
    expect(deletes).toHaveLength(1);
  });

  it('returns 401 with no auth (denial primitive does not bypass auth)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockFromFn.mockImplementation((t: string) => buildChain(t, 'delete'));
    const res = await POST(makeReq({
      table: 'sessions',
      operation: 'delete',
      filters: { id: 's1' },
    }));
    expect(res.status).toBe(401);
  });
});
