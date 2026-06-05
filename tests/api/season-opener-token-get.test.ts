/**
 * Ticket 0068 — GET /api/season-opener/[token].
 *
 * Public, no-auth resolver for the season-opener share. The page at
 * /opener/[token] consumes this payload and renders it server-side.
 *
 * Acceptance criteria → tests:
 *  - 400 when the token param is empty.
 *  - 404 when the token resolves to no row.
 *  - 200 with the right payload shape:
 *      teamName, ageGroup, sportName, seasonLabel, coachFirstName,
 *      coachHandle (optional), focusLine, createdAt
 *  - The .select() calls are explicit allow-lists (LESSONS#0036); planted
 *    minor-data fields on players (`date_of_birth`, `medical_notes`,
 *    `parent_email`, `parent_phone`, `jersey_number`, `photo_url`) do
 *    NOT appear in the response.
 *
 * `.test.ts` not `.spec.ts` (LESSONS#0020).
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

import { GET } from '@/app/api/season-opener/[token]/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeef';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const COACH_ID = '00000000-0000-4000-a000-000000000001';
const SPORT_ID = '00000000-0000-4000-a000-000000000010';

function makeReq() {
  return new Request(`http://localhost/api/season-opener/${TOKEN}`);
}
function makeCtx(token: string = TOKEN) {
  return { params: Promise.resolve({ token }) };
}

describe('GET /api/season-opener/[token] (ticket 0068)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 400 when the token param is empty', async () => {
    const res = await GET(makeReq(), { params: Promise.resolve({ token: '' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the token resolves to no row', async () => {
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
  });

  it('returns 200 with the expected payload shape', async () => {
    const openerRow = {
      id: 'opener-1',
      team_id: TEAM_ID,
      coach_id: COACH_ID,
      token: TOKEN,
      season_label: 'Spring 2026',
      focus_line: 'closeouts and good sportsmanship',
      created_at: '2026-06-05T00:00:00Z',
    };
    const teamRow = {
      id: TEAM_ID,
      name: 'Hawks U10',
      age_group: '8-10',
      sport_id: SPORT_ID,
    };
    const sportRow = { id: SPORT_ID, name: 'Basketball' };
    const coachRow = {
      id: COACH_ID,
      full_name: 'Sarah Rodriguez',
      handle: 'sarah-rodriguez',
    };
    mockFromFn
      .mockReturnValueOnce(buildChain(openerRow))
      .mockReturnValueOnce(buildChain(teamRow))
      .mockReturnValueOnce(buildChain(sportRow))
      .mockReturnValueOnce(buildChain(coachRow));

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      teamName?: string;
      ageGroup?: string;
      sportName?: string | null;
      seasonLabel?: string;
      coachFirstName?: string | null;
      coachHandle?: string | null;
      focusLine?: string;
      createdAt?: string;
    };
    expect(body.teamName).toBe('Hawks U10');
    expect(body.ageGroup).toBe('8-10');
    expect(body.sportName).toBe('Basketball');
    expect(body.seasonLabel).toBe('Spring 2026');
    // Coach FIRST name only — never the surname, never the email.
    expect(body.coachFirstName).toBe('Sarah');
    expect(body.coachHandle).toBe('sarah-rodriguez');
    expect(body.focusLine).toBe('closeouts and good sportsmanship');
    expect(typeof body.createdAt).toBe('string');
  });

  it('omits coachHandle when the coach has not claimed one', async () => {
    const openerRow = {
      id: 'opener-1',
      team_id: TEAM_ID,
      coach_id: COACH_ID,
      token: TOKEN,
      season_label: 'Spring 2026',
      focus_line: 'shooting form',
      created_at: '2026-06-05T00:00:00Z',
    };
    const teamRow = { id: TEAM_ID, name: 'Hawks U10', age_group: '8-10', sport_id: SPORT_ID };
    const sportRow = { id: SPORT_ID, name: 'Basketball' };
    const coachRow = { id: COACH_ID, full_name: 'Sarah Rodriguez', handle: null };
    mockFromFn
      .mockReturnValueOnce(buildChain(openerRow))
      .mockReturnValueOnce(buildChain(teamRow))
      .mockReturnValueOnce(buildChain(sportRow))
      .mockReturnValueOnce(buildChain(coachRow));

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { coachHandle?: string | null };
    expect(body.coachHandle ?? null).toBeNull();
  });

  it('NEVER surfaces minor-data fields even when the DB rows happen to carry them', async () => {
    // The .select() is an explicit allow-list per LESSONS#0036, but we
    // additionally plant minor-data values in the resolved data to prove
    // the route does NOT echo whatever the DB returned. This is the
    // structural COPPA guarantee.
    const openerRow = {
      id: 'opener-1',
      team_id: TEAM_ID,
      coach_id: COACH_ID,
      token: TOKEN,
      season_label: 'Spring 2026',
      focus_line: 'sportsmanship',
      created_at: '2026-06-05T00:00:00Z',
      // Planted, must NOT appear in the response.
      date_of_birth: '2017-04-01',
      medical_notes: 'asthma inhaler',
      parent_email: 'parent@example.test',
      parent_phone: '+15555550100',
      jersey_number: 23,
      photo_url: 'https://cdn.example/photo.jpg',
    };
    const teamRow = {
      id: TEAM_ID,
      name: 'Hawks U10',
      age_group: '8-10',
      sport_id: SPORT_ID,
      // planted on the team row too
      parent_email: 'parent@example.test',
    };
    const sportRow = { id: SPORT_ID, name: 'Basketball' };
    const coachRow = {
      id: COACH_ID,
      full_name: 'Sarah Rodriguez',
      handle: 'sarah-rodriguez',
      // planted on the coach row
      email: 'coach@example.test',
    };
    mockFromFn
      .mockReturnValueOnce(buildChain(openerRow))
      .mockReturnValueOnce(buildChain(teamRow))
      .mockReturnValueOnce(buildChain(sportRow))
      .mockReturnValueOnce(buildChain(coachRow));

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const raw = await res.text();
    for (const planted of [
      'asthma inhaler',
      'parent@example.test',
      'coach@example.test',
      '+15555550100',
      'https://cdn.example/photo.jpg',
      '2017-04-01',
    ]) {
      expect(raw).not.toContain(planted);
    }
    // The jersey number 23 might appear in dates / etc. — scope assertions
    // to a defensive jersey shape (per LESSONS#0109) rather than the bare
    // number string. Asserting the JSON has no `jersey` key is enough.
    expect(raw.toLowerCase()).not.toContain('jersey');
  });
});

describe('GET /api/season-opener/[token] — uses explicit allow-list selects', () => {
  it('the route source never uses select("*")', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/season-opener/[token]/route.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/\.select\(\s*['"`]\*['"`]/);
  });
});
