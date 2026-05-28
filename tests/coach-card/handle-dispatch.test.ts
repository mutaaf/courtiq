/**
 * Ticket 0054 — /api/coach-card/[token] also accepts a handle.
 *
 * The dynamic [token] segment now dispatches on shape:
 *   - matches the handle regex (lowercase alphanumeric + hyphens, 2–32) →
 *     look up coaches.handle, then the coach's active coach_card_shares row,
 *     and render the SAME payload the token path renders.
 *   - otherwise → the existing token lookup (byte-identical to ticket 0026).
 * The handle is purely additive: the token URL keeps working forever.
 *
 * If a coach has a handle but NO active coach_card_shares row, the route
 * returns 404 (the handle re-routes an existing public profile; it is not a
 * new one).
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({
    from: mockFromFn,
  })),
}));

import { GET as publicGet } from '@/app/api/coach-card/[token]/route';

function buildChain(data: unknown = null, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (resolve: (v: typeof resolved) => unknown) => resolve(resolved),
  };
  return chain;
}

function call(segment: string) {
  const request = new Request(`http://localhost/api/coach-card/${segment}`);
  return publicGet(request, { params: Promise.resolve({ token: segment }) });
}

describe('GET /api/coach-card/[token] — handle dispatch (ticket 0054)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('resolves a handle to the same coach card payload as the token', async () => {
    const HANDLE = 'sarah-rodriguez';
    const COACH_ID = 'coach-handle-1';

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        // First the handle-shape branch SELECTs by handle; later the standard
        // coach lookup SELECTs by id. Both return the same row.
        return buildChain({
          id: COACH_ID,
          full_name: 'Sarah Rodriguez',
          preferences: { referral_code: 'ABC234' },
        });
      }
      if (table === 'coach_card_shares') {
        return buildChain({ id: 'ccs-1', token: 'realtoken', coach_id: COACH_ID, is_active: true });
      }
      if (table === 'team_coaches') return buildChain([{ team_id: 'team-1' }]);
      if (table === 'teams')
        return buildChain([{ id: 'team-1', name: 'Hawks', age_group: 'U10', sport_id: 'sport-bball' }]);
      if (table === 'sports') return buildChain([{ id: 'sport-bball', name: 'Basketball' }]);
      if (table === 'sessions') return buildChain([], null, 7);
      if (table === 'observations')
        return buildChain([{ player_id: 'p-1' }, { player_id: 'p-2' }], null, 2);
      return buildChain(null);
    });

    const res = await call(HANDLE);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.display_name).toBe('Sarah Rodriguez');
    expect(body.sports).toContain('Basketball');
    expect(body.referral_code).toBe('ABC234');
  });

  it('returns 404 when the handle exists but the coach has no active coach_card_shares row', async () => {
    const HANDLE = 'sarah-rodriguez';
    const COACH_ID = 'coach-handle-1';

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        // The handle resolves to a coach…
        return buildChain({ id: COACH_ID, full_name: 'Sarah Rodriguez', preferences: {} });
      }
      if (table === 'coach_card_shares') {
        // …but no active coach-card share exists for them.
        return buildChain(null);
      }
      return buildChain(null);
    });

    const res = await call(HANDLE);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the handle does not resolve to any coach', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildChain(null);
      return buildChain(null);
    });

    const res = await call('nobody-claimed-this');
    expect(res.status).toBe(404);
  });

  it('still resolves the original token path byte-identically', async () => {
    // 32-char hex token — the existing ticket 0026 shape. The route MUST dispatch
    // to coach_card_shares (NOT coaches.handle).
    const TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeef';

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_card_shares') {
        return buildChain({ id: 'ccs-1', token: TOKEN, coach_id: 'coach-tok-1', is_active: true });
      }
      if (table === 'coaches') {
        return buildChain({ id: 'coach-tok-1', full_name: 'Token Coach', preferences: { referral_code: 'TOKREF' } });
      }
      if (table === 'team_coaches') return buildChain([]);
      if (table === 'teams') return buildChain([]);
      if (table === 'sports') return buildChain([]);
      if (table === 'sessions') return buildChain([], null, 0);
      if (table === 'observations') return buildChain([], null, 0);
      return buildChain(null);
    });

    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.display_name).toBe('Token Coach');
    expect(body.referral_code).toBe('TOKREF');

    // The first table consulted was coach_card_shares (token path), NOT coaches.
    const firstFromCall = String(mockFromFn.mock.calls[0]?.[0] ?? '');
    expect(firstFromCall).toBe('coach_card_shares');
  });
});
