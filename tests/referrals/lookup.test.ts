/**
 * Ticket 0021 — GET /api/referrals/lookup?code=<CODE> (public, no auth)
 *
 * Resolves a referral code → the inviting coach's FIRST NAME so the signup page
 * can land warm ("Coach Sarah invited you") instead of anonymous. The route
 * matches the STORED preferences.referral_code (the SAME deterministic mapping
 * makeReferralCode produces everywhere else — see src/lib/referral-code.ts) via a
 * single lookup; it does NOT recompute across all coaches or add a code index.
 *
 * These specs map 1:1 to the ticket's acceptance criteria:
 *  - a valid code resolves to { coachFirstName } (first token of full_name)
 *  - an unknown code returns 200 { coachFirstName: null } (NOT a 404 — a bad
 *    code must never break signup)
 *  - an empty / malformed code returns 200 { coachFirstName: null } WITHOUT a
 *    DB scan (enumeration hardening + data-minimization)
 *  - the response body carries ONLY { coachFirstName } — no email, no full name,
 *    no coach id, no team / player data (COPPA / data-minimization)
 *
 * File is `.test.ts` (NOT `.spec.ts`): vitest.config.ts excludes the spec glob
 * (those are Playwright). See docs/LESSONS.md.
 *
 * Pattern mirrors tests/team-card/public-get.test.ts (service-only chainable mock).
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

import { GET } from '@/app/api/referrals/lookup/route';
import { makeReferralCode } from '@/lib/referral-code';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
  };
  return chain;
}

// GET reads request.url for the `code` query param, so it MUST be called with a
// Request (LESSONS.md: only no-arg handlers are called with no args).
function call(code?: string) {
  const qs = code === undefined ? '' : `?code=${encodeURIComponent(code)}`;
  const request = new Request(`http://localhost/api/referrals/lookup${qs}`);
  return GET(request);
}

describe('GET /api/referrals/lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC: a valid code resolves to the coach's first name (first token of full_name),
  // matching the SAME deterministic makeReferralCode mapping used everywhere else.
  it('returns { coachFirstName } when the code resolves to a coach', async () => {
    const coachId = '11111111-2222-4333-8444-555555555555';
    const code = makeReferralCode(coachId);
    // The seeded coach stores their code under preferences.referral_code.
    const coach = { full_name: 'Sarah Rivera' };

    mockFromFn.mockReturnValue(buildChain(coach));

    const res = await call(code);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coachFirstName).toBe('Sarah');
  });

  // AC: an unknown code is a graceful null, NOT a 404 that would break the page.
  it('returns 200 { coachFirstName: null } for a code that resolves to no coach', async () => {
    mockFromFn.mockReturnValue(buildChain(null)); // no matching coach row
    const res = await call('ZZZZZZ');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coachFirstName).toBeNull();
  });

  // AC (enumeration hardening): an empty code returns null WITHOUT touching the DB.
  it('returns 200 { coachFirstName: null } for an empty code without a DB scan', async () => {
    const res = await call('');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coachFirstName).toBeNull();
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  // AC (enumeration hardening): a missing code param behaves the same — null, no scan.
  it('returns 200 { coachFirstName: null } when no code param is present, no DB scan', async () => {
    const res = await call(undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coachFirstName).toBeNull();
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  // AC (enumeration hardening): a malformed code (chars outside the alphabet /
  // wrong length) returns null WITHOUT a DB scan and never throws.
  it('returns 200 { coachFirstName: null } for a malformed code without a DB scan', async () => {
    const res = await call('not a real code!!');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coachFirstName).toBeNull();
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  // AC (privacy / data-minimization): the response body carries ONLY coachFirstName —
  // no email, no full name, no coach id, no team data, no player data.
  it('exposes ONLY { coachFirstName } — no email, full name, id, team, or player data', async () => {
    const coach = { full_name: 'Sarah Rivera', email: 'sarah@example.com', id: 'coach-1' };
    mockFromFn.mockReturnValue(buildChain(coach));

    const res = await call('AAAAAA');
    const body = await res.json();

    // Exactly one key, and it's coachFirstName.
    expect(Object.keys(body)).toEqual(['coachFirstName']);
    expect(body.coachFirstName).toBe('Sarah');

    // The raw payload must not leak the email, the full last name, or the id.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('sarah@example.com');
    expect(raw).not.toContain('Rivera');
    expect(raw).not.toContain('coach-1');
  });

  // AC: a coach with no full_name still returns a graceful null (never throws).
  it('returns { coachFirstName: null } when the resolved coach has no full_name', async () => {
    mockFromFn.mockReturnValue(buildChain({ full_name: null }));
    const res = await call('BBBBBB');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coachFirstName).toBeNull();
  });
});
