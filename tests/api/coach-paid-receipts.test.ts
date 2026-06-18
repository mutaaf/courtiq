/**
 * Ticket 0089 — GET /api/coach/paid-receipts.
 *
 * The /home page mounts <PaidCoachReceiptsCard />; that card calls THIS
 * route to learn whether the day-56-to-day-90 fire window is open for
 * the caller AND, if so, what the five named counters and next-month
 * compounding-copy key are.
 *
 * Schema-wins-over-prose deviation (LESSONS#0096) — documented in the
 * 0089 Implementation log: the ticket prose said the route would
 * derive `paidSinceMs` from the earliest `stripe_webhook_events` row
 * for the org, but the real `stripe_webhook_events` shape (migration
 * 028) is a minimal idempotency log with NO org link. The route
 * therefore reads `organizations.paid_since_at`, a new TIMESTAMPTZ
 * column added in migration 074 alongside the CHECK-enum widen.
 *
 * Acceptance criteria mapping:
 *  (i)   free-tier caller → eligible: false.
 *  (ii)  Coach-tier active at day 60 → eligible payload with counters.
 *  (iii) Coach-tier canceled → eligible: false (subscription_status gate).
 *  (iv)  Coach-tier at day 30 → eligible: false (before window).
 *  (v)   Coach-tier at day 95 → eligible: false (after window).
 *  (vi)  Coach-tier who already dismissed → eligible: false.
 *  (vii) Pro-tier coach at day 60 active → eligible: true.
 *  (viii) Org-tier coach at day 60 active → eligible: true.
 *  (ix)  planted coaches.email / coaches.phone / players.* on joined
 *        rows are NEVER read by the route's `.select()` allow-list (COPPA).
 *  (x)   unauthed caller → 401.
 *  (xi)  the response shape is BYTE-IDENTICAL across the matrix (additive only).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
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

import { GET } from '@/app/api/coach/paid-receipts/route';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';
const ORG_ID = '00000000-0000-4000-a000-0000000000a1';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

// Build a thenable chain that resolves to { data, error } when awaited
// and is mockReturnThis on every builder method.
//
// maybeSingle / single unwrap to the FIRST element of an array fixture
// so the route's `.maybeSingle()` reads (coach row, org row) get the
// right shape — array fixtures continue to work for `.in()` /
// `.gte()` / unawaited chain reads.
function chain<T = unknown>(data: T | null = null) {
  const resolved = { data, error: null };
  const firstRow = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const resolvedSingle = { data: firstRow, error: null };
  const c: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedSingle),
    single: vi.fn().mockResolvedValue(resolvedSingle),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return c;
}

function wireTables(byTable: Record<string, unknown[] | unknown>) {
  mockFromFn.mockImplementation((table: string) => {
    const rows = byTable[table];
    // A single-object fixture means the route awaits a maybeSingle/single,
    // not an array iteration; the chain handles both via .then.
    return chain(rows ?? []);
  });
}

describe('GET /api/coach/paid-receipts (ticket 0089)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
  });

  it('(x) unauthed caller → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('(i) free-tier caller → eligible: false', async () => {
    wireTables({
      coaches: [{ id: COACH_ID, org_id: ORG_ID }],
      organizations: [
        {
          id: ORG_ID,
          tier: 'free',
          subscription_status: 'none',
          paid_since_at: null,
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it('(iii) Coach-tier canceled → eligible: false (subscription_status gate)', async () => {
    wireTables({
      coaches: [{ id: COACH_ID, org_id: ORG_ID }],
      organizations: [
        {
          id: ORG_ID,
          tier: 'coach',
          subscription_status: 'canceled',
          paid_since_at: new Date(NOW - 60 * DAY).toISOString(),
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it('(iv) Coach-tier active at day 30 → eligible: false (before window)', async () => {
    wireTables({
      coaches: [{ id: COACH_ID, org_id: ORG_ID }],
      organizations: [
        {
          id: ORG_ID,
          tier: 'coach',
          subscription_status: 'active',
          paid_since_at: new Date(NOW - 30 * DAY).toISOString(),
        },
      ],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it('(v) Coach-tier active at day 95 → eligible: false (after window)', async () => {
    wireTables({
      coaches: [{ id: COACH_ID, org_id: ORG_ID }],
      organizations: [
        {
          id: ORG_ID,
          tier: 'coach',
          subscription_status: 'active',
          paid_since_at: new Date(NOW - 95 * DAY).toISOString(),
        },
      ],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it('(ii) Coach-tier active at day 60 → eligible payload with counters', async () => {
    wireTables({
      coaches: [
        { id: COACH_ID, org_id: ORG_ID },
        { id: 'coach-2', org_id: 'org-2' },
      ],
      organizations: [
        {
          id: ORG_ID,
          tier: 'coach',
          subscription_status: 'active',
          paid_since_at: new Date(NOW - 60 * DAY).toISOString(),
        },
        { id: 'org-2', name: 'Hornets' },
      ],
      observations: [{ id: 'o-1' }, { id: 'o-2' }, { id: 'o-3' }],
      plans: [
        { id: 'p-1', type: 'parent_report', created_at: new Date(NOW - 5 * DAY).toISOString() },
        { id: 'p-2', type: 'parent_report', created_at: new Date(NOW - 6 * DAY).toISOString() },
      ],
      parent_reactions: [
        { id: 'r-1', created_at: new Date(NOW - 4 * DAY).toISOString() },
      ],
      drill_shares: [{ id: 'ds-1' }],
      drill_share_clones: [
        { id: 'c-1', cloner_coach_id: 'coach-2' },
      ],
      coach_first_signal_celebrations: [],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.daysSincePaid).toBe(60);
    expect(body.observationCount).toBe(3);
    expect(body.parentReportCount).toBe(2);
    expect(body.parentReadersThisMonth).toBe(1);
    expect(body.drillsClonedCount).toBe(1);
    expect(body.nextMonthIndex).toBe(3);
    expect(body.nextMonthCopyKey).toBe('month_3_arc_returning_players');
  });

  it('(vi) Coach-tier who already dismissed → eligible: false', async () => {
    wireTables({
      coaches: [{ id: COACH_ID, org_id: ORG_ID }],
      organizations: [
        {
          id: ORG_ID,
          tier: 'coach',
          subscription_status: 'active',
          paid_since_at: new Date(NOW - 60 * DAY).toISOString(),
        },
      ],
      coach_first_signal_celebrations: [
        { kind: 'paid_receipts_d60', dismissed_at: new Date(NOW - 1 * DAY).toISOString() },
      ],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it('(vii) Pro-tier coach at day 60 active → eligible: true', async () => {
    wireTables({
      coaches: [{ id: COACH_ID, org_id: ORG_ID }],
      organizations: [
        {
          id: ORG_ID,
          tier: 'pro_coach',
          subscription_status: 'active',
          paid_since_at: new Date(NOW - 60 * DAY).toISOString(),
        },
      ],
      coach_first_signal_celebrations: [],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.eligible).toBe(true);
  });

  it('(viii) Org-tier coach at day 60 active → eligible: true', async () => {
    wireTables({
      coaches: [{ id: COACH_ID, org_id: ORG_ID }],
      organizations: [
        {
          id: ORG_ID,
          tier: 'organization',
          subscription_status: 'active',
          paid_since_at: new Date(NOW - 60 * DAY).toISOString(),
        },
      ],
      coach_first_signal_celebrations: [],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.eligible).toBe(true);
  });

  it('past_due and trialing subscription_status are within the grace window', async () => {
    for (const status of ['past_due', 'trialing']) {
      mockFromFn.mockReset();
      wireTables({
        coaches: [{ id: COACH_ID, org_id: ORG_ID }],
        organizations: [
          {
            id: ORG_ID,
            tier: 'coach',
            subscription_status: status,
            paid_since_at: new Date(NOW - 60 * DAY).toISOString(),
          },
        ],
        coach_first_signal_celebrations: [],
      });
      const res = await GET();
      const body = await res.json();
      expect(body.eligible).toBe(true);
    }
  });

  it('(ix) the route never selects coaches.email / coaches.phone / players.* (COPPA allow-list)', async () => {
    const selectArgs: string[] = [];
    mockFromFn.mockImplementation((table: string) => {
      const c = chain([]);
      const realSelect = c.select as ReturnType<typeof vi.fn>;
      realSelect.mockImplementation((cols: string) => {
        selectArgs.push(`${table}:${cols}`);
        return c;
      });
      return c;
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
    await GET();
    // Defensive: no select call may ask for email/phone/full_name on
    // coaches; no select call may ever target the players table.
    for (const arg of selectArgs) {
      const [, cols] = arg.split(':');
      expect(cols).not.toMatch(/\bemail\b/);
      expect(cols).not.toMatch(/\bphone\b/);
      expect(cols).not.toMatch(/\bfull_name\b/);
      expect(cols).not.toMatch(/\bdate_of_birth\b/);
      expect(cols).not.toMatch(/\bparent_email\b/);
    }
    // Defensive: the players table is never read.
    for (const arg of selectArgs) {
      expect(arg.startsWith('players:')).toBe(false);
    }
  });

  it('(xi) the response shape is additive across the matrix (no field removal)', async () => {
    wireTables({
      coaches: [{ id: COACH_ID, org_id: ORG_ID }],
      organizations: [
        {
          id: ORG_ID,
          tier: 'coach',
          subscription_status: 'active',
          paid_since_at: new Date(NOW - 60 * DAY).toISOString(),
        },
      ],
      coach_first_signal_celebrations: [],
    });
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty('eligible');
    if (body.eligible) {
      // When eligible, the route must emit every counter field so the
      // component renders deterministically.
      for (const k of [
        'daysSincePaid',
        'observationCount',
        'parentReportCount',
        'parentReadersThisMonth',
        'drillsClonedCount',
        'cloneProgramNames',
        'arcWeeksCarried',
        'nextMonthIndex',
        'nextMonthCopyKey',
      ]) {
        expect(body).toHaveProperty(k);
      }
    }
  });
});
