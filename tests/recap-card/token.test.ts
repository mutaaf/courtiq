/**
 * Ticket 0027 — GET /api/recap-card/[token] (public, no auth)
 *
 * The public read resolves a token → the game_recap plan → the team name + the
 * creating coach's referral code, so the public page can deep-link to
 * /signup?ref=CODE. These specs assert:
 *  - 404 for an unknown / inactive token
 *  - 200 returns the team-level recap fields + team name + coach first name + code
 *  - the response keys are EXACTLY the allow-list (mirrors PUBLIC_PERSONALITY_FIELDS
 *    in src/app/api/team-card/[token]/route.ts)
 *  - the referral code is lazily generated + persisted when the coach has none
 *    (same deterministic algorithm as /api/referrals via makeReferralCode)
 *  - COPPA: NO player-identifying data leaks — player_highlights (which carries
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

import { GET as publicGet } from '@/app/api/recap-card/[token]/route';
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

// A realistic game_recap content_structured (gameRecapSchema shape) PLUS a
// poisoned per-minor field — player_highlights, which carries player_name + a
// per-player stat_line — that MUST be stripped from the public response (COPPA /
// data-minimization). key_moments may carry an OPTIONAL player_name; that field is
// part of the team-level narrative and is allow-listed via key_moments, but the
// per-minor player_highlights array is excluded wholesale.
const GAME_RECAP = {
  title: 'Game Recap vs Eagles — May 24',
  result_headline: 'Victory Over the Eagles',
  intro:
    'The Rockets controlled the game from the opening tip and never let the Eagles back in, closing it out with poise down the stretch.',
  key_moments: [
    { headline: 'Defensive stand', description: 'A late stop sealed the win.' },
    { headline: 'Fast-break flurry', description: 'Three straight transition buckets.' },
  ],
  team_performance: {
    offensive_note: 'Moved the ball well and found the open shooter.',
    defensive_note: 'Switched everything and contested every shot.',
    effort_note: 'Sprinted back on defense all game.',
  },
  coach_message: 'Proud of how this team plays for each other. That was a team win.',
  looking_ahead: 'We carry this momentum into next week.',
  // ── per-minor data that must NEVER reach the public payload ──
  player_highlights: [
    { player_name: 'Alice Walker', highlight: 'Locked down the other team’s best scorer.', stat_line: '12 pts, 6 reb' },
    { player_name: 'Bob Carter', highlight: 'Ran the offense with poise.', stat_line: '8 ast' },
  ],
};

// The exact set of keys the public recap payload's `recap` object may expose.
const ALLOWED_RECAP_KEYS = [
  'title',
  'result_headline',
  'intro',
  'key_moments',
  'team_performance',
  'coach_message',
  'looking_ahead',
];

function call(token: string) {
  const request = new Request(`http://localhost/api/recap-card/${token}`);
  return publicGet(request, { params: Promise.resolve({ token }) });
}

describe('GET /api/recap-card/[token]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 for an unknown / inactive token', async () => {
    mockFromFn.mockReturnValue(buildChain(null)); // no game_recap_shares row
    const res = await call('no-such-token');
    expect(res.status).toBe(404);
    // No recap data leaks on the not-found path.
    const body = await res.json();
    expect(body.recap).toBeUndefined();
  });

  it('returns the team-level recap, team name, coach first name, and referral code', async () => {
    const share = { id: 'grs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: 'coach-1', is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: 'coach-1', type: 'game_recap', content_structured: GAME_RECAP };
    const team = { name: 'The Rockets' };
    // Coach already has a referral code persisted.
    const coach = { id: 'coach-1', full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'game_recap_shares') return buildChain(share);
      if (table === 'plans') return buildChain(plan);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain(coach);
      return buildChain(null);
    });

    const res = await call('tok-1');
    expect(res.status).toBe(200);
    const body = await res.json();

    // Team-level recap fields present (the allow-list).
    expect(body.recap.title).toBe('Game Recap vs Eagles — May 24');
    expect(body.recap.result_headline).toBe('Victory Over the Eagles');
    expect(body.recap.intro).toContain('Rockets');
    expect(Array.isArray(body.recap.key_moments)).toBe(true);
    expect(typeof body.recap.team_performance).toBe('object');
    expect(body.recap.coach_message).toContain('team win');
    expect(body.recap.looking_ahead).toContain('momentum');

    // Team name + coach first name + referral code so the page + CTA can render.
    expect(body.teamName).toBe('The Rockets');
    expect(body.coachFirstName).toBe('Coach');
    expect(body.referralCode).toBe('ABC234');
  });

  // AC: the response keys of `recap` are EXACTLY the allow-list — nothing outside
  // it (mirrors PUBLIC_PERSONALITY_FIELDS exactness in the team-card spec).
  it('exposes ONLY the allow-listed recap keys — no extra fields', async () => {
    const share = { id: 'grs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: 'coach-1', is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: 'coach-1', type: 'game_recap', content_structured: GAME_RECAP };
    const team = { name: 'The Rockets' };
    const coach = { id: 'coach-1', full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'game_recap_shares') return buildChain(share);
      if (table === 'plans') return buildChain(plan);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain(coach);
      return buildChain(null);
    });

    const res = await call('tok-1');
    const body = await res.json();
    // Exact key-set match — extra keys (e.g. player_highlights) would fail this.
    expect(Object.keys(body.recap).sort()).toEqual([...ALLOWED_RECAP_KEYS].sort());
  });

  // AC: the public response includes the referrer's code resolved from
  // preferences.referral_code, lazily generated the SAME way /api/referrals does.
  it('lazily generates + persists the referral code when the coach has none', async () => {
    const coachId = '11111111-2222-4333-8444-555555555555';
    const expectedCode = makeReferralCode(coachId);
    const share = { id: 'grs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: coachId, is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: coachId, type: 'game_recap', content_structured: GAME_RECAP };
    const team = { name: 'The Rockets' };
    const coach = { id: coachId, full_name: 'Coach Rivera', preferences: {} }; // no referral_code

    const coachChain = buildChain(coach);
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'game_recap_shares') return buildChain(share);
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

  // AC / COPPA: team-level fields only. player_highlights (which carries
  // player_name + stat_line for minors) and any per-player name MUST NOT appear
  // anywhere in the serialized response — the allow-list strips them server-side.
  it('never leaks player_highlights or per-player names on the public response (COPPA)', async () => {
    const share = { id: 'grs-1', token: 'tok-1', plan_id: 'plan-1', coach_id: 'coach-1', is_active: true };
    const plan = { id: 'plan-1', team_id: 'team-1', coach_id: 'coach-1', type: 'game_recap', content_structured: GAME_RECAP };
    const team = { name: 'The Rockets' };
    const coach = { id: 'coach-1', full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } };

    mockFromFn.mockImplementation((table: string) => {
      if (table === 'game_recap_shares') return buildChain(share);
      if (table === 'plans') return buildChain(plan);
      if (table === 'teams') return buildChain(team);
      if (table === 'coaches') return buildChain(coach);
      return buildChain(null);
    });

    const res = await call('tok-1');
    const raw = JSON.stringify(await res.json());

    // The poisoned per-minor field and the player names + stat lines inside it
    // must be stripped.
    expect(raw).not.toContain('player_highlights');
    expect(raw).not.toContain('Alice Walker');
    expect(raw).not.toContain('Bob Carter');
    expect(raw).not.toContain('12 pts, 6 reb');
    // The recap object exposed must not carry player_highlights either.
    const body = JSON.parse(raw);
    expect(body.recap.player_highlights).toBeUndefined();
  });
});
