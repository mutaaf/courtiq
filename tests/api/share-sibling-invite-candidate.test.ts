/**
 * Ticket 0060 — GET /api/share/[token]/sibling-invite-candidate.
 *
 * The route resolves the inviting parent's email from the seeded `players`
 * row behind the share token, then looks for another active `players` row
 * with the SAME parent_email (case-insensitive) on a DIFFERENT team. The
 * response is shaped so the parent-portal card can decide between three
 * surfaces:
 *
 *   200 { candidate: { otherTeamName, otherCoachName, otherCoachEmail,
 *                      siblingFirstName, programId }, alreadyOnSportsIQ: false }
 *     — second kid found on a not-yet-SportsIQ team (the modal v1 case).
 *
 *   200 { candidate: null, alreadyOnSportsIQ: true }
 *     — second kid found on a team whose head coach is ALREADY on SportsIQ;
 *     the UI pivots to the existing 0019 self-signup surface.
 *
 *   200 { candidate: null, alreadyOnSportsIQ: false }
 *     — no second kid at all (the modal case — the most common shape).
 *
 *   404 — tampered or unknown token.
 *
 * COPPA contract: the candidate-lookup `.select()` MUST be exactly
 * `'id, name, team_id, parent_email'` so a planted `date_of_birth` /
 * `medical_notes` / `parent_phone` row on the matched team can never leak;
 * `siblingFirstName = name.split(' ')[0]`. No last name, no DOB, no anything
 * else.
 *
 * Per LESSONS#0057: team-ownership lookups go through `team_coaches`, NEVER
 * `teams.coach_id`. The "is the other team's coach already on SportsIQ"
 * check joins via `team_coaches` -> `coaches` -> `email`.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SHARE_TOKEN = 'test-share-token-e2e-001';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET } from '@/app/api/share/[token]/sibling-invite-candidate/route';

// ─── Chain helpers ────────────────────────────────────────────────────────────

interface Resolved<T = unknown> {
  data: T | null;
  error: unknown;
}

/** A chainable Supabase query-builder mock that resolves to `{ data, error }`. */
function buildChain<T = unknown>(data: T | null = null, error: unknown = null) {
  const resolved: Resolved<T> = { data, error };
  const selectCalls: string[] = [];
  const chain: Record<string, unknown> = {
    select: vi.fn((sel: string) => {
      selectCalls.push(sel);
      return chain;
    }),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: Resolved<T>) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
    _selectCalls: selectCalls,
  };
  return chain;
}

function makeRequest(token: string = SHARE_TOKEN) {
  return new Request(
    `http://localhost/api/share/${token}/sibling-invite-candidate`,
  );
}

const tokenParams = (token: string = SHARE_TOKEN) =>
  Promise.resolve({ token });

// Common fixtures
const E2E_SHARE = {
  id: '00000000-0000-4000-a000-000000000060',
  player_id: '00000000-0000-4000-a000-000000000030',
  team_id: '00000000-0000-4000-a000-000000000020',
  coach_id: '00000000-0000-4000-a000-000000000001',
  is_active: true,
  expires_at: null,
};

const E2E_SOURCE_PLAYER = {
  id: '00000000-0000-4000-a000-000000000030',
  name: 'Alice Walker',
  team_id: '00000000-0000-4000-a000-000000000020',
  parent_email: 'sarah@walker-family.test',
};

const E2E_SOURCE_TEAM = {
  id: '00000000-0000-4000-a000-000000000020',
  org_id: '00000000-0000-4000-a000-000000000010',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/share/[token]/sibling-invite-candidate (ticket 0060)', () => {
  beforeEach(() => {
    // Drain the queue and call records between tests (LESSONS#0049 / #0092).
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns { candidate: null, alreadyOnSportsIQ: false } when the parent has no second kid', async () => {
    // 1) parent_shares lookup → share row
    // 2) players lookup for source player (id, name, team_id, parent_email)
    // 3) teams lookup for source team (org_id)
    // 4) players sibling search → no match
    mockFromFn
      .mockReturnValueOnce(buildChain(E2E_SHARE))
      .mockReturnValueOnce(buildChain(E2E_SOURCE_PLAYER))
      .mockReturnValueOnce(buildChain(E2E_SOURCE_TEAM))
      .mockReturnValueOnce(buildChain([]));

    const res = await GET(makeRequest(), { params: tokenParams() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.candidate).toBeNull();
    expect(json.alreadyOnSportsIQ).toBe(false);
  });

  it('returns a populated candidate when a second kid lives on a not-yet-SportsIQ team', async () => {
    const siblingRow = {
      id: '00000000-0000-4000-a000-0000000000c1',
      name: 'Sofia Walker',
      team_id: '00000000-0000-4000-a000-0000000000c2',
      parent_email: 'sarah@walker-family.test',
    };
    const siblingTeam = {
      id: '00000000-0000-4000-a000-0000000000c2',
      name: 'Hornets U10',
    };
    // The OTHER team's head coach IS on SportsIQ records (we have a coaches
    // row) but their email is NOT in our `coaches.email` index of *active*
    // coaches — meaning the other team is seeded into our system by the
    // inviting coach via roster import, but its assigned head coach has not
    // yet signed up. The candidate route surfaces them as the invite target.
    const otherCoachJoin = {
      coach_id: '00000000-0000-4000-a000-0000000000c0',
      coaches: {
        id: '00000000-0000-4000-a000-0000000000c0',
        full_name: 'Coach Riley',
        email: 'riley@hornets.test',
      },
    };

    mockFromFn
      .mockReturnValueOnce(buildChain(E2E_SHARE)) // parent_shares
      .mockReturnValueOnce(buildChain(E2E_SOURCE_PLAYER)) // players (source)
      .mockReturnValueOnce(buildChain(E2E_SOURCE_TEAM)) // teams (source -> org)
      .mockReturnValueOnce(buildChain([siblingRow])) // players (sibling search)
      .mockReturnValueOnce(buildChain(siblingTeam)) // teams (sibling)
      .mockReturnValueOnce(buildChain(otherCoachJoin)) // team_coaches join (head coach)
      .mockReturnValueOnce(buildChain([])); // coaches search by email → empty (not on SportsIQ)

    const res = await GET(makeRequest(), { params: tokenParams() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadyOnSportsIQ).toBe(false);
    expect(json.candidate).not.toBeNull();
    expect(json.candidate.otherTeamName).toBe('Hornets U10');
    expect(json.candidate.otherCoachName).toBe('Coach Riley');
    expect(json.candidate.otherCoachEmail).toBe('riley@hornets.test');
    expect(json.candidate.siblingFirstName).toBe('Sofia');
    expect(json.candidate.programId).toBe('00000000-0000-4000-a000-000000000010');
  });

  it('returns { candidate: null, alreadyOnSportsIQ: true } when the other coach is already on SportsIQ', async () => {
    const siblingRow = {
      id: '00000000-0000-4000-a000-0000000000c1',
      name: 'Sofia Walker',
      team_id: '00000000-0000-4000-a000-0000000000c2',
      parent_email: 'sarah@walker-family.test',
    };
    const siblingTeam = {
      id: '00000000-0000-4000-a000-0000000000c2',
      name: 'Hornets U10',
    };
    const otherCoachJoin = {
      coach_id: '00000000-0000-4000-a000-0000000000c0',
      coaches: {
        id: '00000000-0000-4000-a000-0000000000c0',
        full_name: 'Coach Riley',
        email: 'riley@hornets.test',
      },
    };

    mockFromFn
      .mockReturnValueOnce(buildChain(E2E_SHARE))
      .mockReturnValueOnce(buildChain(E2E_SOURCE_PLAYER))
      .mockReturnValueOnce(buildChain(E2E_SOURCE_TEAM))
      .mockReturnValueOnce(buildChain([siblingRow]))
      .mockReturnValueOnce(buildChain(siblingTeam))
      .mockReturnValueOnce(buildChain(otherCoachJoin))
      // Coach email lookup returns a row → already on SportsIQ.
      .mockReturnValueOnce(
        buildChain([{ id: 'some-coach-id', email: 'riley@hornets.test' }]),
      );

    const res = await GET(makeRequest(), { params: tokenParams() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.candidate).toBeNull();
    expect(json.alreadyOnSportsIQ).toBe(true);
  });

  it('returns 404 for an unknown or inactive token', async () => {
    mockFromFn.mockReturnValueOnce(buildChain(null)); // parent_shares not found

    const res = await GET(makeRequest('tampered-token'), {
      params: tokenParams('tampered-token'),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when the token param is missing', async () => {
    const res = await GET(makeRequest(''), { params: tokenParams('') });
    expect(res.status).toBe(400);
  });

  it("scopes the candidate players select to id, name, team_id, parent_email (COPPA)", async () => {
    // Plant a sibling players row carrying extra fields the route must NOT
    // surface — date_of_birth, medical_notes, parent_phone. If the route's
    // .select() were '*', the captured selectCalls below would see no
    // restriction and the planted fields would round-trip through; the
    // assertion is on the .select() string itself.
    const siblingChain = buildChain([
      {
        id: '00000000-0000-4000-a000-0000000000c1',
        name: 'Sofia Walker',
        team_id: '00000000-0000-4000-a000-0000000000c2',
        parent_email: 'sarah@walker-family.test',
        // Planted fields — even if the mock returned them, the route's
        // `select` string is the test contract.
        date_of_birth: '2015-06-01',
        medical_notes: 'mild asthma',
        parent_phone: '+1-555-0100',
      },
    ]);
    const siblingTeam = buildChain({
      id: '00000000-0000-4000-a000-0000000000c2',
      name: 'Hornets U10',
    });
    const otherCoachJoin = buildChain({
      coach_id: '00000000-0000-4000-a000-0000000000c0',
      coaches: {
        id: '00000000-0000-4000-a000-0000000000c0',
        full_name: 'Coach Riley',
        email: 'riley@hornets.test',
      },
    });

    mockFromFn
      .mockReturnValueOnce(buildChain(E2E_SHARE))
      .mockReturnValueOnce(buildChain(E2E_SOURCE_PLAYER))
      .mockReturnValueOnce(buildChain(E2E_SOURCE_TEAM))
      .mockReturnValueOnce(siblingChain)
      .mockReturnValueOnce(siblingTeam)
      .mockReturnValueOnce(otherCoachJoin)
      .mockReturnValueOnce(buildChain([]));

    const res = await GET(makeRequest(), { params: tokenParams() });
    expect(res.status).toBe(200);
    const json = await res.json();

    // The candidate's .select() string includes ONLY the four allow-listed
    // fields — no date_of_birth, no medical_notes, no parent_phone.
    const siblingSelects = siblingChain._selectCalls as string[];
    expect(siblingSelects.length).toBeGreaterThan(0);
    const sel = siblingSelects.join(' ');
    expect(sel).toContain('id');
    expect(sel).toContain('name');
    expect(sel).toContain('team_id');
    expect(sel).toContain('parent_email');
    expect(sel).not.toContain('date_of_birth');
    expect(sel).not.toContain('medical_notes');
    expect(sel).not.toContain('parent_phone');

    // The response keyset is the documented allow-list — no smuggled fields.
    expect(Object.keys(json.candidate).sort()).toEqual(
      [
        'otherCoachEmail',
        'otherCoachName',
        'otherTeamName',
        'programId',
        'siblingFirstName',
      ].sort(),
    );
    // siblingFirstName is the FIRST token of the seeded name (LESSONS#0096 —
    // the candidate response NEVER returns a last name).
    expect(json.candidate.siblingFirstName).toBe('Sofia');
    expect(json.candidate.siblingFirstName).not.toContain('Walker');
  });

  it('does NOT import @/lib/tier (the surface is not tier-gated)', async () => {
    // The route file MUST NOT import the tier module. This is the AC's
    // "no canAccess() call" assertion — we scan EXECUTABLE source only
    // (block + line comments stripped), because the route's docstring
    // legitimately names the tier module to explain why it's omitted
    // (LESSONS#0023 / #0088 — instruct positively; explanatory comments
    // never collide with a banned-token gate).
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const raw = readFileSync(
      join(
        process.cwd(),
        'src/app/api/share/[token]/sibling-invite-candidate/route.ts',
      ),
      'utf8',
    );
    // Strip /** ... */ blocks then `//` line comments.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(code).not.toMatch(/from\s+['"]@\/lib\/tier['"]/);
    expect(code).not.toMatch(/\bcanAccess\b/);
  });
});
