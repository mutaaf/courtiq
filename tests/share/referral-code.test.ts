/**
 * Ticket 0011 — GET /api/share/[token] threads the creating coach's referral
 * code through the parent portal response so the "Share with your other coach"
 * CTA can deep-link to /signup?ref=CODE.
 *
 * The share GET resolves the code from share.coach_id → coaches.preferences
 * .referral_code, lazily generating + persisting it with the SAME deterministic
 * helper /api/referrals uses (makeReferralCode) when absent. These specs assert:
 *  - existing code returned unchanged (no overwrite)
 *  - lazy-generate + persist when the coach has no code
 *  - a code-resolution failure degrades to referralCode: null and NEVER 500s
 *  - COPPA: the response gains exactly `referralCode` and nothing player-scoped
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  // The public share route uses ONLY the service client; no auth.
  createServiceSupabase: vi.fn(async () => ({
    from: mockFromFn,
  })),
}));

import { GET as shareGet } from '@/app/api/share/[token]/route';
import { makeReferralCode } from '@/lib/referral-code';

/**
 * A flexible query-builder mock. Every chain method returns `this`; the chain is
 * thenable so `await chain` (used by the route's `.order().limit()` reads that
 * don't end in `.single()`) resolves to `{ data, error }`, and `.single()`
 * resolves the same. This mirrors the real supabase-js builder closely enough
 * for the share route's mix of single-row and list reads.
 */
function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, any> = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    or: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(resolved),
    then: (resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolved).then(resolve),
  };
  return chain;
}

const SHARE_ID = '00000000-0000-4000-a000-000000000060';
const PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';

// A baseline share row with no optional report sections so the route stays on
// the lightest read path; the referral resolution is independent of them.
function shareRow(coachId: string) {
  return {
    id: SHARE_ID,
    player_id: PLAYER_ID,
    team_id: TEAM_ID,
    coach_id: coachId,
    share_token: 'tok-1',
    is_active: true,
    expires_at: null,
    pin: null,
    custom_message: null,
    view_count: 0,
  };
}

const PLAYER = { id: PLAYER_ID, name: 'Alice Walker', parent_phone: null };
const TEAM = { name: 'E2E Test Team', age_group: '11-13', season: 'Spring 2026' };

/**
 * Wire the per-table mock. `coachChain` is returned for the `coaches` table so a
 * test can assert whether `.update()` was called (lazy persist). `coachData`
 * controls what the coach lookup resolves to (null simulates a missing coach).
 */
function wireTables(opts: { coachId: string; coachChain: ReturnType<typeof buildChain> }) {
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'parent_shares') return buildChain(shareRow(opts.coachId));
    if (table === 'players') return buildChain(PLAYER);
    if (table === 'teams') return buildChain(TEAM);
    if (table === 'coaches') return opts.coachChain;
    // org_branding, plans, observations, achievements, goals, announcements,
    // player_skill_proficiency, etc. all resolve empty.
    return buildChain(null);
  });
}

function call(token = 'tok-1') {
  const request = new Request(`http://localhost/api/share/${token}`);
  return shareGet(request, { params: Promise.resolve({ token }) });
}

describe('GET /api/share/[token] — referral code threading (ticket 0011)', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC: a coach who already has a referral_code gets it back unchanged, with no
  // overwrite of the existing code.
  it('returns the coach\'s existing referral_code unchanged (no overwrite)', async () => {
    const coachId = 'coach-existing';
    const coachChain = buildChain({ full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } });
    wireTables({ coachId, coachChain });

    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.referralCode).toBe('ABC234');
    // The existing code must NOT be re-persisted.
    expect(coachChain.update).not.toHaveBeenCalled();
  });

  // AC: lazily generate + persist the code with makeReferralCode when absent,
  // matching the deterministic algorithm /api/referrals uses.
  it('lazily generates AND persists the referral code when the coach has none', async () => {
    const coachId = '11111111-2222-4333-8444-555555555555';
    const expectedCode = makeReferralCode(coachId);
    const coachChain = buildChain({ full_name: 'Coach Rivera', preferences: {} }); // no referral_code
    wireTables({ coachId, coachChain });

    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();

    // Generated code matches the shared deterministic helper…
    expect(body.referralCode).toBe(expectedCode);
    // …and it was written back to the coaches row, preserving existing prefs.
    expect(coachChain.update).toHaveBeenCalledTimes(1);
    const updateArg = (coachChain.update as any).mock.calls[0][0];
    expect(updateArg.preferences.referral_code).toBe(expectedCode);
  });

  // AC (regression): if the code can't be resolved (coach row missing) the share
  // route still returns its report data with referralCode: null — NEVER 500s.
  it('degrades to referralCode: null and stays 200 when the coach is missing', async () => {
    const coachId = 'coach-missing';
    const coachChain = buildChain(null); // coach lookup resolves to no row
    wireTables({ coachId, coachChain });

    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.referralCode).toBeNull();
    // Core report data still present.
    expect(body.player.name).toBe('Alice Walker');
    expect(body.team.name).toBe('E2E Test Team');
  });

  // AC (regression): a persistence WRITE failure must not 500 the public portal;
  // it degrades to referralCode: null.
  it('degrades to referralCode: null when the lazy persist write throws', async () => {
    const coachId = '11111111-2222-4333-8444-555555555555';
    const coachChain = buildChain({ full_name: 'Coach Rivera', preferences: {} });
    // Make the persist write reject.
    coachChain.update = vi.fn(() => ({
      eq: vi.fn().mockRejectedValue(new Error('write failed')),
    }));
    wireTables({ coachId, coachChain });

    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.referralCode).toBeNull();
  });

  // AC (COPPA): the share response gains exactly `referralCode` and exposes no
  // new player/minor-scoped field as part of this change. referralCode is a
  // coach-level 6-char code, never derived from a player.
  it('adds a coach-level referralCode and nothing player-scoped (COPPA)', async () => {
    const coachId = 'coach-existing';
    const coachChain = buildChain({ full_name: 'Coach Rivera', preferences: { referral_code: 'ABC234' } });
    wireTables({ coachId, coachChain });

    const res = await call();
    const body = await res.json();

    // referralCode is present and is a coach-level code (not a player id/name).
    expect(body).toHaveProperty('referralCode', 'ABC234');
    expect(body.referralCode).not.toContain(PLAYER_ID);
    expect(body.referralCode).not.toContain('Alice');
    // The player block is unchanged — no new minor field smuggled alongside.
    expect(Object.keys(body.player).sort()).toEqual(['id', 'name', 'parent_phone'].sort());
  });
});
