/**
 * Vitest — POST /api/auth/setup org-attachment (ticket 0024).
 *
 * The org landing page CTA already deep-links to /signup?org=<slug>
 * (src/app/org/[slug]/page.tsx), and the signup form forwards `org` to this
 * setup route. This is the server side that resolves the slug → an existing
 * organization and attaches the new coach to THAT org (sets coaches.org_id)
 * instead of minting a fresh solo org — so a director's whole staff lands in
 * one shared program.
 *
 * Maps 1:1 to the ticket's acceptance criteria:
 *  - AC5: a setup call carrying a valid `org` slug writes the matching org_id
 *         (no new org created).
 *  - AC5: an invalid/unknown slug falls back to today's default behavior
 *         (a new solo org is created) WITHOUT erroring.
 *  - AC9 (regression): `ref` and `org` are handled independently — a call
 *         carrying BOTH still records referred_by_code AND attaches the org;
 *         a `ref`-only call (no `org`) keeps today's solo-org + referral path
 *         byte-for-byte.
 *
 * File is `.test.ts` (NOT `.spec.ts`): vitest.config.ts excludes the spec glob.
 *
 * Pattern mirrors tests/referrals-route.test.ts (auth + chainable service mock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// A chainable in-memory builder. `single()` resolves to the configured row.
// `insert(...).select().single()` resolves to the inserted-row response, while
// the LAST argument passed to insert() is captured so the test can assert what
// was written (e.g. org_id, preferences.referred_by_code).
function buildChain(opts: {
  single?: { data: unknown; error: unknown };
  insert?: { data: unknown; error: unknown };
  capture?: (table: 'insert', payload: unknown) => void;
}) {
  const singleResolved = opts.single ?? { data: null, error: null };
  const insertResolved = opts.insert ?? { data: null, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: unknown) => {
      opts.capture?.('insert', payload);
      // insert(...).select().single() and bare insert(...) must both resolve.
      return {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(insertResolved),
        then: (onFulfilled: (v: typeof insertResolved) => unknown) =>
          Promise.resolve(insertResolved).then(onFulfilled),
      };
    }),
    single: vi.fn().mockResolvedValue(singleResolved),
    maybeSingle: vi.fn().mockResolvedValue(singleResolved),
  };
  return chain;
}

function setAuthUser(id = 'new-coach', email = 'new@example.com') {
  mockGetUser.mockResolvedValue({
    data: { user: { id, email, user_metadata: {} } },
    error: null,
  });
}

function call(body: Record<string, unknown>) {
  const request = new Request('http://localhost/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request);
}

describe('POST /api/auth/setup — org attachment via slug (ticket 0024)', () => {
  beforeEach(() => vi.clearAllMocks());

  // AC5: a valid `org` slug attaches the coach to the EXISTING org (no new org).
  it('attaches the new coach to the existing org when a valid org slug is passed', async () => {
    setAuthUser('coach-joining');
    let coachInsert: Record<string, unknown> | null = null;
    let orgInsertCalled = false;

    mockServiceFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        // 1st coaches access: existence check → no existing coach.
        // 2nd coaches access: the insert of the new coach.
        return buildChain({
          single: { data: null, error: null },
          insert: { data: { id: 'coach-joining' }, error: null },
          capture: (_kind, payload) => {
            coachInsert = payload as Record<string, unknown>;
          },
        });
      }
      if (table === 'organizations') {
        // org lookup by slug → an existing org row.
        return buildChain({
          single: { data: { id: 'org-existing-42', slug: 'lincoln-rec-league' }, error: null },
          insert: { data: { id: 'org-NEW' }, error: null },
          capture: () => {
            orgInsertCalled = true;
          },
        });
      }
      return buildChain({});
    });

    const res = await call({ fullName: 'Joining Coach', org: 'lincoln-rec-league' });
    expect(res.status).toBe(200);

    expect(coachInsert).not.toBeNull();
    expect(coachInsert!.org_id).toBe('org-existing-42');
    // No fresh solo org was minted — the coach joined the existing program.
    expect(orgInsertCalled).toBe(false);
  });

  // AC5: an unknown slug falls back to today's default (a new solo org), no error.
  it('falls back to creating a new org when the slug is unknown (no error)', async () => {
    setAuthUser('coach-bad-slug');
    let orgInsertCalled = false;
    let coachInsert: Record<string, unknown> | null = null;

    mockServiceFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return buildChain({
          single: { data: null, error: null },
          insert: { data: { id: 'coach-bad-slug' }, error: null },
          capture: (_kind, payload) => {
            coachInsert = payload as Record<string, unknown>;
          },
        });
      }
      if (table === 'organizations') {
        return buildChain({
          // unknown slug → no row
          single: { data: null, error: { message: 'not found' } },
          insert: { data: { id: 'org-fresh-1' }, error: null },
          capture: () => {
            orgInsertCalled = true;
          },
        });
      }
      return buildChain({});
    });

    const res = await call({ fullName: 'Lost Coach', org: 'does-not-exist' });
    expect(res.status).toBe(200);

    // Fell back to the default: a brand-new org was created and the coach attached to it.
    expect(orgInsertCalled).toBe(true);
    expect(coachInsert).not.toBeNull();
    expect(coachInsert!.org_id).toBe('org-fresh-1');
  });

  // AC9 (regression): `ref` + `org` handled independently — both honored together.
  it('records referred_by_code AND attaches the org when both ref and org are present', async () => {
    setAuthUser('coach-both');
    let coachInsert: Record<string, unknown> | null = null;

    mockServiceFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return buildChain({
          single: { data: null, error: null },
          insert: { data: { id: 'coach-both' }, error: null },
          capture: (_kind, payload) => {
            coachInsert = payload as Record<string, unknown>;
          },
        });
      }
      if (table === 'organizations') {
        return buildChain({
          single: { data: { id: 'org-shared-7', slug: 'eastside-hoops' }, error: null },
        });
      }
      return buildChain({});
    });

    const res = await call({
      fullName: 'Both Coach',
      org: 'eastside-hoops',
      referredByCode: 'xyz789',
    });
    expect(res.status).toBe(200);

    expect(coachInsert).not.toBeNull();
    // org attachment
    expect(coachInsert!.org_id).toBe('org-shared-7');
    // referral attribution preserved, independent of the org path
    const prefs = coachInsert!.preferences as Record<string, unknown>;
    expect(prefs.referred_by_code).toBe('XYZ789');
  });

  // AC9 (regression): a `ref`-only call keeps today's solo-org + referral path.
  it('keeps the solo-org + referral path when only ref is present (no org)', async () => {
    setAuthUser('coach-ref-only');
    let orgInsertCalled = false;
    let coachInsert: Record<string, unknown> | null = null;

    mockServiceFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') {
        return buildChain({
          single: { data: null, error: null },
          insert: { data: { id: 'coach-ref-only' }, error: null },
          capture: (_kind, payload) => {
            coachInsert = payload as Record<string, unknown>;
          },
        });
      }
      if (table === 'organizations') {
        return buildChain({
          single: { data: null, error: null },
          insert: { data: { id: 'org-solo-9' }, error: null },
          capture: () => {
            orgInsertCalled = true;
          },
        });
      }
      return buildChain({});
    });

    const res = await call({ fullName: 'Solo Coach', referredByCode: 'abc123' });
    expect(res.status).toBe(200);

    // No org slug → a fresh solo org is minted (today's behavior, unchanged).
    expect(orgInsertCalled).toBe(true);
    expect(coachInsert).not.toBeNull();
    expect(coachInsert!.org_id).toBe('org-solo-9');
    const prefs = coachInsert!.preferences as Record<string, unknown>;
    expect(prefs.referred_by_code).toBe('ABC123');
  });
});
