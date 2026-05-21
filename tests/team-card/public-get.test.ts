/**
 * Ticket 0010 — GET /api/team-card/[token] (public, no auth)
 *
 * The public read resolves a token → the team_personality plan → the team name +
 * the creating coach's referral code, so the public page can deep-link to
 * /signup?ref=CODE. These specs assert:
 *  - 404 for an unknown / inactive token
 *  - 200 returns team-level content + team name + referral code
 *  - the referral code is lazily generated + persisted when the coach has none
 *    (same deterministic algorithm as /api/referrals)
 *  - COPPA: NO player-identifying data (player names, rosters, sampleObservations)
 *    leaks onto the public response
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

import { GET as publicGet } from '@/app/api/team-card/[token]/route';
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

// A realistic team_personality content_structured plus a poisoned per-minor field
// (sampleObservations w/ a player name) that MUST be stripped from the response.
const TEAM_PERSONALITY = {
  team_type: 'The Grinders',
  type_emoji: '🔥',
  tagline: 'Hard work is their superpower',
  description: 'A relentless, defense-first team that never quits.',
  traits: [
    { name: 'Work Ethic', score: 92, description: 'They out-hustle everyone.' },
    { name: 'Defense', score: 85, description: 'First back every possession.' },
    { name: 'Grit', score: 88, description: 'They thrive when behind.' },
  ],
  strengths: ['Relentless effort', 'Lockdown defense'],
  growth_areas: ['Half-court offense'],
  coaching_tips: ['Lean into their effort identity', 'Run more set plays'],
  team_motto: 'Leave it all on the court',
  // ── per-minor data that must NEVER reach the public payload ──
  sampleObservations: [
    { playerName: 'Alice Walker', text: 'Great lateral movement on defense' },
  ],
};

function call(token: string) {
  const request = new Request(`http://localhost/api/team-card/${token}`);
  return publicGet(request, { params: Promise.resolve({ token }) });
}

describe('GET /api/team-card/[token]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 for an unknown / inactive token', async () => {
    mockFromFn.mockReturnValue(buildChain(null)); // no team_card_shares row
    const res = await call('no-such-token');
    expect(res.status).toBe(404);
  });

  it('returns team-level content, team name, and the coach referral code', async () => {
    const share = { id: 'tcs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: 'coach-1', is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: 'coach-1', type: 'team_personality', content_structured: TEAM_PERSONALITY };
    const team = { name: 'The Grinders BB' };
    // Coach already has a referral code persisted.
    const coach = { id: 'coach-1', full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'team_card_shares') return buildChain(share);
      if (table === 'plans') return buildChain(plan);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain(coach);
      return buildChain(null);
    });

    const res = await call('tok-1');
    expect(res.status).toBe(200);
    const body = await res.json();

    // Team-level personality fields present.
    expect(body.personality.team_type).toBe('The Grinders');
    expect(body.personality.tagline).toBe('Hard work is their superpower');
    expect(Array.isArray(body.personality.traits)).toBe(true);
    expect(body.personality.team_motto).toBe('Leave it all on the court');

    // Team name + referral code present so the CTA can deep-link.
    expect(body.teamName).toBe('The Grinders BB');
    expect(body.referralCode).toBe('ABC234');
  });

  // AC: the public response includes the referrer's code resolved from
  // preferences.referral_code, lazily generated the SAME way /api/referrals does.
  it('lazily generates + persists the referral code when the coach has none', async () => {
    const coachId = '11111111-2222-4333-8444-555555555555';
    const expectedCode = makeReferralCode(coachId);
    const share = { id: 'tcs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: coachId, is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: coachId, type: 'team_personality', content_structured: TEAM_PERSONALITY };
    const team = { name: 'The Grinders BB' };
    const coach = { id: coachId, full_name: 'Coach Rivera', preferences: {} }; // no referral_code

    const coachChain = buildChain(coach);
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'team_card_shares') return buildChain(share);
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

  // AC / COPPA: team-level fields only. No player names, rosters, or
  // sampleObservations may appear anywhere in the serialized response.
  it('never leaks player-identifying data on the public response (COPPA)', async () => {
    const share = { id: 'tcs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: 'coach-1', is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: 'coach-1', type: 'team_personality', content_structured: TEAM_PERSONALITY };
    const team = { name: 'The Grinders BB' };
    const coach = { id: 'coach-1', full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'team_card_shares') return buildChain(share);
      if (table === 'plans') return buildChain(plan);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain(coach);
      return buildChain(null);
    });

    const res = await call('tok-1');
    const raw = JSON.stringify(await res.json());

    // The poisoned per-minor fields from content_structured must be stripped.
    expect(raw).not.toContain('sampleObservations');
    expect(raw).not.toContain('Alice Walker');
    // The personality object exposed must not carry sampleObservations either.
    const body = JSON.parse(raw);
    expect(body.personality.sampleObservations).toBeUndefined();
  });
});
