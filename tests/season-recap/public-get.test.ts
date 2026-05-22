/**
 * Ticket 0017 — GET /api/season-recap/[token] (public, no auth)
 *
 * The public read resolves a token → the season_summary plan → the team name +
 * the creating coach's referral code, so the public page can deep-link to
 * /signup?ref=CODE. These specs assert:
 *  - 404 for an unknown / inactive token
 *  - 200 returns the team-level recap fields + team name + coach first name + code
 *  - the referral code is lazily generated + persisted when the coach has none
 *    (same deterministic algorithm as /api/referrals via makeReferralCode)
 *  - COPPA: NO player-identifying data leaks — player_breakthroughs (which carries
 *    player_name) is stripped by the allow-list and no player name appears anywhere
 *    in the serialized response.
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

import { GET as publicGet } from '@/app/api/season-recap/[token]/route';
import { makeReferralCode } from '@/lib/referral-code';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
  };
  return chain;
}

// A realistic season_summary content_structured (seasonSummarySchema shape) PLUS
// a poisoned per-minor field — player_breakthroughs, which carries player_name —
// that MUST be stripped from the public response (COPPA / data-minimization).
const SEASON_SUMMARY = {
  headline: 'A Season of Breakthroughs',
  season_period: 'Spring 2026 · Mar 1 – May 20',
  overall_assessment:
    'The Rockets grew from a group that struggled to hold a lead into a team that closes games with poise.',
  team_highlights: [
    { title: 'Defense first', description: 'Held opponents under 30 in the back half of the season.' },
    { title: 'Comeback wins', description: 'Three double-digit comebacks down the stretch.' },
  ],
  skill_progress: [
    { skill: 'Transition defense', status: 'most_improved', description: 'Sprinting back as a unit.' },
    { skill: 'Free throws', status: 'strength', description: 'Reliable from the line under pressure.' },
  ],
  team_challenges: ['Half-court spacing', 'Turnovers vs. the press'],
  coaching_insights:
    'The data shows the team responds to tight, competitive practice reps far more than to lecture.',
  next_season_priorities: ['Install a base half-court offense', 'Add a press-break package'],
  closing_message:
    'You showed up every week and got better every week. That is what a real season looks like.',
  // ── per-minor data that must NEVER reach the public payload ──
  player_breakthroughs: [
    { player_name: 'Alice Walker', achievement: 'Became the team’s defensive anchor.' },
    { player_name: 'Bob Carter', achievement: 'Went from bench to starting point guard.' },
  ],
};

function call(token: string) {
  const request = new Request(`http://localhost/api/season-recap/${token}`);
  return publicGet(request, { params: Promise.resolve({ token }) });
}

describe('GET /api/season-recap/[token]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 for an unknown / inactive token', async () => {
    mockFromFn.mockReturnValue(buildChain(null)); // no season_recap_shares row
    const res = await call('no-such-token');
    expect(res.status).toBe(404);
  });

  it('returns the team-level recap, team name, coach first name, and referral code', async () => {
    const share = { id: 'srs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: 'coach-1', is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: 'coach-1', type: 'season_summary', content_structured: SEASON_SUMMARY };
    const team = { name: 'The Rockets' };
    // Coach already has a referral code persisted.
    const coach = { id: 'coach-1', full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'season_recap_shares') return buildChain(share);
      if (table === 'plans') return buildChain(plan);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain(coach);
      return buildChain(null);
    });

    const res = await call('tok-1');
    expect(res.status).toBe(200);
    const body = await res.json();

    // Team-level recap fields present (the allow-list).
    expect(body.recap.headline).toBe('A Season of Breakthroughs');
    expect(body.recap.season_period).toBe('Spring 2026 · Mar 1 – May 20');
    expect(body.recap.overall_assessment).toContain('Rockets');
    expect(Array.isArray(body.recap.team_highlights)).toBe(true);
    expect(Array.isArray(body.recap.skill_progress)).toBe(true);
    expect(Array.isArray(body.recap.team_challenges)).toBe(true);
    expect(typeof body.recap.coaching_insights).toBe('string');
    expect(Array.isArray(body.recap.next_season_priorities)).toBe(true);
    expect(body.recap.closing_message).toContain('real season');

    // Team name + coach first name + referral code so the page + CTA can render.
    expect(body.teamName).toBe('The Rockets');
    expect(body.coachFirstName).toBe('Coach');
    expect(body.referralCode).toBe('ABC234');
  });

  // AC: the public response includes the referrer's code resolved from
  // preferences.referral_code, lazily generated the SAME way /api/referrals does.
  it('lazily generates + persists the referral code when the coach has none', async () => {
    const coachId = '11111111-2222-4333-8444-555555555555';
    const expectedCode = makeReferralCode(coachId);
    const share = { id: 'srs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: coachId, is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: coachId, type: 'season_summary', content_structured: SEASON_SUMMARY };
    const team = { name: 'The Rockets' };
    const coach = { id: coachId, full_name: 'Coach Rivera', preferences: {} }; // no referral_code

    const coachChain = buildChain(coach);
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'season_recap_shares') return buildChain(share);
      if (table === 'plans') return buildChain(plan);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return coachChain;
      return buildChain(null);
    });

    const res = await call('tok-1');
    expect(res.status).toBe(200);
    const body = await res.json();

    // The generated code matches the shared deterministic algorithm…
    expect(body.referralCode).toBe(expectedCode);
    // …and it was persisted back to the coaches row.
    expect(coachChain.update).toHaveBeenCalled();
  });

  // AC / COPPA: team-level fields only. player_breakthroughs (which carries
  // player_name) and any per-player name MUST NOT appear anywhere in the
  // serialized response — the allow-list strips them server-side.
  it('never leaks player_breakthroughs or per-player names on the public response (COPPA)', async () => {
    const share = { id: 'srs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: 'coach-1', is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: 'coach-1', type: 'season_summary', content_structured: SEASON_SUMMARY };
    const team = { name: 'The Rockets' };
    const coach = { id: 'coach-1', full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'season_recap_shares') return buildChain(share);
      if (table === 'plans') return buildChain(plan);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain(coach);
      return buildChain(null);
    });

    const res = await call('tok-1');
    const raw = JSON.stringify(await res.json());

    // The poisoned per-minor field and the player names inside it must be stripped.
    expect(raw).not.toContain('player_breakthroughs');
    expect(raw).not.toContain('Alice Walker');
    expect(raw).not.toContain('Bob Carter');
    // The recap object exposed must not carry player_breakthroughs either.
    const body = JSON.parse(raw);
    expect(body.recap.player_breakthroughs).toBeUndefined();
  });
});
