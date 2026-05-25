/**
 * Ticket 0029 — GET /api/observe/[token] now carries the host coach's
 * deterministic referral code so the public observer page can deep-link a helper
 * to /signup?ref=CODE after they have saved an observation.
 *
 * These specs assert (1:1 with the ticket's acceptance criteria):
 *  - a valid token's GET payload includes `referralCode` == makeReferralCode(coach_id)
 *  - the ONLY new field versus the pre-0029 payload is `referralCode` (no new
 *    coach-private field, no new player-scoped field)
 *  - an invalid / expired token still returns 401 and leaks no referralCode or
 *    coach data (regression on the existing token-validation path)
 *  - COPPA: the player rows in the payload are unchanged and carry no new fields
 *  - the POST contract is untouched (still 201 on save; rate limit still 429s)
 *
 * The GET handler reads `params` (a Promise) and takes a `Request` first arg, so
 * it is invoked with its real signature (LESSONS.md 2026-05-21). Run `tsc
 * --noEmit` after editing this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFromFn, mockValidate, mockRateLimit } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
  mockValidate: vi.fn(),
  mockRateLimit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  // The public observe route uses ONLY the service client; no auth.
  createServiceSupabase: vi.fn(async () => ({
    from: mockFromFn,
  })),
}));

// Keep the real template helpers / payload builder; only stub the token
// validation + rate limit so the test controls auth + the rate-limit branch.
vi.mock('@/lib/observer-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/observer-utils')>();
  return {
    ...actual,
    validateObserverToken: mockValidate,
    checkObserverRateLimit: mockRateLimit,
  };
});

import { GET, POST } from '@/app/api/observe/[token]/route';
import { makeReferralCode } from '@/lib/referral-code';
import { OBSERVATION_TEMPLATES } from '@/lib/observation-templates';

// A chain that resolves `data` for terminal `.single()` and is awaitable
// directly (multi-row reads do `await query`).
function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (resolve: (v: typeof resolved) => unknown) => resolve(resolved),
  };
  return chain;
}

// The seeded host coach id whose deterministic referral code the payload carries.
const COACH_ID = '11111111-2222-4333-8444-555555555555';
const SESSION_ID = 'sess-1';
const TEAM_ID = 'team-1';

const SESSION_ROW = {
  id: SESSION_ID,
  team_id: TEAM_ID,
  coach_id: COACH_ID,
  type: 'practice',
  date: '2026-05-25',
  location: 'Main Gym',
  opponent: null,
};

// Player rows the GET resolves — exactly the pre-0029 shape (id/name/nickname/
// jersey_number). The COPPA assertion is that NO new field is added to these.
const PLAYER_ROWS = [
  { id: 'p-1', name: 'Alice Walker', nickname: null, jersey_number: 1 },
  { id: 'p-2', name: 'Bob Carter', nickname: 'Bobby', jersey_number: 5 },
];

function wireGet() {
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'sessions') return buildChain(SESSION_ROW);
    if (table === 'teams') return buildChain({ name: 'E2E Test Team', age_group: '11-13' });
    if (table === 'coaches') return buildChain({ full_name: 'Maria Lopez' });
    if (table === 'players') return buildChain(PLAYER_ROWS);
    return buildChain(null);
  });
}

function callGet(token: string) {
  const request = new Request(`http://localhost/api/observe/${token}`);
  return GET(request, { params: Promise.resolve({ token }) });
}

describe('GET /api/observe/[token] — referral code (ticket 0029)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue({ sessionId: SESSION_ID });
    mockRateLimit.mockReturnValue(true);
  });

  // AC: payload includes referralCode == makeReferralCode(coach_id).
  it('includes the host coach deterministic referralCode in the payload', async () => {
    wireGet();
    const res = await callGet('valid.token');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.referralCode).toBe(makeReferralCode(COACH_ID));
  });

  // AC: the ONLY new field vs the pre-0029 payload is referralCode — no new
  // coach-private field, no new player-scoped field.
  it('adds exactly { referralCode } and nothing else to the payload top level', async () => {
    wireGet();
    const res = await callGet('valid.token');
    const body = await res.json();

    // The pre-0029 payload keys (read off the route before this ticket).
    const PRE_0029_KEYS = [
      'session',
      'team',
      'coachName',
      'players',
      'teamId',
      'coachId',
    ];
    const newKeys = Object.keys(body).filter((k) => !PRE_0029_KEYS.includes(k));
    expect(newKeys).toEqual(['referralCode']);
  });

  // AC / COPPA: the player rows are unchanged and carry no new fields, and no
  // per-minor data leaks through the new code path.
  it('leaves the player rows unchanged — no new per-minor field (COPPA)', async () => {
    wireGet();
    const res = await callGet('valid.token');
    const body = await res.json();

    expect(Array.isArray(body.players)).toBe(true);
    expect(body.players).toHaveLength(PLAYER_ROWS.length);
    for (let i = 0; i < PLAYER_ROWS.length; i++) {
      // Exact same key set as the seeded/selected row — nothing added.
      expect(Object.keys(body.players[i]).sort()).toEqual(
        Object.keys(PLAYER_ROWS[i]).sort()
      );
    }
  });

  // AC: invalid / expired token → 401, no referralCode or coach data leaked.
  it('returns 401 for an invalid/expired token and leaks no referralCode or coach data', async () => {
    mockValidate.mockReturnValue(null);
    const res = await callGet('bad.token');
    expect(res.status).toBe(401);
    const body = await res.json().catch(() => ({}));
    expect(body.referralCode).toBeUndefined();
    expect(body.coachName).toBeUndefined();
    expect(body.coachId).toBeUndefined();
    expect(body.players).toBeUndefined();
  });
});

// ── POST regression — the save contract is untouched by 0029 ────────────────

function callPost(token: string, payload: Record<string, unknown>) {
  const request = new Request(`http://localhost/api/observe/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return POST(request, { params: Promise.resolve({ token }) });
}

describe('POST /api/observe/[token] — contract untouched (ticket 0029 regression)', () => {
  const TEMPLATE_ID = OBSERVATION_TEMPLATES[0].id;

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue({ sessionId: SESSION_ID });
    mockRateLimit.mockReturnValue(true);
  });

  it('still returns 201 on a successful save', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'sessions') return buildChain({ team_id: TEAM_ID, coach_id: COACH_ID });
      if (table === 'players') return buildChain({ id: 'p-1' });
      if (table === 'observations') return buildChain({ id: 'obs-1' });
      return buildChain(null);
    });

    const res = await callPost('valid.token', { templateId: TEMPLATE_ID, playerId: 'p-1' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('obs-1');
  });

  it('still enforces the IP rate limit (429 when exceeded)', async () => {
    mockRateLimit.mockReturnValue(false);
    const res = await callPost('valid.token', { templateId: TEMPLATE_ID, playerId: 'p-1' });
    expect(res.status).toBe(429);
  });
});
