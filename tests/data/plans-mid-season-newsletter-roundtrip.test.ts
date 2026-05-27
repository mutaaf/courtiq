/**
 * Ticket 0043 AC7 — /api/data round-trips a `plans` row of the new type
 * `mid_season_team_newsletter`.
 *
 * The data route already allows `plans` in its allow-list (no edit needed),
 * but the AC asks us to PROVE that a query keyed by the new type comes back.
 * This is the regression guard that a future allow-list change can't quietly
 * exclude the new artifact.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const { db, mockGetUser, mockFromFn } = vi.hoisted(() => {
  const db: Record<string, Row[]> = {};
  return {
    db,
    mockGetUser: vi.fn(),
    mockFromFn: vi.fn((table: string) => buildChain(db, table)),
  };

  function buildChain(store: Record<string, Row[]>, table: string) {
    const state: {
      filters: Array<[string, unknown]>;
      nullFilters: Array<string>;
      orderBy?: { column: string; ascending: boolean };
      limit?: number;
    } = { filters: [], nullFilters: [] };

    function matches(row: Row) {
      if (!state.filters.every(([k, v]) => row[k] === v)) return false;
      if (!state.nullFilters.every((k) => row[k] === null || row[k] === undefined)) return false;
      return true;
    }

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn((k: string, v: unknown) => {
        state.filters.push([k, v]);
        return chain;
      }),
      is: vi.fn((k: string, v: unknown) => {
        if (v === null) state.nullFilters.push(k);
        return chain;
      }),
      not: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      in: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      order: vi.fn((column: string, opts?: { ascending?: boolean }) => {
        state.orderBy = { column, ascending: opts?.ascending ?? true };
        return chain;
      }),
      limit: vi.fn((n: number) => {
        state.limit = n;
        return chain;
      }),
      single: vi.fn(async () => {
        const rows = (store[table] || []).filter(matches);
        return { data: rows[0] ?? null, error: null };
      }),
      then: (resolve: (v: { data: unknown; error: unknown; count?: number }) => unknown) => {
        const rows = (store[table] || []).filter(matches);
        return Promise.resolve(resolve({ data: rows, error: null, count: rows.length }));
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

// Bypass the in-memory cache so the query path actually executes.
vi.mock('@/lib/cache/memory', () => ({
  memCached: async <T,>(_key: string, _ttl: number, fn: () => Promise<T>): Promise<T> => fn(),
  memBust: vi.fn(),
  memBustPrefix: vi.fn(),
  TTL: { SHORT: 1, MEDIUM: 1, LONG: 1, VERY_LONG: 1, HOUR: 1 },
}));

import { POST } from '@/app/api/data/route';

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(db)) delete db[k];
  mockGetUser.mockResolvedValue({ data: { user: { id: 'caller-1' } }, error: null });
});

function call(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/data', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('/api/data POST — plans round-trips mid_season_team_newsletter (ticket 0043 AC7)', () => {
  it('returns a seeded plan row of the new type via the generic query path', async () => {
    db.plans = [
      {
        id: 'plan-newsletter-1',
        team_id: 'team-1',
        coach_id: 'coach-1',
        type: 'mid_season_team_newsletter',
        title: 'Mid-Season Newsletter — Tigers',
        content: '{}',
        content_structured: {
          headline: 'Six weeks in: ball movement is starting to land.',
          arc_summary: 'We have been building around ball movement.',
          team_strengths: ['Sharing the ball', 'Rebound effort'],
          focus_areas: ['Closing out without fouling', 'Talking on D'],
          coach_voice_quote: 'When we move it, good things happen.',
        },
      },
      // A different-typed plan that should NOT come back when the filter
      // pins type to the newsletter value.
      {
        id: 'plan-other-1',
        team_id: 'team-1',
        coach_id: 'coach-1',
        type: 'practice',
        content: '{}',
      },
    ];

    const res = await call({
      table: 'plans',
      filters: { type: 'mid_season_team_newsletter' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe('plan-newsletter-1');
    expect(body.data[0].type).toBe('mid_season_team_newsletter');
  });
});
