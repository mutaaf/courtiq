/**
 * Ticket 0026 — GET /api/coach-card/[token] (public, no auth)
 *
 * The public read resolves a token → the coach, derives the sports/age-groups they
 * coach (from their teams, never a new field), computes a few aggregate counts, and
 * resolves the coach's lazily-generated referral code so the public page can deep-
 * link to /signup?ref=CODE. These specs assert:
 *  - 404 for an unknown / inactive token (no coach data leaked)
 *  - 200 returns ONLY the allow-listed payload keys (display_name, sports,
 *    age_groups, stats block, referral_code) — an allow-list, not a deny-list
 *  - the referral code is lazily generated + persisted when the coach has none
 *    (same deterministic algorithm as /api/referrals via makeReferralCode)
 *  - COPPA: NO per-minor data — no player name, jersey, observation text; counts
 *    are aggregate integers only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  // The public route uses ONLY the service client; no auth.
  createServiceSupabase: vi.fn(async () => ({
    from: mockFromFn,
  })),
}));

import { GET as publicGet } from '@/app/api/coach-card/[token]/route';
import { makeReferralCode } from '@/lib/referral-code';

// A chain that resolves to `data` for terminal calls AND is awaitable directly
// (the count queries do `await query` without .single()). It also supports being
// returned from .select(... ,{count}).
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
    // Awaiting the builder directly (used by count + multi-row reads).
    then: (resolve: (v: typeof resolved) => unknown) => resolve(resolved),
  };
  return chain;
}

// The exact set of keys the public payload is allowed to expose. Anything outside
// this set is a COPPA / data-minimization regression.
const ALLOWED_KEYS = [
  'display_name',
  'sports',
  'age_groups',
  'weeks_coaching',
  'practices_logged',
  'players_observed',
  'referral_code',
].sort();

function call(token: string) {
  const request = new Request(`http://localhost/api/coach-card/${token}`);
  return publicGet(request, { params: Promise.resolve({ token }) });
}

// Wire up a coach with two teams (basketball U10, soccer U12), 14 practices,
// 31 observed players, and a poisoned per-minor row that MUST never surface.
function wireHappyPath(opts: {
  coach: Record<string, unknown>;
  share?: Record<string, unknown>;
  coachChain?: ReturnType<typeof buildChain>;
} = { coach: {} }) {
  const share = opts.share ?? {
    id: 'ccs-1',
    token: 'tok-1',
    coach_id: 'coach-1',
    is_active: true,
  };
  const coachChain = opts.coachChain ?? buildChain(opts.coach);

  // teams the coach is on (via team_coaches), each carrying age_group + sport_id.
  const teamCoachRows = [
    { team_id: 'team-1' },
    { team_id: 'team-2' },
  ];
  const teamRows = [
    { id: 'team-1', name: 'Hawks', age_group: 'U10', sport_id: 'sport-bball' },
    { id: 'team-2', name: 'Rovers', age_group: 'U12', sport_id: 'sport-soccer' },
  ];
  const sportRows = [
    { id: 'sport-bball', name: 'Basketball' },
    { id: 'sport-soccer', name: 'Soccer' },
  ];

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coach_card_shares') return buildChain(share);
    if (table === 'coaches') return coachChain;
    if (table === 'team_coaches') return buildChain(teamCoachRows);
    if (table === 'teams') return buildChain(teamRows);
    if (table === 'sports') return buildChain(sportRows);
    // sessions practice count = 14, observations distinct players = 31.
    if (table === 'sessions') return buildChain([], null, 14);
    if (table === 'observations')
      return buildChain(
        // distinct-player rows the route counts; these carry NO minor identity.
        Array.from({ length: 31 }, (_, i) => ({ player_id: `p-${i}` })),
        null,
        31,
      );
    return buildChain(null);
  });
}

describe('GET /api/coach-card/[token]', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC: unknown / inactive token → 404, no coach data.
  it('returns 404 for an unknown / inactive token and leaks no coach data', async () => {
    mockFromFn.mockReturnValue(buildChain(null)); // no coach_card_shares row
    const res = await call('no-such-token');
    expect([404, 410]).toContain(res.status);
    const body = await res.json().catch(() => ({}));
    expect(body.display_name).toBeUndefined();
    expect(body.referral_code).toBeUndefined();
  });

  // AC: 200 returns ONLY the allow-listed keys — display_name, sports, age_groups,
  // the stats block, and referral_code.
  it('returns exactly the allow-listed payload keys (allow-list, not deny-list)', async () => {
    wireHappyPath({
      coach: { id: 'coach-1', full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } },
    });

    const res = await call('tok-1');
    expect(res.status).toBe(200);
    const body = await res.json();

    // The serialized payload keys are EXACTLY the allow-list.
    expect(Object.keys(body).sort()).toEqual(ALLOWED_KEYS);

    // Coach-level fields present.
    expect(body.display_name).toBe('Coach Rivera');
    expect(Array.isArray(body.sports)).toBe(true);
    expect(body.sports).toContain('Basketball');
    expect(body.sports).toContain('Soccer');
    expect(Array.isArray(body.age_groups)).toBe(true);
    expect(body.age_groups).toContain('U10');
    expect(body.age_groups).toContain('U12');

    // Stats block — aggregate integers only.
    expect(Number.isInteger(body.practices_logged)).toBe(true);
    expect(body.practices_logged).toBe(14);
    expect(Number.isInteger(body.players_observed)).toBe(true);
    expect(body.players_observed).toBe(31);
    expect(Number.isInteger(body.weeks_coaching)).toBe(true);
    expect(body.weeks_coaching).toBeGreaterThanOrEqual(0);

    // Referral code present so the CTA can deep-link.
    expect(body.referral_code).toBe('ABC234');
  });

  // AC: lazily generates + persists the referral code when the coach has none.
  it('lazily generates + persists the referral code when the coach has none', async () => {
    const coachId = '11111111-2222-4333-8444-555555555555';
    const expectedCode = makeReferralCode(coachId);
    const coachChain = buildChain({ id: coachId, full_name: 'Coach Rivera', preferences: {} });
    wireHappyPath({
      coach: { id: coachId, full_name: 'Coach Rivera', preferences: {} },
      share: { id: 'ccs-1', token: 'tok-1', coach_id: coachId, is_active: true },
      coachChain,
    });

    const res = await call('tok-1');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.referral_code).toBe(expectedCode);
    // …and it was persisted back to the coaches row.
    expect(coachChain.update).toHaveBeenCalled();
  });

  // AC / COPPA: no per-minor data anywhere. Counts are aggregate integers; no
  // player name, jersey, or observation text appears in the serialized response.
  it('never leaks per-minor data — counts only, no player names / jersey / observation text (COPPA)', async () => {
    // Poison the underlying rows with minor-identifying data the route must NOT
    // pass through: a player name + jersey on the observations rows.
    const share = { id: 'ccs-1', token: 'tok-1', coach_id: 'coach-1', is_active: true };
    const coach = { id: 'coach-1', full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } };
    const teamCoachRows = [{ team_id: 'team-1' }];
    const teamRows = [{ id: 'team-1', name: 'Hawks', age_group: 'U10', sport_id: 'sport-bball' }];
    const sportRows = [{ id: 'sport-bball', name: 'Basketball' }];

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_card_shares') return buildChain(share);
      if (table === 'coaches') return buildChain(coach);
      if (table === 'team_coaches') return buildChain(teamCoachRows);
      if (table === 'teams') return buildChain(teamRows);
      if (table === 'sports') return buildChain(sportRows);
      if (table === 'sessions') return buildChain([], null, 7);
      if (table === 'observations')
        return buildChain(
          [
            { player_id: 'p-1', player_name: 'Alice Walker', jersey_number: 7, text: 'Great defense' },
            { player_id: 'p-2', player_name: 'Bob Carter', jersey_number: 5, text: 'Strong finish' },
          ],
          null,
          2,
        );
      return buildChain(null);
    });

    const res = await call('tok-1');
    const raw = JSON.stringify(await res.json());

    // No minor-identifying tokens anywhere in the serialized payload.
    expect(raw).not.toContain('Alice Walker');
    expect(raw).not.toContain('Bob Carter');
    expect(raw).not.toContain('player_name');
    expect(raw).not.toContain('jersey');
    expect(raw).not.toContain('Great defense');
    expect(raw).not.toContain('Strong finish');

    // The payload still exposes only the allow-list.
    const body = JSON.parse(raw);
    expect(Object.keys(body).sort()).toEqual(ALLOWED_KEYS);
    expect(body.players_observed).toBe(2);
  });
});
