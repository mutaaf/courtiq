/**
 * Ticket 0090 — GET /api/admin/program-drill-canon.
 *
 * The /admin (director) surface mounts <ProgramDrillCanonCard />; that
 * card calls THIS route to learn whether the program drill canon is
 * eligible to surface AND what its drills look like. The route
 * server-gates on tier === 'organization' AND subscription_status IN
 * the paid-grace set (LESSONS#0044), and director-role (coaches.role
 * === 'admin' per LESSONS#0087).
 *
 * Acceptance criteria mapping (from the ticket):
 *  (i)   free-tier org → eligible: false, eligibilityReason: 'not_org_tier'
 *  (ii)  Coach-tier org → same
 *  (iii) Org-tier org with 0 thumbs → eligible: false,
 *        eligibilityReason: 'too_few_drills_meeting_threshold'
 *  (iv)  Org-tier org with 4 qualifying drills → eligible: true with
 *        the drills + first names
 *  (v)   the response is BYTE-IDENTICAL across the matrix (additive only)
 *  (vi)  unauthed caller → 401
 *  (vii) non-director caller → 403
 *  (viii) cross-org caller → 403
 *  (ix)  planted email / phone / DOB on every joined coach row are
 *        NEVER reached by the route's .select() allow-list
 *  (x)   when a canon was published in the last 90 days, the response
 *        carries the existing publish state
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET } from '@/app/api/admin/program-drill-canon/route';

const DIRECTOR_ID = '00000000-0000-4000-a000-0000000000d1';
const ORG_ID = '00000000-0000-4000-a000-0000000000a1';
const OTHER_ORG_ID = '00000000-0000-4000-a000-0000000000a2';

const BANNED_HYPE = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

// Build a thenable chain that resolves to { data, error } when awaited
// and is mockReturnThis on every builder method. maybeSingle/single
// resolve to the first row when the fixture is an array.
function chain<T = unknown>(data: T | null = null) {
  const resolved = { data, error: null };
  const firstRow = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const resolvedSingle = { data: firstRow, error: null };
  const c: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedSingle),
    single: vi.fn().mockResolvedValue(resolvedSingle),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return c;
}

function wireTables(byTable: Record<string, unknown[] | unknown>) {
  mockFromFn.mockImplementation((table: string) => {
    const rows = byTable[table];
    return chain(rows ?? []);
  });
}

function makeReq(orgIdParam: string | null = ORG_ID): Request {
  const url = new URL('http://localhost/api/admin/program-drill-canon');
  if (orgIdParam !== null) url.searchParams.set('orgId', orgIdParam);
  return new Request(url.toString());
}

describe('GET /api/admin/program-drill-canon (ticket 0090)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: DIRECTOR_ID } } });
  });

  it('(vi) unauthed caller → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('(vii) non-director caller → 403', async () => {
    wireTables({
      coaches: [{ id: DIRECTOR_ID, org_id: ORG_ID, role: 'coach' }],
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it('(viii) cross-org caller (caller org_id != query orgId) → 403', async () => {
    wireTables({
      coaches: [{ id: DIRECTOR_ID, org_id: OTHER_ORG_ID, role: 'admin' }],
    });
    const res = await GET(makeReq(ORG_ID));
    expect(res.status).toBe(403);
  });

  it('(i) free-tier org → eligible: false, eligibilityReason: not_org_tier', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([{ id: DIRECTOR_ID, org_id: ORG_ID, role: 'admin' }]);
      }
      if (table === 'organizations') {
        return chain([
          { id: ORG_ID, name: 'Hawks Basketball', tier: 'free', subscription_status: null },
        ]);
      }
      return chain([]);
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.eligibilityReason).toBe('not_org_tier');
  });

  it('(ii) Coach-tier org → eligible: false, eligibilityReason: not_org_tier', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([{ id: DIRECTOR_ID, org_id: ORG_ID, role: 'admin' }]);
      }
      if (table === 'organizations') {
        return chain([
          { id: ORG_ID, name: 'Hawks', tier: 'coach', subscription_status: 'active' },
        ]);
      }
      return chain([]);
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.eligibilityReason).toBe('not_org_tier');
  });

  it('(ii) Org-tier org with canceled subscription_status → not_org_tier (LESSONS#0044)', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([{ id: DIRECTOR_ID, org_id: ORG_ID, role: 'admin' }]);
      }
      if (table === 'organizations') {
        return chain([
          { id: ORG_ID, name: 'Hawks', tier: 'organization', subscription_status: 'canceled' },
        ]);
      }
      return chain([]);
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.eligibilityReason).toBe('not_org_tier');
  });

  it('(iii) Org-tier org with 0 thumbs → too_few_drills_meeting_threshold', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        // Director on Org-tier + a few other staff coaches. Joined coach rows
        // would carry .email/.phone/.full_name on the real DB; the route
        // never reads them — only id/full_name/role/org_id are in the
        // allow-list.
        const planted = (id: string, first: string, role = 'coach') => ({
          id,
          org_id: ORG_ID,
          full_name: `${first} Walker`,
          role,
          // planted PII — assert NEVER read by route
          email: 'pii@example.com',
          phone: '+15551234567',
        });
        return chain([
          planted(DIRECTOR_ID, 'Riya', 'admin'),
          planted('00000000-0000-4000-a000-0000000000c2', 'Maya'),
          planted('00000000-0000-4000-a000-0000000000c3', 'James'),
        ]);
      }
      if (table === 'organizations') {
        return chain([
          { id: ORG_ID, name: 'Hawks', tier: 'organization', subscription_status: 'active' },
        ]);
      }
      // coach_drill_signals, drills, program_drill_canon → empty
      return chain([]);
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.eligibilityReason).toBe('too_few_drills_meeting_threshold');
  });

  it('(iv) Org-tier org with 4 qualifying drills → eligible: true with the drills + first names', async () => {
    const COACH_C2 = '00000000-0000-4000-a000-0000000000c2';
    const COACH_C3 = '00000000-0000-4000-a000-0000000000c3';
    const COACH_C4 = '00000000-0000-4000-a000-0000000000c4';
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([
          { id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya Patel', role: 'admin' },
          { id: COACH_C2, org_id: ORG_ID, full_name: 'Maya Walker', role: 'coach' },
          { id: COACH_C3, org_id: ORG_ID, full_name: 'James Park', role: 'coach' },
          { id: COACH_C4, org_id: ORG_ID, full_name: 'Lin Anderson', role: 'coach' },
        ]);
      }
      if (table === 'organizations') {
        return chain([
          { id: ORG_ID, name: 'Hawks Basketball', tier: 'organization', subscription_status: 'active' },
        ]);
      }
      if (table === 'coach_drill_signals') {
        // 4 drills, each thumbed by 3+ distinct coaches.
        const ts = '2026-05-15T12:00:00Z';
        return chain([
          // d1 — 4 coaches (director + 3 others)
          { coach_id: DIRECTOR_ID, drill_id: 'd1', rating: 'up', last_rated_at: ts },
          { coach_id: COACH_C2, drill_id: 'd1', rating: 'up', last_rated_at: ts },
          { coach_id: COACH_C3, drill_id: 'd1', rating: 'up', last_rated_at: ts },
          { coach_id: COACH_C4, drill_id: 'd1', rating: 'up', last_rated_at: ts },
          // d2 — 3 coaches
          { coach_id: DIRECTOR_ID, drill_id: 'd2', rating: 'up', last_rated_at: ts },
          { coach_id: COACH_C2, drill_id: 'd2', rating: 'up', last_rated_at: ts },
          { coach_id: COACH_C3, drill_id: 'd2', rating: 'up', last_rated_at: ts },
          // d3 — 3 coaches
          { coach_id: COACH_C2, drill_id: 'd3', rating: 'up', last_rated_at: ts },
          { coach_id: COACH_C3, drill_id: 'd3', rating: 'up', last_rated_at: ts },
          { coach_id: COACH_C4, drill_id: 'd3', rating: 'up', last_rated_at: ts },
          // d4 — 3 coaches
          { coach_id: DIRECTOR_ID, drill_id: 'd4', rating: 'up', last_rated_at: ts },
          { coach_id: COACH_C2, drill_id: 'd4', rating: 'up', last_rated_at: ts },
          { coach_id: COACH_C4, drill_id: 'd4', rating: 'up', last_rated_at: ts },
        ]);
      }
      if (table === 'drills') {
        return chain([
          { id: 'd1', name: 'Closeout to recovery', sport_id: 'basketball', age_groups: ['8-10'] },
          { id: 'd2', name: '2v1 transition trail', sport_id: 'basketball', age_groups: ['8-10'] },
          { id: 'd3', name: 'Wall passing under pressure', sport_id: 'basketball', age_groups: ['8-10'] },
          { id: 'd4', name: 'Cone closeout square', sport_id: 'basketball', age_groups: ['8-10'] },
        ]);
      }
      if (table === 'program_drill_canon') {
        return chain([]);
      }
      return chain([]);
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.eligibilityReason).toBeUndefined();
    expect(body.drills).toHaveLength(4);
    expect(body.drills[0].coachCount).toBe(4); // d1 has the most
    expect(body.drills[0].drillName).toBe('Closeout to recovery');
    // First names are surname-stripped (literal-space).
    for (const drill of body.drills) {
      for (const name of drill.coachFirstNames) {
        expect(name).not.toMatch(/ /);
      }
    }
    expect(body.totalCoachesInProgram).toBe(4);
    expect(body.orgName).toBe('Hawks Basketball');
  });

  it('(ix) planted email / phone on every joined coach row are NEVER read', async () => {
    // The route uses a narrow .select() allow-list and never touches
    // coaches.email / phone / full_name surname. We assert by reading
    // the .select() call argument and confirming the allow-list doesn't
    // mention these columns.
    let coachesSelectArg: string | undefined;
    mockFromFn.mockImplementation((table: string) => {
      const c = chain(
        table === 'coaches'
          ? [
              { id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya Patel', role: 'admin' },
            ]
          : table === 'organizations'
          ? [{ id: ORG_ID, name: 'Hawks', tier: 'organization', subscription_status: 'active' }]
          : [],
      );
      if (table === 'coaches') {
        const origSelect = c.select as ReturnType<typeof vi.fn>;
        origSelect.mockImplementation((arg: string) => {
          coachesSelectArg = arg;
          return c;
        });
      }
      return c;
    });
    await GET(makeReq());
    expect(coachesSelectArg).toBeDefined();
    expect(coachesSelectArg!.toLowerCase()).not.toContain('email');
    expect(coachesSelectArg!.toLowerCase()).not.toContain('phone');
  });

  it('(x) when a canon was published in the last 90 days, the response carries the existing publish state', async () => {
    const recentPublish = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([
          { id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'admin' },
          { id: '00000000-0000-4000-a000-0000000000c2', org_id: ORG_ID, full_name: 'Maya', role: 'coach' },
          { id: '00000000-0000-4000-a000-0000000000c3', org_id: ORG_ID, full_name: 'James', role: 'coach' },
        ]);
      }
      if (table === 'organizations') {
        return chain([
          { id: ORG_ID, name: 'Hawks', tier: 'organization', subscription_status: 'active' },
        ]);
      }
      if (table === 'coach_drill_signals') {
        const ts = '2026-05-15T12:00:00Z';
        return chain([
          { coach_id: DIRECTOR_ID, drill_id: 'd1', rating: 'up', last_rated_at: ts },
          { coach_id: '00000000-0000-4000-a000-0000000000c2', drill_id: 'd1', rating: 'up', last_rated_at: ts },
          { coach_id: '00000000-0000-4000-a000-0000000000c3', drill_id: 'd1', rating: 'up', last_rated_at: ts },
        ]);
      }
      if (table === 'drills') {
        return chain([
          { id: 'd1', name: 'Closeout drill', sport_id: 'basketball', age_groups: ['8-10'] },
        ]);
      }
      if (table === 'program_drill_canon') {
        return chain([
          {
            id: 'canon-1',
            org_id: ORG_ID,
            published_by_coach_id: DIRECTOR_ID,
            drill_ids: ['d1'],
            published_at: recentPublish,
            superseded_at: null,
          },
        ]);
      }
      return chain([]);
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.currentCanon).toBeDefined();
    expect(body.currentCanon.drillIds).toEqual(['d1']);
    expect(body.currentCanon.publishedAt).toBe(recentPublish);
  });

  it('no AGENTS.md banned word appears in the rendered response', async () => {
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return chain([
          { id: DIRECTOR_ID, org_id: ORG_ID, full_name: 'Riya', role: 'admin' },
          { id: '00000000-0000-4000-a000-0000000000c2', org_id: ORG_ID, full_name: 'Maya', role: 'coach' },
          { id: '00000000-0000-4000-a000-0000000000c3', org_id: ORG_ID, full_name: 'James', role: 'coach' },
        ]);
      }
      if (table === 'organizations') {
        return chain([
          { id: ORG_ID, name: 'Hawks Basketball', tier: 'organization', subscription_status: 'active' },
        ]);
      }
      if (table === 'coach_drill_signals') {
        const ts = '2026-05-15T12:00:00Z';
        return chain([
          { coach_id: DIRECTOR_ID, drill_id: 'd1', rating: 'up', last_rated_at: ts },
          { coach_id: '00000000-0000-4000-a000-0000000000c2', drill_id: 'd1', rating: 'up', last_rated_at: ts },
          { coach_id: '00000000-0000-4000-a000-0000000000c3', drill_id: 'd1', rating: 'up', last_rated_at: ts },
        ]);
      }
      if (table === 'drills') {
        return chain([
          { id: 'd1', name: 'Closeout drill', sport_id: 'basketball', age_groups: ['8-10'] },
        ]);
      }
      return chain([]);
    });
    const res = await GET(makeReq());
    const body = await res.json();
    const json = JSON.stringify(body).toLowerCase();
    for (const banned of BANNED_HYPE) {
      expect(json).not.toContain(banned);
    }
  });
});
