/**
 * Tests for GET /api/ai/usage — the read-only AI quota meter endpoint that
 * powers the "N of 5 AI notes left" line on the Capture surface (ticket 0008).
 *
 * The route is pure reporting: it authenticates via createServerSupabase, then
 * delegates the count to the existing getAIQuotaStatus() in src/lib/ai/quota.ts
 * using a service-role client. There is NO enforcement here — callAI() already
 * enforces the cap. These tests assert the four count-scoping criteria plus the
 * shape per tier and the no-auth path.
 *
 * Strategy mirrors tests/api-routes.test.ts: the whole @/lib/supabase/server
 * module is replaced with a chainable in-memory mock. The route exercises the
 * REAL getAIQuotaStatus logic, so the mock must:
 *   - resolve coaches(...).single() → the coach row (carries organizations.tier)
 *   - resolve the ai_interactions count chain (terminal .gte()) → { count }
 * The count chain captures the .eq()/.gte() filters so we can prove the route
 * only counts status='success' rows in the current calendar month.
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
    from: mockFromFn,
  })),
}));

import { GET as usageGet } from '@/app/api/ai/usage/route';

// ─── Mock helpers ──────────────────────────────────────────────────────────────

/** Chainable mock whose terminal `.single()` resolves with the given coach row. */
function coachChain(data: unknown) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return chain;
}

/**
 * Chainable mock for the ai_interactions count query. The query is awaited at
 * the terminal `.gte(...)` (head:true count), so `.gte()` must return a thenable
 * resolving `{ count }`. We capture every filter so tests can assert scoping.
 */
function countChain(count: number, captured: { eqs: [string, unknown][]; gtes: [string, unknown][] }) {
  const resolved = { count, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      captured.eqs.push([col, val]);
      return chain;
    }),
    // `.gte()` is the terminal call — make it thenable so `await` resolves it.
    gte: vi.fn((col: string, val: unknown) => {
      captured.gtes.push([col, val]);
      return Promise.resolve(resolved);
    }),
  };
  return chain;
}

function setAuthUser(id = 'coach-123') {
  mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function setNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

/**
 * Wire mockFromFn so coaches → the given tier and ai_interactions → the given
 * count. Returns the captured-filters object so tests can assert scoping.
 */
function wireTierAndCount(tier: string, count: number) {
  const captured = { eqs: [] as [string, unknown][], gtes: [] as [string, unknown][] };
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') return coachChain({ organizations: { tier } });
    if (table === 'ai_interactions') return countChain(count, captured);
    return coachChain(null);
  });
  return captured;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/ai/usage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 and reads no interactions when unauthenticated', async () => {
    setNoAuth();
    const res = await usageGet();
    expect(res.status).toBe(401);
    // No DB read of any coach's interactions on the no-auth path.
    expect(mockFromFn).not.toHaveBeenCalledWith('ai_interactions');
  });

  it('returns 200 { used, limit, tier, remaining } for a free-tier coach', async () => {
    setAuthUser();
    wireTierAndCount('free', 2);
    const res = await usageGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ used: 2, limit: 5, tier: 'free', remaining: 3 });
    expect(body.unlimited).toBeUndefined();
  });

  it('clamps remaining at 0 when the free coach is over the cap', async () => {
    setAuthUser();
    wireTierAndCount('free', 7);
    const res = await usageGet();
    const body = await res.json();
    expect(body.remaining).toBe(0); // Math.max(0, 5 - 7)
    expect(body.used).toBe(7);
  });

  it.each(['coach', 'pro_coach', 'organization'])(
    'returns 200 { unlimited: true, tier } with no numeric remaining for the %s tier',
    async (tier) => {
      setAuthUser();
      wireTierAndCount(tier, 3);
      const res = await usageGet();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ unlimited: true, tier });
      expect(body.remaining).toBeUndefined();
      expect(body.used).toBeUndefined();
    }
  );

  it('scopes the count to the current calendar month (gte month-start)', async () => {
    setAuthUser();
    const captured = wireTierAndCount('free', 1);
    await usageGet();

    // The count must be filtered by created_at >= the 1st of the current month
    // at local midnight — a prior-month row falls below this floor and is excluded.
    const gte = captured.gtes.find(([col]) => col === 'created_at');
    expect(gte).toBeDefined();
    const floor = new Date(gte![1] as string);
    const now = new Date();
    expect(floor.getDate()).toBe(1);
    expect(floor.getMonth()).toBe(now.getMonth());
    expect(floor.getFullYear()).toBe(now.getFullYear());
    // A row created the day before the floor would not satisfy the gte filter.
    const priorMonthRow = new Date(floor.getTime() - 86_400_000);
    expect(priorMonthRow.getTime()).toBeLessThan(floor.getTime());
  });

  it("only counts status='success' interactions", async () => {
    setAuthUser();
    const captured = wireTierAndCount('free', 1);
    await usageGet();

    // The count query must filter status='success', so a seeded status='error'
    // row never increments `used`.
    const statusFilter = captured.eqs.find(([col]) => col === 'status');
    expect(statusFilter).toEqual(['status', 'success']);
  });

  it('scopes the count to the requesting coach', async () => {
    setAuthUser('coach-xyz');
    const captured = wireTierAndCount('free', 0);
    await usageGet();
    const coachFilter = captured.eqs.find(([col]) => col === 'coach_id');
    expect(coachFilter).toEqual(['coach_id', 'coach-xyz']);
  });
});
