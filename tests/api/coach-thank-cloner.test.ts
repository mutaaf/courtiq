/**
 * Ticket 0081 — POST /api/coach/thank-cloner.
 *
 * The publishing coach taps "Thank this coach" on a 0076 stuck
 * milestone card on /home. The route:
 *  (a) authed; 401 if no session;
 *  (b) accepts `{ milestoneId, body }`;
 *  (c) verifies the caller IS the milestone's published_coach_id
 *      (only the publisher can thank back; 404 otherwise);
 *  (d) resolves the cloner via the linked stick signal
 *      (drill_clone_stick_signals.cloner_coach_id);
 *  (e) sanitizes the body (strip HTML; 1..280 chars; defensive
 *      anti-email-leak per LESSONS#0061 with a LITERAL space);
 *  (f) writes ONE row into coach_thank_messages, idempotent on
 *      UNIQUE(sender, recipient, drill_share_id) — a re-tap returns
 *      the existing row's id;
 *  (g) NEVER reads the recipient's email, players, observations.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { POST } from '@/app/api/coach/thank-cloner/route';

const PUBLISHER_ID = '00000000-0000-4000-a000-000000000301';
const CLONER_ID = '00000000-0000-4000-a000-0000000000d9';
const MILESTONE_ID = '00000000-0000-4000-a000-000000000317';
const DRILL_SHARE_ID = '00000000-0000-4000-a000-000000000311';

/** Build a hand-rolled supabase chain. Each test queues the rows the
 *  route expects per from() call via mockFromFn.mockImplementation. */
function chainOf<T = unknown>(data: T | null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

/** Drive the table whitelist for the happy path. The route legitimately
 *  reads `drill_shares` (to scope by publisher) before reading the
 *  stick signal — that's allow-listed (coach-level, no minor data). */
function happyPathTables(opts: {
  milestoneRow?: Record<string, unknown> | null;
  publisherShareRows?: Array<Record<string, unknown>>;
  stickRow?: Record<string, unknown> | null;
  existingMessageRow?: Record<string, unknown> | null;
  insertedRow?: Record<string, unknown> | null;
}) {
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coach_reputation_milestones') {
      return chainOf(opts.milestoneRow ?? null);
    }
    if (table === 'drill_shares') {
      return chainOf(opts.publisherShareRows ?? [{ id: DRILL_SHARE_ID }]);
    }
    if (table === 'drill_clone_stick_signals') {
      return chainOf(opts.stickRow ?? null);
    }
    if (table === 'coach_thank_messages') {
      // The route first looks up an existing message via maybeSingle;
      // if none, it inserts. We return both chains based on the
      // route's calls — the existing row lookup returns null on first
      // call, the insert returns the new row on the second call.
      const chain = chainOf(opts.existingMessageRow ?? null);
      // Override insert to return the inserted row payload.
      chain.insert = vi.fn().mockImplementation(() => {
        const inserted = opts.insertedRow ?? { id: 'new-msg-1' };
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: inserted, error: null }),
        };
      });
      return chain;
    }
    // The route MUST NOT read players, observations, parent contact,
    // emails, or anything kid-side. Any other table is an error.
    throw new Error(`Unexpected from(${table})`);
  });
}

describe('POST /api/coach/thank-cloner (ticket 0081)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when no user is authed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({ milestoneId: MILESTONE_ID, body: 'thanks' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('the publisher of the milestone thanks the cloner → 200 + one row written', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: PUBLISHER_ID } } });
    happyPathTables({
      milestoneRow: {
        id: MILESTONE_ID,
        published_coach_id: PUBLISHER_ID,
        milestone_kind: 'stuck_1',
      },
      stickRow: {
        drill_share_id: DRILL_SHARE_ID,
        cloner_coach_id: CLONER_ID,
      },
      existingMessageRow: null,
      insertedRow: { id: 'new-msg-1' },
    });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({
        milestoneId: MILESTONE_ID,
        body: 'thanks for running my closeout drill',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message_id: string };
    expect(body.ok).toBe(true);
    expect(body.message_id).toBe('new-msg-1');
  });

  it('a coach who is NOT the publisher attempts to thank → 404', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: CLONER_ID } } });
    happyPathTables({
      milestoneRow: {
        id: MILESTONE_ID,
        published_coach_id: PUBLISHER_ID,
        milestone_kind: 'stuck_1',
      },
    });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({
        milestoneId: MILESTONE_ID,
        body: 'hello',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('the body is empty → 400 body_empty_or_too_long', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: PUBLISHER_ID } } });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({ milestoneId: MILESTONE_ID, body: '   ' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('body_empty_or_too_long');
  });

  it('the body is 281 chars → 400 body_empty_or_too_long', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: PUBLISHER_ID } } });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({
        milestoneId: MILESTONE_ID,
        body: 'a'.repeat(281),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('body_empty_or_too_long');
  });

  it('the body contains an email-shape → 400 body_contains_email (defensive anti-email-leak)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: PUBLISHER_ID } } });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({
        milestoneId: MILESTONE_ID,
        body: 'reach me at coach@example.com',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('body_contains_email');
  });

  it('re-tap on the same milestone → silent success, same row id, no second row written', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: PUBLISHER_ID } } });
    const insertCalls: unknown[] = [];
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_reputation_milestones') {
        return chainOf({
          id: MILESTONE_ID,
          published_coach_id: PUBLISHER_ID,
          milestone_kind: 'stuck_1',
        });
      }
      if (table === 'drill_shares') {
        return chainOf([{ id: DRILL_SHARE_ID }]);
      }
      if (table === 'drill_clone_stick_signals') {
        return chainOf({
          drill_share_id: DRILL_SHARE_ID,
          cloner_coach_id: CLONER_ID,
        });
      }
      if (table === 'coach_thank_messages') {
        const existing = { id: 'existing-msg-1' };
        const chain = chainOf(existing);
        chain.insert = vi.fn().mockImplementation((args: unknown) => {
          insertCalls.push(args);
          return {
            select: vi.fn().mockReturnThis(),
            single: vi
              .fn()
              .mockResolvedValue({ data: existing, error: null }),
          };
        });
        return chain;
      }
      throw new Error(`Unexpected from(${table})`);
    });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({
        milestoneId: MILESTONE_ID,
        body: 'thanks again',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message_id: string };
    expect(body.ok).toBe(true);
    expect(body.message_id).toBe('existing-msg-1');
    expect(insertCalls.length).toBe(0);
  });

  it('the response payload NEVER contains the recipient email or surname', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: PUBLISHER_ID } } });
    happyPathTables({
      milestoneRow: {
        id: MILESTONE_ID,
        published_coach_id: PUBLISHER_ID,
        milestone_kind: 'stuck_1',
      },
      stickRow: {
        drill_share_id: DRILL_SHARE_ID,
        cloner_coach_id: CLONER_ID,
      },
      existingMessageRow: null,
      insertedRow: { id: 'new-msg-1' },
    });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({
        milestoneId: MILESTONE_ID,
        body: 'thanks',
      }),
    });
    const res = await POST(req);
    const json = JSON.stringify(await res.json());
    expect(json).not.toMatch(/parent_email/);
    expect(json).not.toMatch(/full_name/);
    expect(json).not.toMatch(/@/);
  });

  it('NEVER reads players / observations / parent_email (no kid data leaks)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: PUBLISHER_ID } } });
    happyPathTables({
      milestoneRow: {
        id: MILESTONE_ID,
        published_coach_id: PUBLISHER_ID,
        milestone_kind: 'stuck_1',
      },
      stickRow: {
        drill_share_id: DRILL_SHARE_ID,
        cloner_coach_id: CLONER_ID,
      },
      existingMessageRow: null,
      insertedRow: { id: 'new-msg-1' },
    });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({
        milestoneId: MILESTONE_ID,
        body: 'thanks',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const tablesRead = mockFromFn.mock.calls.map((c) => c[0]);
    expect(tablesRead).not.toContain('players');
    expect(tablesRead).not.toContain('observations');
    expect(tablesRead).not.toContain('parent_shares');
    // The whitelisted tables only. `drill_shares` is coach-level (no
    // minor data); the route reads it to scope the stick lookup by
    // publisher.
    for (const t of tablesRead) {
      expect([
        'coach_reputation_milestones',
        'drill_shares',
        'drill_clone_stick_signals',
        'coach_thank_messages',
      ]).toContain(t);
    }
  });

  it('the milestone attached to a plan_share routes through the plan_share_id branch successfully', async () => {
    const PLAN_SHARE_ID = '00000000-0000-4000-a000-0000000000c1';
    mockGetUser.mockResolvedValue({ data: { user: { id: PUBLISHER_ID } } });
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_reputation_milestones') {
        return chainOf({
          id: MILESTONE_ID,
          published_coach_id: PUBLISHER_ID,
          milestone_kind: 'stuck_1',
        });
      }
      // Drill branch — empty so the route falls back to the
      // plan-share path.
      if (table === 'drill_shares') {
        return chainOf([]);
      }
      if (table === 'drill_clone_stick_signals') {
        return chainOf(null);
      }
      if (table === 'practice_plan_shares') {
        return chainOf({
          id: PLAN_SHARE_ID,
          coach_id: PUBLISHER_ID,
          plan_id: 'pid',
        });
      }
      if (table === 'plans') {
        // The route looks up plan clones to find the cloner of the
        // publisher's plan.
        return chainOf([
          { coach_id: CLONER_ID, source_plan_id: 'pid' },
        ]);
      }
      if (table === 'coach_thank_messages') {
        const inserted = { id: 'new-msg-plan-1' };
        const chain = chainOf(null);
        chain.insert = vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: inserted, error: null }),
        }));
        return chain;
      }
      throw new Error(`Unexpected from(${table})`);
    });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({
        milestoneId: MILESTONE_ID,
        body: 'thanks for running my plan',
        planShareId: PLAN_SHARE_ID,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('the route works for free-tier coaches AND paid-tier coaches identically (no feature gate)', async () => {
    // The route itself reads NO tier signal; we assert that by ensuring
    // it never reads the `organizations` table for a tier lookup, AND
    // it does not check the caller's tier in any way that could 403 a
    // free coach. The happy path test (above) returns 200 regardless;
    // the assertion here is the negative — the read whitelist excludes
    // the tier-bearing tables.
    mockGetUser.mockResolvedValue({ data: { user: { id: PUBLISHER_ID } } });
    happyPathTables({
      milestoneRow: {
        id: MILESTONE_ID,
        published_coach_id: PUBLISHER_ID,
        milestone_kind: 'stuck_1',
      },
      stickRow: {
        drill_share_id: DRILL_SHARE_ID,
        cloner_coach_id: CLONER_ID,
      },
      existingMessageRow: null,
      insertedRow: { id: 'new-msg-1' },
    });
    const req = new Request('http://t/api/coach/thank-cloner', {
      method: 'POST',
      body: JSON.stringify({
        milestoneId: MILESTONE_ID,
        body: 'thanks',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const tablesRead = mockFromFn.mock.calls.map((c) => c[0]);
    expect(tablesRead).not.toContain('organizations');
    expect(tablesRead).not.toContain('coaches');
  });
});
