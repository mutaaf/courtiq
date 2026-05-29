/**
 * Ticket 0050 — POST /api/auth/setup stamps the program_referrals row on a
 * successful claim arriving via /share/<token>?pr=<signed_director_id>.
 *
 * AC: When the director taps the claim CTA and the org claim completes, set
 * claimed_at = now() and claimed_org_id = <claimed_org> on the
 * corresponding program_referrals row. The route NEVER trusts a client-supplied
 * id (LESSONS#0039) — it verifies the HMAC server-side and only updates a
 * row whose (share_token, director_email_hash) matches the verified payload
 * AND has claimed_at IS NULL (single-use convention, 0042 family).
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashDirectorEmail,
  signDirectorId,
} from '@/lib/program-referral-utils';

const { mockGetUser, mockServiceFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServiceFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({
    from: mockServiceFromFn,
  })),
}));

import { POST } from '@/app/api/auth/setup/route';

const SECRET = 'cron-secret-test';
const SHARE_TOKEN = 'test-share-token-for-attribution';
const DIRECTOR_HASH = hashDirectorEmail('jordan@reclyleague.org');

// Build the chain shapes the setup route consumes. The route does:
//   1. from('coaches').select.eq.single — existence check (null = new coach)
//   2. (optional) from('organizations').select.eq.single — slug lookup
//   3. from('organizations').insert.select.single — new org (when no slug)
//   4. from('coaches').insert — new coach
//   5. (optional) from('teams').select.eq.single — team belongs check
//   6. (optional) from('team_coaches').insert — team association
//   7. (NEW for 0050) from('program_referrals').update.eq.eq.is — stamp
//
// Track which tables saw which operation.

type UpdateCapture = {
  payload: unknown;
  filters: Array<{ method: string; col: string; val: unknown }>;
};

const programReferralUpdates: UpdateCapture[] = [];

function programReferralUpdateChain(): Record<string, unknown> {
  const capture: UpdateCapture = { payload: null, filters: [] };
  const chain: Record<string, unknown> = {
    update: vi.fn((payload: unknown) => {
      capture.payload = payload;
      return chain;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      capture.filters.push({ method: 'eq', col, val });
      return chain;
    }),
    is: vi.fn((col: string, val: unknown) => {
      capture.filters.push({ method: 'is', col, val });
      // The update returns a thenable on the final call.
      return Promise.resolve({ data: null, error: null });
    }),
  };
  programReferralUpdates.push(capture);
  return chain;
}

function wireMock() {
  mockServiceFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    if (table === 'organizations') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'org-claim-target' },
          error: null,
        }),
        insert: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'org-claim-target' },
            error: null,
          }),
        })),
      };
    }
    if (table === 'program_referrals') {
      return programReferralUpdateChain();
    }
    // Default permissive chain for any other table the route might touch.
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });
}

function setAuthUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'new-coach-id', email: 'claimer@example.com', user_metadata: {} } },
    error: null,
  });
}

async function call(body: Record<string, unknown>) {
  const request = new Request('http://localhost/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request);
}

describe('POST /api/auth/setup — program-referral attribution (ticket 0050)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServiceFromFn.mockReset();
    programReferralUpdates.length = 0;
    process.env.CRON_SECRET = SECRET;
    wireMock();
    setAuthUser();
  });

  it('stamps the row with claimed_at + claimed_org_id when programReferralId verifies', async () => {
    const signed = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: SECRET,
    });

    const res = await call({
      fullName: 'New Coach',
      org: 'discoverable-rec',
      programReferralId: signed,
    });
    expect(res.status).toBe(200);

    // The program_referrals table was touched exactly once with the right
    // verified filters and payload.
    expect(programReferralUpdates).toHaveLength(1);
    const u = programReferralUpdates[0];
    const payload = u.payload as Record<string, unknown>;
    expect(payload.claimed_org_id).toBe('org-claim-target');
    expect(typeof payload.claimed_at).toBe('string');

    // Filters were the share_token + director_email_hash from the verified
    // token, plus the claimed_at IS NULL single-use guard.
    expect(u.filters).toEqual([
      { method: 'eq', col: 'share_token', val: SHARE_TOKEN },
      { method: 'eq', col: 'director_email_hash', val: DIRECTOR_HASH },
      { method: 'is', col: 'claimed_at', val: null },
    ]);
  });

  it('does NOT stamp when programReferralId is missing', async () => {
    const res = await call({
      fullName: 'New Coach',
      org: 'discoverable-rec',
    });
    expect(res.status).toBe(200);
    expect(programReferralUpdates).toHaveLength(0);
  });

  it('does NOT stamp when programReferralId is tampered (wrong hmac)', async () => {
    const signed = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: SECRET,
    });
    const [tok, hash] = signed.split('.');
    const forged = `${tok}.${hash}.AAAAAAAAAAAAAAAA`;

    const res = await call({
      fullName: 'New Coach',
      org: 'discoverable-rec',
      programReferralId: forged,
    });
    expect(res.status).toBe(200);
    expect(programReferralUpdates).toHaveLength(0);
  });

  it('does NOT stamp when programReferralId was signed with a different secret', async () => {
    const signed = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: 'a-different-secret',
    });

    const res = await call({
      fullName: 'New Coach',
      org: 'discoverable-rec',
      programReferralId: signed,
    });
    expect(res.status).toBe(200);
    expect(programReferralUpdates).toHaveLength(0);
  });

  it('does NOT stamp when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    const signed = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: SECRET,
    });

    const res = await call({
      fullName: 'New Coach',
      org: 'discoverable-rec',
      programReferralId: signed,
    });
    expect(res.status).toBe(200);
    expect(programReferralUpdates).toHaveLength(0);
  });
});
