/**
 * Vitest — GET /api/programs (ticket 0033).
 *
 * The public, no-auth program directory. It lists ONLY organizations that have
 * explicitly opted into discovery via a `settings.discoverable = true` jsonb
 * flag, and exposes ONLY org-level / aggregate data: { name, slug, teamCount,
 * sport }. No per-coach or per-minor data ever reaches the payload — the
 * response object is BUILT from an allow-list (mirrors PUBLIC_PERSONALITY_FIELDS
 * in /api/team-card/[token]).
 *
 * Maps 1:1 to the ticket's acceptance criteria:
 *  - AC1: an opted-in org appears with exactly { name, slug, teamCount, sport };
 *         a non-opted-in org is absent; payload keys are exactly the allow-list.
 *  - AC2: zero opted-in orgs → 200 { programs: [] } (not an error).
 *  - AC6 (privacy): the body carries only org-level/aggregate data — no coach
 *         name, player name, jersey, contact info, or observation text.
 *
 * The GET reads no params/body, so it's invoked with the signature it declares
 * (a no-arg handler — LESSONS.md 2026-05-21). File is `.test.ts` (NOT
 * `.spec.ts`): vitest.config.ts excludes the spec glob (LESSONS.md 2026-05-20).
 *
 * Pattern mirrors tests/org/public-get.test.ts (service-only chainable mock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  // The public programs route uses ONLY the service client; no auth.
  createServiceSupabase: vi.fn(async () => ({
    from: mockFromFn,
  })),
}));

import { GET } from '@/app/api/programs/route';

// A chainable in-memory builder. `eq`/`in`/`order` return `this`; awaiting the
// chain (or calling .then) resolves to the configured { data }.
function buildChain(data: unknown = null) {
  const resolved = { data, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

describe('GET /api/programs — public opted-in directory (ticket 0033)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists ONLY the opted-in org, with exactly { name, slug, teamCount, sport }', async () => {
    // 1) organizations.select(...).eq('settings->>discoverable','true')
    //    → ONLY the opted-in org rows (the route filters on the flag itself).
    const orgsChain = buildChain([
      { id: 'org-opted', name: 'Lincoln Rec League', slug: 'lincoln-rec-league' },
    ]);
    // 2) teams.select('org_id, sport_id').in('org_id',[...]).eq('is_active',true)
    const teamsChain = buildChain([
      { org_id: 'org-opted', sport_id: 'sp-bball' },
      { org_id: 'org-opted', sport_id: 'sp-bball' },
    ]);
    // 3) sports.select('id, name').in('id',[...])
    const sportsChain = buildChain([{ id: 'sp-bball', name: 'Basketball' }]);

    mockFromFn
      .mockReturnValueOnce(orgsChain)
      .mockReturnValueOnce(teamsChain)
      .mockReturnValueOnce(sportsChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.programs)).toBe(true);
    expect(body.programs).toHaveLength(1);

    const program = body.programs[0];
    // Exactly the allow-list keys — no more, no less.
    expect(Object.keys(program).sort()).toEqual(['name', 'slug', 'sport', 'teamCount'].sort());
    expect(program.name).toBe('Lincoln Rec League');
    expect(program.slug).toBe('lincoln-rec-league');
    expect(program.teamCount).toBe(2);
    expect(program.sport).toBe('Basketball');
  });

  it('filters the discoverable flag on the organizations query itself', async () => {
    const orgsChain = buildChain([]);
    mockFromFn.mockReturnValueOnce(orgsChain);

    const res = await GET();
    expect(res.status).toBe(200);

    // The route must scope the org query to the opt-in flag — a non-opted-in org
    // can never reach the result because the DB query excludes it.
    const eqCalls = (orgsChain.eq as ReturnType<typeof vi.fn>).mock.calls;
    const filteredOnFlag = eqCalls.some(
      ([col, val]) => String(col).includes('discoverable') && String(val) === 'true',
    );
    expect(filteredOnFlag).toBe(true);
  });

  it('returns 200 { programs: [] } when no org has opted in (not an error)', async () => {
    const orgsChain = buildChain([]);
    mockFromFn.mockReturnValueOnce(orgsChain);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ programs: [] });
  });

  it('carries NO per-coach or per-minor data on any program (COPPA/data-min)', async () => {
    const orgsChain = buildChain([
      { id: 'org-opted', name: 'Eastside Hoops', slug: 'eastside-hoops' },
    ]);
    const teamsChain = buildChain([{ org_id: 'org-opted', sport_id: 'sp-bball' }]);
    const sportsChain = buildChain([{ id: 'sp-bball', name: 'Basketball' }]);

    mockFromFn
      .mockReturnValueOnce(orgsChain)
      .mockReturnValueOnce(teamsChain)
      .mockReturnValueOnce(sportsChain);

    const res = await GET();
    const body = await res.json();
    const raw = JSON.stringify(body);

    // Allow-list is the contract: nothing player/coach-identifying may appear.
    const forbiddenKeys = [
      'coach', 'coaches', 'full_name', 'email', 'player', 'players',
      'jersey', 'jersey_number', 'parent_name', 'observation', 'text',
      'preferences', 'referral_code', 'org_id', 'id',
    ];
    for (const program of body.programs) {
      for (const key of forbiddenKeys) {
        expect(Object.keys(program)).not.toContain(key);
      }
    }
    // Cheap belt-and-suspenders: the serialized body never names a person field.
    expect(raw).not.toMatch(/full_name|jersey|parent_name/);
  });
});
