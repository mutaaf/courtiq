/**
 * Vitest regression — GET /api/org/[slug] (ticket 0024 AC4).
 *
 * Ticket 0024 ADDS a director-side staff-invite route + an org-scoped signup
 * attachment; it must NOT change the existing public org-landing endpoint. This
 * test pins the public response shape so the regression is caught if a later
 * change touches it: the org landing page (src/app/org/[slug]/page.tsx) reads
 * { org:{name,slug,created_at}, branding, teams, stats:{coaches,players,teams} }.
 *
 * File is `.test.ts` (NOT `.spec.ts`): vitest.config.ts excludes the spec glob.
 *
 * Pattern mirrors tests/team-card/public-get.test.ts (service-only chainable mock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  // The public org route uses ONLY the service client; no auth.
  createServiceSupabase: vi.fn(async () => ({
    from: mockFromFn,
  })),
}));

import { GET } from '@/app/api/org/[slug]/route';

function buildChain(data: unknown = null, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function call(slug: string) {
  const request = new Request(`http://localhost/api/org/${slug}`);
  return GET(request, { params: Promise.resolve({ slug }) });
}

describe('GET /api/org/[slug] — public response shape unchanged (ticket 0024 AC4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the existing { org, branding, teams, stats } shape for a known slug', async () => {
    // 1) organizations.select(...).eq(slug).single()
    const orgChain = buildChain({
      id: 'org-1',
      name: 'Lincoln Rec League',
      slug: 'lincoln-rec-league',
      sport_config: {},
      settings: {},
      created_at: '2025-09-01T00:00:00.000Z',
    });
    // 2) org_branding.select(...).eq(org_id).single()
    const brandingChain = buildChain({
      logo_light_url: null,
      logo_dark_url: null,
      primary_color: '#F97316',
      secondary_color: '#000000',
      parent_portal_header_text: 'Go Lions',
    });
    // 3) teams.select(...).eq(org_id).eq(is_active).order(name)
    const teamsChain = buildChain([
      { id: 't1', name: 'U12 Lions', age_group: '11-13', season: 'Fall 2025', sport_id: 'sp1' },
    ]);
    // 4) coaches count
    const coachCountChain = buildChain(null, null, 4);
    // 5) players count
    const playerCountChain = buildChain(null, null, 22);

    mockFromFn
      .mockReturnValueOnce(orgChain)
      .mockReturnValueOnce(brandingChain)
      .mockReturnValueOnce(teamsChain)
      .mockReturnValueOnce(coachCountChain)
      .mockReturnValueOnce(playerCountChain);

    const res = await call('lincoln-rec-league');
    expect(res.status).toBe(200);
    const body = await res.json();

    // The exact public contract the org landing page consumes.
    expect(body.org).toEqual({
      name: 'Lincoln Rec League',
      slug: 'lincoln-rec-league',
      created_at: '2025-09-01T00:00:00.000Z',
    });
    expect(body.branding).not.toBeNull();
    expect(body.teams).toHaveLength(1);
    expect(body.teams[0].name).toBe('U12 Lions');
    expect(body.stats).toEqual({ coaches: 4, players: 22, teams: 1 });

    // Ticket 0033 AC3: each team object carries a stable `id` usable for the
    // per-team "Coach this team — free" claim deep-link, and the rest of the
    // team shape is unchanged (regression on the public org endpoint).
    expect(body.teams[0].id).toBe('t1');
    expect(body.teams[0]).toMatchObject({
      id: 't1',
      name: 'U12 Lions',
      age_group: '11-13',
      season: 'Fall 2025',
      sport_id: 'sp1',
    });
  });

  it('returns 404 for an unknown slug (unchanged)', async () => {
    const orgChain = buildChain(null, { message: 'not found' });
    mockFromFn.mockReturnValueOnce(orgChain);

    const res = await call('does-not-exist');
    expect(res.status).toBe(404);
  });
});
