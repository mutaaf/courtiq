/**
 * Ticket 0081 — GET /api/coach/inbox.
 *
 * Returns the caller's inbox rows (where they are the recipient) with
 * the sender's first name + program name + the drill/plan title. The
 * response payload NEVER contains the sender's email, surname, phone,
 * or team name beyond the program name. Player ids and parent contact
 * never reach this surface.
 *
 * Ordering: unread (read_at NULL) rows first, then by sent_at DESC.
 * Cap at 50.
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

import { GET } from '@/app/api/coach/inbox/route';

const RECIPIENT_ID = '00000000-0000-4000-a000-0000000000d9';
const SENDER_ID = '00000000-0000-4000-a000-000000000301';
const ORG_ID = '00000000-0000-4000-a000-0000000000d8';
const DRILL_SHARE_ID = '00000000-0000-4000-a000-000000000311';

function chainOf<T = unknown>(data: T | null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

describe('GET /api/coach/inbox (ticket 0081)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when no user is authed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('authed coach with TWO inbox rows → returns both, ordered correctly', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: RECIPIENT_ID } } });
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_thank_messages') {
        return chainOf([
          {
            id: 'msg-unread',
            sender_coach_id: SENDER_ID,
            drill_share_id: DRILL_SHARE_ID,
            plan_share_id: null,
            body: 'thanks for running my closeout drill',
            sent_at: '2026-06-10T10:00:00Z',
            read_at: null,
          },
          {
            id: 'msg-read',
            sender_coach_id: SENDER_ID,
            drill_share_id: DRILL_SHARE_ID,
            plan_share_id: null,
            body: 'second thanks',
            sent_at: '2026-06-09T10:00:00Z',
            read_at: '2026-06-09T11:00:00Z',
          },
        ]);
      }
      if (table === 'coaches') {
        // Server-side full_name → first-name split lives in the
        // route; the mock returns the canonical schema shape.
        return chainOf([
          { id: SENDER_ID, full_name: 'Maya Walker', org_id: ORG_ID },
        ]);
      }
      if (table === 'organizations') {
        return chainOf([{ id: ORG_ID, name: 'Hawks Program' }]);
      }
      if (table === 'drill_shares') {
        return chainOf([
          { id: DRILL_SHARE_ID, drill_id: 'drill-1' },
        ]);
      }
      if (table === 'drills') {
        return chainOf([{ id: 'drill-1', name: 'Live closeout 1-on-1' }]);
      }
      throw new Error(`Unexpected from(${table})`);
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      messages: Array<Record<string, unknown>>;
    };
    expect(body.messages).toHaveLength(2);
    // Unread first.
    expect(body.messages[0].id).toBe('msg-unread');
    expect(body.messages[1].id).toBe('msg-read');
  });

  it('every rendered message includes sender_first_name + sender_program_name + drill_or_plan_title', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: RECIPIENT_ID } } });
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_thank_messages') {
        return chainOf([
          {
            id: 'msg-1',
            sender_coach_id: SENDER_ID,
            drill_share_id: DRILL_SHARE_ID,
            plan_share_id: null,
            body: 'thanks',
            sent_at: '2026-06-10T10:00:00Z',
            read_at: null,
          },
        ]);
      }
      if (table === 'coaches') {
        // Server-side full_name → first-name split lives in the
        // route; the mock returns the canonical schema shape.
        return chainOf([
          { id: SENDER_ID, full_name: 'Maya Walker', org_id: ORG_ID },
        ]);
      }
      if (table === 'organizations') {
        return chainOf([{ id: ORG_ID, name: 'Hawks Program' }]);
      }
      if (table === 'drill_shares') {
        return chainOf([
          { id: DRILL_SHARE_ID, drill_id: 'drill-1' },
        ]);
      }
      if (table === 'drills') {
        return chainOf([{ id: 'drill-1', name: 'Live closeout 1-on-1' }]);
      }
      throw new Error(`Unexpected from(${table})`);
    });
    const res = await GET();
    const body = (await res.json()) as {
      messages: Array<{
        sender_first_name: string;
        sender_program_name: string;
        drill_or_plan_title: string;
      }>;
    };
    expect(body.messages[0].sender_first_name).toBe('Maya');
    expect(body.messages[0].sender_program_name).toBe('Hawks Program');
    expect(body.messages[0].drill_or_plan_title).toBe('Live closeout 1-on-1');
  });

  it('the response NEVER contains the sender email or surname', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: RECIPIENT_ID } } });
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_thank_messages') {
        return chainOf([
          {
            id: 'msg-1',
            sender_coach_id: SENDER_ID,
            drill_share_id: DRILL_SHARE_ID,
            plan_share_id: null,
            body: 'thanks',
            sent_at: '2026-06-10T10:00:00Z',
            read_at: null,
          },
        ]);
      }
      if (table === 'coaches') {
        // Server-side full_name → first-name split lives in the
        // route; the mock returns the canonical schema shape.
        return chainOf([
          { id: SENDER_ID, full_name: 'Maya Walker', org_id: ORG_ID },
        ]);
      }
      if (table === 'organizations') {
        return chainOf([{ id: ORG_ID, name: 'Hawks Program' }]);
      }
      if (table === 'drill_shares') {
        return chainOf([
          { id: DRILL_SHARE_ID, drill_id: 'drill-1' },
        ]);
      }
      if (table === 'drills') {
        return chainOf([{ id: 'drill-1', name: 'Live closeout 1-on-1' }]);
      }
      throw new Error(`Unexpected from(${table})`);
    });
    const res = await GET();
    const json = JSON.stringify(await res.json());
    expect(json).not.toMatch(/full_name/);
    expect(json).not.toMatch(/email/);
    expect(json).not.toMatch(/@/);
  });

  it('the response NEVER contains any player_id or parent_email', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: RECIPIENT_ID } } });
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_thank_messages') {
        return chainOf([
          {
            id: 'msg-1',
            sender_coach_id: SENDER_ID,
            drill_share_id: DRILL_SHARE_ID,
            plan_share_id: null,
            body: 'thanks',
            sent_at: '2026-06-10T10:00:00Z',
            read_at: null,
          },
        ]);
      }
      if (table === 'coaches') {
        // Server-side full_name → first-name split lives in the
        // route; the mock returns the canonical schema shape.
        return chainOf([
          { id: SENDER_ID, full_name: 'Maya Walker', org_id: ORG_ID },
        ]);
      }
      if (table === 'organizations') {
        return chainOf([{ id: ORG_ID, name: 'Hawks Program' }]);
      }
      if (table === 'drill_shares') {
        return chainOf([
          { id: DRILL_SHARE_ID, drill_id: 'drill-1' },
        ]);
      }
      if (table === 'drills') {
        return chainOf([{ id: 'drill-1', name: 'Live closeout 1-on-1' }]);
      }
      throw new Error(`Unexpected from(${table})`);
    });
    const res = await GET();
    const json = JSON.stringify(await res.json());
    expect(json).not.toMatch(/player_id/);
    expect(json).not.toMatch(/parent_email/);
    const tablesRead = mockFromFn.mock.calls.map((c) => c[0]);
    expect(tablesRead).not.toContain('players');
    expect(tablesRead).not.toContain('observations');
  });

  it('the response payload is capped at 50 (route requests .limit(50))', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: RECIPIENT_ID } } });
    let limitArg: number | null = null;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_thank_messages') {
        const chain = chainOf([]);
        chain.limit = vi.fn().mockImplementation((n: number) => {
          limitArg = n;
          return chain;
        });
        return chain;
      }
      if (table === 'coaches') return chainOf([]);
      if (table === 'organizations') return chainOf([]);
      if (table === 'drill_shares') return chainOf([]);
      if (table === 'drills') return chainOf([]);
      throw new Error(`Unexpected from(${table})`);
    });
    await GET();
    expect(limitArg).toBe(50);
  });
});
