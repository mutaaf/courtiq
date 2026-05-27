/**
 * Ticket 0049 — GET /api/practice-plan-shares/[token].
 *
 * Public, no auth. Resolves a token → its active practice_plan_shares row →
 * the plan's title + structured drill list, the publishing coach's FIRST name
 * (server-side string split), and the optional one-line note. The payload
 * allow-list is EXACTLY four keys; anything else (last name, email, player
 * data, team name) is not exposed.
 *
 * Acceptance criteria → tests:
 *  - 404 when the token does not exist or the share is inactive.
 *  - 404 when the underlying plan is not type='practice' (defense-in-depth:
 *    even if a future plan type embedded per-player data, this route refuses
 *    anything but a practice plan).
 *  - 200 happy path returns exactly the four-key payload (key-set assertion).
 *  - The coach's LAST NAME (and any email field) is absent from the payload.
 *  - The note from the share row rides through verbatim.
 *
 * Mocking pattern mirrors tests/api/season-rollover.test.ts. .test.ts NOT
 * .spec.ts (LESSONS#38). The route signature is GET(_req, { params }) so we
 * pass `params` as a Promise (Next 14+ async params).
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

import { GET } from '@/app/api/practice-plan-shares/[token]/route';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function makeRequest() {
  return new Request('http://localhost/api/practice-plan-shares/abc');
}

function paramsFor(token: string) {
  return { params: Promise.resolve({ token }) };
}

const PRACTICE_PLAN = {
  id: 'plan-1',
  team_id: 'team-1',
  coach_id: 'coach-1',
  type: 'practice',
  title: 'Tuesday Practice — Closeouts',
  content_structured: {
    drills: [
      { name: 'Defensive Slides', duration_minutes: 10, focus: 'Defense' },
      { name: 'Closeout Drill', duration_minutes: 12, focus: 'Defense' },
      { name: 'Scrimmage', duration_minutes: 15, focus: 'Effort' },
    ],
  },
};

const PUBLISHER_COACH = {
  id: 'coach-1',
  full_name: 'Sasha Williams',
  email: 'sasha@example.com',
};

describe('GET /api/practice-plan-shares/[token] (ticket 0049)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 404 when the token is missing or inactive', async () => {
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await GET(makeRequest(), paramsFor('bad-token'));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the underlying plan is not type='practice'", async () => {
    const shareChain = buildChain({
      id: 'share-1',
      token: 'abc',
      plan_id: 'plan-1',
      coach_id: 'coach-1',
      note: null,
      is_active: true,
    });
    // The route filters .eq('type','practice') on the plan lookup, so a parent_report
    // plan resolves to null and the route returns 404.
    const planChain = buildChain(null);
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(planChain);

    const res = await GET(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(404);
  });

  it('happy path returns EXACTLY the four-key payload, no last name, no email', async () => {
    const shareChain = buildChain({
      id: 'share-1',
      token: 'abc',
      plan_id: 'plan-1',
      coach_id: 'coach-1',
      note: 'Worked great with U12s.',
      is_active: true,
    });
    const planChain = buildChain(PRACTICE_PLAN);
    const coachChain = buildChain(PUBLISHER_COACH);
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(planChain)
      .mockReturnValueOnce(coachChain);

    const res = await GET(makeRequest(), paramsFor('abc'));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as Record<string, unknown>;

    // Exactly four keys — anything else (lastName, email, teamName, coachId) is
    // a data-minimization regression. The keyset assertion is deep-equality.
    expect(Object.keys(payload).sort()).toEqual([
      'coachFirstName',
      'note',
      'planContent',
      'planTitle',
    ]);

    expect(payload.coachFirstName).toBe('Sasha');
    // The publisher's last name and email must not surface anywhere in the payload.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('Williams');
    expect(serialized).not.toContain('sasha@example.com');

    // The note and plan title ride through verbatim.
    expect(payload.note).toBe('Worked great with U12s.');
    expect(payload.planTitle).toBe('Tuesday Practice — Closeouts');

    // The drill list survived (team-level practice content, not per-player).
    const planContent = payload.planContent as { drills?: Array<{ name: string }> };
    expect(Array.isArray(planContent.drills)).toBe(true);
    expect(planContent.drills?.length).toBe(3);
  });

  it('payload is null on the note key when no note was attached', async () => {
    const shareChain = buildChain({
      id: 'share-1',
      token: 'abc',
      plan_id: 'plan-1',
      coach_id: 'coach-1',
      note: null,
      is_active: true,
    });
    const planChain = buildChain(PRACTICE_PLAN);
    const coachChain = buildChain(PUBLISHER_COACH);
    mockFromFn
      .mockReturnValueOnce(shareChain)
      .mockReturnValueOnce(planChain)
      .mockReturnValueOnce(coachChain);

    const res = await GET(makeRequest(), paramsFor('abc'));
    const payload = (await res.json()) as { note: unknown };
    expect(payload.note).toBeNull();
  });
});
