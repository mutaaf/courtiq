/**
 * Ticket 0057 — GET /api/weekly-pulse/[token].
 *
 * Public, no auth. Resolves a token → its active weekly_pulse_shares row →
 * joins live to teams / sports / observations / sessions / coaches to compute
 * the team-level aggregate the public /week/[token] page renders.
 *
 * The payload is an allow-list of EXACTLY these keys (plus `referralCode`):
 *
 *   ageGroup, caption, coachFirstName, focusLine, isoWeek,
 *   sessionCount, sportName, teamName, topCategories, referralCode
 *
 * Anything else (last name, email, player names, observation text, parent
 * contact) is structurally absent.
 *
 * Acceptance criteria → tests:
 *  - 404 when the token does not exist or the share is inactive.
 *  - 200 happy path returns exactly the public allow-list keys (sorted, deep
 *    equal).
 *  - The coach's LAST NAME and email are never in the payload.
 *  - Planted player names in joined observations rows do NOT appear in the
 *    response.
 *  - The referralCode is the deterministic makeReferralCode(coach.id) — the
 *    page's CTA can deep-link /signup?ref=<code> for warm-landing per
 *    0011/0021. Client-supplied refs never reach this route.
 *
 * Mocking pattern mirrors tests/api/practice-plan-shares-token-get.test.ts.
 * .test.ts NOT .spec.ts (LESSONS#38). The route signature is
 * GET(_req, { params }) so we pass `params` as a Promise (Next 14+ async).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeReferralCode } from '@/lib/referral-code';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({
    from: mockFromFn,
  })),
}));

import { GET } from '@/app/api/weekly-pulse/[token]/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function makeRequest() {
  return new Request('http://localhost/api/weekly-pulse/abc');
}

function paramsFor(token: string) {
  return { params: Promise.resolve({ token }) };
}

const COACH_ID = '00000000-0000-4000-a000-000000000001';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';

const SHARE_ROW = {
  id: 'pulse-1',
  token: 'abc',
  coach_id: COACH_ID,
  team_id: TEAM_ID,
  iso_week: '2026-W22',
  caption: 'anyone want to swap closeout drills?',
  is_active: true,
};

const TEAM_ROW = {
  id: TEAM_ID,
  name: 'E2E Test Team',
  age_group: '11-13',
  org_id: 'org-1',
  sport_id: 'sport-1',
};

const COACH_ROW = { id: COACH_ID, full_name: 'Sasha Williams' };
const SPORT_ROW = { id: 'sport-1', name: 'Basketball' };

const OBS_ROWS = [
  // Per-player rows the route SHOULD read for category counts but NEVER expose.
  // The text/player_id fields exist; the route doesn't select them.
  { id: 'o1', category: 'Defense', sentiment: 'positive', created_at: '2026-05-26T14:00:00Z' },
  { id: 'o2', category: 'Defense', sentiment: 'needs-work', created_at: '2026-05-27T14:00:00Z' },
  { id: 'o3', category: 'Effort', sentiment: 'positive', created_at: '2026-05-28T14:00:00Z' },
];

const SESSION_ROWS = [
  { id: 's1', date: '2026-05-26' },
  { id: 's2', date: '2026-05-28' },
];

describe('GET /api/weekly-pulse/[token] (ticket 0057)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 404 when the token is missing or inactive', async () => {
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await GET(makeRequest(), paramsFor('bad-token'));
    expect(res.status).toBe(404);
  });

  it('happy path returns the EXACT public-key allow-list (keyset assertion)', async () => {
    // The route reads in this order: weekly_pulse_shares → teams → coaches →
    // sports → observations → sessions → readProgramFocus (teams +
    // config_overrides) → plans for coach signature.
    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))   // weekly_pulse_shares
      .mockReturnValueOnce(buildChain(TEAM_ROW))    // teams
      .mockReturnValueOnce(buildChain(COACH_ROW))   // coaches
      .mockReturnValueOnce(buildChain(SPORT_ROW))   // sports
      .mockReturnValueOnce(buildChain(OBS_ROWS))    // observations
      .mockReturnValueOnce(buildChain(SESSION_ROWS)) // sessions
      // readProgramFocus reads teams again (for org/tier) then config_overrides.
      // The team is on a non-Org tier in this fixture, so the helper short-
      // circuits to null after the teams read — no config_overrides read.
      .mockReturnValueOnce(buildChain({ org_id: 'org-1', organizations: { tier: 'free' } }))
      // Coach-signature plans read (returns < MIN_PLANS_FOR_SIGNATURE so the
      // signature is null and focusLine ends up null on this fixture).
      .mockReturnValueOnce(buildChain([]));

    const res = await GET(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Sorted keyset assertion — the test fails the moment a future widening
    // adds an extra field to the public response.
    const keys = Object.keys(body).sort();
    expect(keys).toEqual([
      'ageGroup',
      'caption',
      'coachFirstName',
      'focusLine',
      'isoWeek',
      'referralCode',
      'sessionCount',
      'sportName',
      'teamName',
      'topCategories',
    ]);

    expect(body.coachFirstName).toBe('Sasha'); // first name only
    expect(body.teamName).toBe('E2E Test Team');
    expect(body.sportName).toBe('Basketball');
    expect(body.ageGroup).toBe('11-13');
    expect(body.isoWeek).toBe('2026-W22');
    expect(body.sessionCount).toBe(2);
    expect(body.topCategories).toEqual(['Defense', 'Effort']);
    expect(body.caption).toBe('anyone want to swap closeout drills?');
    // No plans → no signature → no focus line on this fixture.
    expect(body.focusLine).toBeNull();
  });

  it('returns the publisher referral code computed server-side (forged refs cannot leak in)', async () => {
    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(TEAM_ROW))
      .mockReturnValueOnce(buildChain(COACH_ROW))
      .mockReturnValueOnce(buildChain(SPORT_ROW))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain({ org_id: 'org-1', organizations: { tier: 'free' } }))
      .mockReturnValueOnce(buildChain([]));

    const res = await GET(makeRequest(), paramsFor('abc'));
    const body = (await res.json()) as { referralCode?: string };
    // The deterministic code for an all-zero hex coach UUID is 'AAAAAA'
    // (the e2e seed comment captures this exact value).
    expect(body.referralCode).toBe(makeReferralCode(COACH_ID));
    expect(body.referralCode).toBe('AAAAAA');
  });

  it('NEVER returns the coach last name, email, player names, or observation text', async () => {
    // Plant rows with the bad fields populated so the route's allow-list is
    // the only thing preventing leakage.
    const obsWithSecrets = [
      {
        id: 'o1',
        category: 'Defense',
        sentiment: 'positive',
        created_at: '2026-05-26T14:00:00Z',
        // The route never selects these; if it did, they would appear in the
        // serialized response and the assertions below would fail.
        text: 'Alice Walker was great today',
        player_id: '00000000-0000-4000-a000-000000000030',
      },
    ];
    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(TEAM_ROW))
      .mockReturnValueOnce(buildChain({
        id: COACH_ID,
        full_name: 'Sasha Williams',
        // The route does NOT select email, but planting one would expose any
        // accidental select('*') regression.
        email: 'sasha@example.com',
      }))
      .mockReturnValueOnce(buildChain(SPORT_ROW))
      .mockReturnValueOnce(buildChain(obsWithSecrets))
      .mockReturnValueOnce(buildChain(SESSION_ROWS))
      .mockReturnValueOnce(buildChain({ org_id: 'org-1', organizations: { tier: 'free' } }))
      .mockReturnValueOnce(buildChain([]));

    const res = await GET(makeRequest(), paramsFor('abc'));
    const body = await res.json();
    const serialized = JSON.stringify(body);

    // Coach last-name + email never cross.
    expect(serialized).not.toContain('Williams');
    expect(serialized).not.toContain('sasha@example.com');
    // No player names / observation text / parent / medical / dob.
    expect(serialized).not.toContain('Alice Walker');
    expect(serialized).not.toContain('was great today');
    expect(serialized).not.toContain('parent');
    expect(serialized).not.toContain('medical');
    expect(serialized).not.toContain('dob');
  });
});
