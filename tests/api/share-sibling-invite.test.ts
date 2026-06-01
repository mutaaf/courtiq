/**
 * Ticket 0060 — POST /api/share/[token]/sibling-invite.
 *
 * Public route (token-scoped). Accepts the form payload the new card's sheet
 * collects: { siblingFirstName, otherCoachEmail, note? }. Validates, resolves
 * the parent's source player + program from the share token, dedupes against
 * `parent_initiated_invites` on `(from_share_token, to_coach_email)` over a
 * 30-day rolling window, rate-limits at 3 invites per share token per 7 days,
 * writes ONE dedupe row and sends ONE email via the existing `sendEmail()`.
 *
 * Tests:
 *  - 400 on malformed JSON; 422 on missing/invalid fields and on note > 200.
 *  - 404 on tampered/unknown token.
 *  - 200 happy path: writes one row, calls sendEmail() once, returns
 *    `{ sent: true }`.
 *  - 200 dedupe path: prior row in the last 30 days → `{ sent: false,
 *    reason: 'already-invited' }` and NO sendEmail() call.
 *  - 429 rate-limit: 4th invite from the same token in 7 days returns 429
 *    with `{ reason: 'rate-limited' }`.
 *  - tier-NOT-gated: the route source does not import @/lib/tier.
 *  - referral code: stamped from `makeReferralCode(programId)`, not
 *    `coach_id` — the program owns the referral (the parent never gets
 *    credit).
 *
 * Mocking pattern mirrors tests/api/share-program-referral.test.ts: hoisted
 * Supabase mock with chainable resolvers, vi.mocked-controlled queue,
 * mockReset() in beforeEach (LESSONS#0049 / #0092).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SHARE_TOKEN = 'test-share-token-e2e-001';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockFromFn, mockSendEmail } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: mockSendEmail,
}));

import { POST } from '@/app/api/share/[token]/sibling-invite/route';
import { _resetSiblingInviteRateLimiterForTest } from '@/lib/sibling-invite-utils';
import { makeReferralCode } from '@/lib/referral-code';

// ─── Chain helpers ────────────────────────────────────────────────────────────

interface Resolved<T = unknown> {
  data: T | null;
  error: unknown;
}

function buildChain<T = unknown>(data: T | null = null, error: unknown = null) {
  const resolved: Resolved<T> = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: Resolved<T>) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function insertCaptureChain(data: unknown = { id: 'pi-row-1' }) {
  const calls: Array<unknown> = [];
  const resolved = { data, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: unknown) => {
      calls.push(payload);
      return chain;
    }),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
    _calls: calls,
  };
  return chain;
}

// Fixtures
const E2E_SHARE = {
  id: '00000000-0000-4000-a000-000000000060',
  player_id: '00000000-0000-4000-a000-000000000030',
  team_id: '00000000-0000-4000-a000-000000000020',
  coach_id: '00000000-0000-4000-a000-000000000001',
  is_active: true,
  expires_at: null,
};
const E2E_SOURCE_PLAYER = {
  id: '00000000-0000-4000-a000-000000000030',
  name: 'Alice Walker',
  team_id: '00000000-0000-4000-a000-000000000020',
  parent_email: 'sarah@walker-family.test',
  parent_name: 'Walker Family',
};
const E2E_SOURCE_TEAM = {
  id: '00000000-0000-4000-a000-000000000020',
  name: 'E2E Test Team',
  org_id: '00000000-0000-4000-a000-000000000010',
};
const E2E_ORG = {
  id: '00000000-0000-4000-a000-000000000010',
  name: 'E2E Test Org',
};

/**
 * Queue the happy-path chain sequence:
 *   1) parent_shares — token lookup
 *   2) players — source player (for parent_email + program resolution)
 *   3) teams — source team's org_id + name
 *   4) organizations — program name
 *   5) parent_initiated_invites — dedup query (last 30 days)
 *   6) parent_initiated_invites — rate-limit count (last 7 days)
 *   7) parent_initiated_invites — INSERT
 */
function queueHappyPath(opts: {
  share?: unknown;
  sourcePlayer?: unknown;
  sourceTeam?: unknown;
  org?: unknown;
  prior?: unknown;
  rateCount?: number;
  insertResult?: unknown;
} = {}): { insertChain: ReturnType<typeof insertCaptureChain> } {
  const insertChain = insertCaptureChain(opts.insertResult ?? { id: 'pi-row-1' });
  // Rate limit is a count; we model it as an array of length `rateCount`.
  const rateRows = Array.from({ length: opts.rateCount ?? 0 }, (_, i) => ({
    id: `prior-${i}`,
  }));

  mockFromFn
    .mockReturnValueOnce(buildChain(opts.share ?? E2E_SHARE)) // parent_shares
    .mockReturnValueOnce(buildChain(opts.sourcePlayer ?? E2E_SOURCE_PLAYER)) // players
    .mockReturnValueOnce(buildChain(opts.sourceTeam ?? E2E_SOURCE_TEAM)) // teams
    .mockReturnValueOnce(buildChain(opts.org ?? E2E_ORG)) // organizations
    .mockReturnValueOnce(buildChain(opts.prior ?? null)) // dedup query
    .mockReturnValueOnce(buildChain(rateRows)) // rate-limit count
    .mockReturnValueOnce(insertChain); // INSERT
  return { insertChain };
}

function makeRequest(body: unknown, token: string = SHARE_TOKEN) {
  return new Request(`http://localhost/api/share/${token}/sibling-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function defaultBody(overrides: Record<string, unknown> = {}) {
  return {
    siblingFirstName: 'Sofia',
    otherCoachEmail: 'riley@hornets.test',
    note: 'Thought you might want to see this for our other team too.',
    ...overrides,
  };
}

const tokenParams = (token: string = SHARE_TOKEN) =>
  Promise.resolve({ token });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/share/[token]/sibling-invite (ticket 0060)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockSendEmail.mockReset();
    _resetSiblingInviteRateLimiterForTest();
    process.env.NEXT_PUBLIC_APP_URL = 'https://youthsportsiq.com';
    mockSendEmail.mockResolvedValue({ success: true, id: 'em_si1' });
  });

  // ─── Validation ────────────────────────────────────────────────────────────

  it('returns 400 on malformed JSON', async () => {
    const res = await POST(
      new Request(`http://localhost/api/share/${SHARE_TOKEN}/sibling-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-json',
      }),
      { params: tokenParams() },
    );
    expect(res.status).toBe(400);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when siblingFirstName is missing', async () => {
    const res = await POST(
      makeRequest(defaultBody({ siblingFirstName: '' })),
      { params: tokenParams() },
    );
    expect(res.status).toBe(400);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when otherCoachEmail is malformed', async () => {
    const res = await POST(
      makeRequest(defaultBody({ otherCoachEmail: 'not-an-email' })),
      { params: tokenParams() },
    );
    expect(res.status).toBe(400);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when note exceeds 200 chars', async () => {
    const res = await POST(
      makeRequest(defaultBody({ note: 'x'.repeat(201) })),
      { params: tokenParams() },
    );
    expect(res.status).toBe(400);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  // ─── Token resolution ─────────────────────────────────────────────────────

  it('returns 404 for a tampered/unknown token', async () => {
    mockFromFn.mockReturnValueOnce(buildChain(null)); // parent_shares not found
    const res = await POST(
      makeRequest(defaultBody(), 'tampered'),
      { params: tokenParams('tampered') },
    );
    expect(res.status).toBe(404);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it('happy path: writes ONE dedupe row and sends ONE email', async () => {
    const { insertChain } = queueHappyPath();
    const res = await POST(makeRequest(defaultBody()), {
      params: tokenParams(),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(true);

    // Exactly one insert with the documented allow-list of columns.
    const inserts = insertChain._calls as unknown[];
    expect(inserts).toHaveLength(1);
    const payload = inserts[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        'from_player_id',
        'from_share_token',
        'program_id',
        'referral_code',
        'sibling_first_name',
        'to_coach_email',
      ].sort(),
    );
    expect(payload.from_share_token).toBe(SHARE_TOKEN);
    expect(payload.from_player_id).toBe(E2E_SOURCE_PLAYER.id);
    expect(payload.to_coach_email).toBe('riley@hornets.test');
    expect(payload.sibling_first_name).toBe('Sofia');
    expect(payload.program_id).toBe(E2E_ORG.id);
    // Referral code is derived from the PROGRAM, not the inviting parent or
    // the inviting coach. The parent never receives a referral credit.
    expect(payload.referral_code).toBe(makeReferralCode(E2E_ORG.id));

    // Exactly one email sent.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sendArg = mockSendEmail.mock.calls[0][0];
    expect(sendArg.to).toBe('riley@hornets.test');
    // The email subject names the parent and the sibling.
    expect(sendArg.subject).toMatch(/Sofia/);
    // The CTA links to the program-scoped referral landing.
    expect(sendArg.html).toContain(`ref=${makeReferralCode(E2E_ORG.id)}`);
    expect(sendArg.html).toContain(`program=${E2E_ORG.id}`);
  });

  // ─── Dedupe ───────────────────────────────────────────────────────────────

  it('200 dedup path: prior row in the last 30 days → sent:false, reason:already-invited', async () => {
    const recent = {
      id: 'pi-row-prior',
      from_share_token: SHARE_TOKEN,
      to_coach_email: 'riley@hornets.test',
      sent_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    };
    queueHappyPath({ prior: recent });

    const res = await POST(makeRequest(defaultBody()), {
      params: tokenParams(),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(false);
    expect(json.reason).toBe('already-invited');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Rate limit ───────────────────────────────────────────────────────────

  it('429 when the 4th invite within 7 days is attempted', async () => {
    // Rate window already saturated with 3 prior invites from this token.
    queueHappyPath({ rateCount: 3 });

    const res = await POST(
      makeRequest(defaultBody({ otherCoachEmail: 'someone-else@example.test' })),
      { params: tokenParams() },
    );
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.reason).toBe('rate-limited');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Tier-gate contract ──────────────────────────────────────────────────

  it('does NOT import @/lib/tier (the surface is not tier-gated)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const raw = readFileSync(
      join(process.cwd(), 'src/app/api/share/[token]/sibling-invite/route.ts'),
      'utf8',
    );
    // Strip /** ... */ blocks then `//` line comments — the route's
    // docstring legitimately names the tier module to document why it is
    // omitted (LESSONS#0023 / #0088).
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(code).not.toMatch(/from\s+['"]@\/lib\/tier['"]/);
    expect(code).not.toMatch(/\bcanAccess\b/);
  });

  // ─── COPPA shape ───────────────────────────────────────────────────────────

  it('never persists parent_email, parent_phone, date_of_birth, or sibling last name', async () => {
    const { insertChain } = queueHappyPath();
    await POST(
      makeRequest(defaultBody({ siblingFirstName: 'Sofia Walker' })),
      { params: tokenParams() },
    );
    const payload = (insertChain._calls as Record<string, unknown>[])[0];
    // Even when the parent tries to type a full name, the route strips to
    // the first space-delimited token — there is no last-name column at all.
    expect(payload.sibling_first_name).toBe('Sofia');
    expect(Object.keys(payload)).not.toContain('parent_email');
    expect(Object.keys(payload)).not.toContain('parent_phone');
    expect(Object.keys(payload)).not.toContain('date_of_birth');
    expect(Object.keys(payload)).not.toContain('sibling_last_name');
  });
});
