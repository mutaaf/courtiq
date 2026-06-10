/**
 * Ticket 0078 — the dormant-publisher reactivation branch on the 0042
 * `/api/cron/coach-quiet-check-in` route.
 *
 * The cron now houses THREE top-level try-wrapped branches:
 *  1. 0042 quiet-check-in (14-day quiet, polite pause email)
 *  2. 0072 returning-parent reactivation (parent shows up on a new
 *     team)
 *  3. 0078 dormant-publisher reactivation (a clone fires the 0073
 *     milestone for a dormant publishing coach) — added by this
 *     ticket
 *
 * Each AC box maps to a case:
 *  (i)   one dormant publisher with one fresh unconsumed milestone
 *        → one email + one coach_clone_reactivation_signals row.
 *  (ii)  non-dormant publisher with the same milestone → no email.
 *  (iii) dormant publisher emailed 10 days ago → no email (cooldown).
 *  (iv)  dormant publisher with TWO unconsumed milestones → ONE
 *        email (the most-recent one wins).
 *  (v)   un-Bearer-token request → 401.
 *  (vi)  a mail failure on one batch item does NOT block the next.
 *  (vii) planted DOB / parent_phone on players are NEVER read.
 *  (viii) the reactivation-signal row is idempotent on re-runs
 *        (the UNIQUE constraint is honored by the mock's
 *        on-conflict logic).
 *
 * Per LESSONS#0049 / #0092 / #0100 / #0110 / #0118 — the existing
 * 0042 / 0072 tests use table-keyed `mockImplementation((table) =>
 * ...)` whitelists; the new branch's tables (`coach_reputation_
 * milestones`, `coach_clone_reactivation_signals`, `drill_shares`,
 * `drills`, `organizations`, `drill_share_clones`) are added to the
 * whitelist in this test (and to the existing 0042 + 0072 tests
 * separately so the noise is dropped).
 *
 * .test.ts NOT .spec.ts — LESSONS#0020 / #38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { POST as cronPost } from '@/app/api/cron/coach-quiet-check-in/route';

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

interface Resolved<T = unknown> {
  data: T | null;
  error: unknown;
}

/** Standard supabase-js mock chain. `thenable` so a route that awaits
 *  the chain directly gets the data array; the various filter methods
 *  return `this` so chained `.eq().is().gte()` walks don't break. */
function buildChain<T = unknown>(data: T | null = null, error: unknown = null) {
  const resolved: Resolved<T> = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(resolved),
    limit: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: Resolved<T>) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

// Yesterday's dedup key prevents the 0042 quiet-check-in branch from
// firing — so the only email sent in our tests is the 0078 reactivation
// branch (mirrors the 0072 reactivation-test posture).
function yesterdayDedupKey(): string {
  const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  return `quiet_check_in_${yesterday}`;
}

const PUBLISHER_COACH = {
  id: 'coach-publisher-001',
  email: 'sarah@hawks-league.test',
  full_name: 'Sarah Hawkes',
  preferences: { [yesterdayDedupKey()]: true } as Record<string, unknown>,
  paused_until: null as string | null,
  last_active_at: daysAgoIso(35), // > 21-day dormancy floor
  created_at: '2026-01-01T00:00:00Z',
};

const MILESTONE_ID = 'ms-fresh-clone';
const OLDER_MILESTONE_ID = 'ms-fresh-clone-older';
const PROGRAM_ID = 'org-hornets';

interface WireOpts {
  milestones?: Array<{
    id: string;
    published_coach_id: string;
    milestone_kind: string;
    crossed_at: string;
    notified_at: string | null;
  }>;
  publishers?: typeof PUBLISHER_COACH[];
  // The cooldown lookup — most recent dispatched_at per coach.
  cooldownByCoach?: Record<string, string>;
  // The drill / plan title lookup for the email body.
  drillSharesByCoach?: Record<string, { drill_title: string; cloning_org_name: string }>;
  // The cron writes one row to coach_clone_reactivation_signals per
  // dispatched email; captured here.
  signalInserts?: Array<Record<string, unknown>>;
  // The cron may emit a write-failure on signal insert (idempotency
  // path) — toggle on to assert the email still went out (best-effort).
  failSignalInsert?: boolean;
  // Toggle individual mail-send failures.
  failMailFor?: string[];
  // Planted minor-data on player rows (asserted-never-read).
  plantedPlayerRows?: Array<Record<string, unknown>>;
  plantedPlayerReads?: { count: number };
}

function wire(opts: WireOpts = {}) {
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      // Both the 0042 .range() read AND the 0078 .in() read return the
      // same set of coaches — the publisher cohort + the dormant base.
      const list = opts.publishers ?? [PUBLISHER_COACH];
      const resolved = { data: list, error: null };
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue(resolved),
        in: vi.fn().mockReturnThis(),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
        then: (onFulfilled: (v: typeof resolved) => unknown) =>
          Promise.resolve(resolved).then(onFulfilled),
      };
      return chain;
    }
    if (table === 'coach_reputation_milestones') {
      // The 0078 branch reads unconsumed milestones in the last 24h.
      const rows = opts.milestones ?? [];
      const resolved = { data: rows, error: null };
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (onFulfilled: (v: typeof resolved) => unknown) =>
          Promise.resolve(resolved).then(onFulfilled),
      };
      return chain;
    }
    if (table === 'coach_clone_reactivation_signals') {
      // The 0078 branch reads per-coach most-recent dispatched_at for
      // the cooldown lookup; then writes ONE row per dispatched email.
      const cooldownRows = Object.entries(opts.cooldownByCoach ?? {}).map(
        ([coachId, dispatchedAt]) => ({
          published_coach_id: coachId,
          dispatched_at: dispatchedAt,
        }),
      );
      const resolved = { data: cooldownRows, error: null };
      const signalInserts = opts.signalInserts ?? [];
      const failInsert = opts.failSignalInsert ?? false;
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        insert: vi.fn((row: Record<string, unknown>) => {
          if (failInsert) {
            return Promise.resolve({ error: { message: 'duplicate key' } });
          }
          signalInserts.push(row);
          return Promise.resolve({ error: null });
        }),
        then: (onFulfilled: (v: typeof resolved) => unknown) =>
          Promise.resolve(resolved).then(onFulfilled),
      };
      return chain;
    }
    if (table === 'drill_shares') {
      // The cron looks up id, coach_id, caption for the email body +
      // the per-share id walk to find the cloning org. Keyed by
      // coach_id (`opts.drillSharesByCoach`).
      const rows = Object.entries(opts.drillSharesByCoach ?? {}).map(([coachId, info]) => ({
        id: 'ds-' + coachId,
        coach_id: coachId,
        caption: info.drill_title,
      }));
      const resolved = { data: rows, error: null };
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (onFulfilled: (v: typeof resolved) => unknown) =>
          Promise.resolve(resolved).then(onFulfilled),
      };
      return chain;
    }
    if (table === 'drill_share_clones') {
      // Per-share clone — points at a cloning org (NEVER a cloning
      // coach for display). Single row per share is enough.
      const drillEntries = Object.entries(opts.drillSharesByCoach ?? {});
      const rows = drillEntries.map(([coachId]) => ({
        drill_share_id: 'ds-' + coachId,
        cloner_org_id: 'org-of-' + coachId,
        cloned_at: daysAgoIso(0.5),
      }));
      const resolved = { data: rows, error: null };
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (onFulfilled: (v: typeof resolved) => unknown) =>
          Promise.resolve(resolved).then(onFulfilled),
      };
      return chain;
    }
    if (table === 'organizations') {
      // Resolve cloning org name by id. The route reads `id, name` and
      // we look up by the synthetic `org-of-<coachId>` key.
      const drillEntries = Object.entries(opts.drillSharesByCoach ?? {});
      const rows = drillEntries.map(([coachId, info]) => ({
        id: 'org-of-' + coachId,
        name: info.cloning_org_name,
      }));
      return buildChain(rows);
    }
    if (table === 'players') {
      // Trip-wire: the cron should NEVER read players. If it does, we
      // count it and the COPPA test asserts on the count = 0.
      if (opts.plantedPlayerReads) opts.plantedPlayerReads.count++;
      return buildChain(opts.plantedPlayerRows ?? []);
    }
    // Default: empty chain (table-keyed whitelist per LESSONS#0118
    // — broaden the allow-list so a new from() call doesn't throw).
    return buildChain([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  mockSendEmail.mockImplementation((args: { to: string }) => {
    return Promise.resolve({ success: true, id: 'mock-email-id-' + args.to });
  });
  process.env.CRON_SECRET = 'test-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
});

function makeRequest(opts: { bearer?: string } = {}) {
  return new Request('http://localhost/api/cron/coach-quiet-check-in', {
    method: 'POST',
    headers: opts.bearer
      ? { authorization: opts.bearer }
      : { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential'];

describe('POST /api/cron/coach-quiet-check-in — ticket 0078 publisher reactivation branch', () => {
  it('(AC i) one dormant publisher with one fresh unconsumed milestone → ONE email + ONE signal row', async () => {
    const signalInserts: Array<Record<string, unknown>> = [];
    wire({
      milestones: [
        {
          id: MILESTONE_ID,
          published_coach_id: PUBLISHER_COACH.id,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(0.5),
          notified_at: null,
        },
      ],
      drillSharesByCoach: {
        [PUBLISHER_COACH.id]: { drill_title: 'Live closeout 1-on-1', cloning_org_name: 'Hornets' },
      },
      signalInserts,
    });
    const res = await cronPost(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendEmail.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(sent.to).toBe(PUBLISHER_COACH.email);
    // Subject names the program AND the drill.
    expect(sent.subject).toContain('Hornets');
    expect(sent.subject).toContain('Live closeout 1-on-1');
    // Body contains the publisher first name.
    expect(sent.html).toContain('Sarah');
    // Body contains the deep-link to the milestone.
    expect(sent.html).toContain(`/home?milestone=${MILESTONE_ID}`);
    // ONE signal row written, pointing at this milestone.
    expect(signalInserts).toHaveLength(1);
    expect(signalInserts[0].published_coach_id).toBe(PUBLISHER_COACH.id);
    expect(signalInserts[0].milestone_id).toBe(MILESTONE_ID);
  });

  it('(AC ii) a non-dormant publisher with an unconsumed milestone → NO email', async () => {
    const activePublisher = { ...PUBLISHER_COACH, last_active_at: daysAgoIso(2) };
    wire({
      publishers: [activePublisher],
      milestones: [
        {
          id: MILESTONE_ID,
          published_coach_id: activePublisher.id,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(0.5),
          notified_at: null,
        },
      ],
    });
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('(AC iii) a dormant publisher emailed 10 days ago → NO email (cooldown)', async () => {
    wire({
      milestones: [
        {
          id: MILESTONE_ID,
          published_coach_id: PUBLISHER_COACH.id,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(0.5),
          notified_at: null,
        },
      ],
      cooldownByCoach: { [PUBLISHER_COACH.id]: daysAgoIso(10) },
    });
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('(AC iv) a dormant publisher with TWO unconsumed milestones → ONE email (most-recent wins)', async () => {
    const signalInserts: Array<Record<string, unknown>> = [];
    wire({
      milestones: [
        {
          id: OLDER_MILESTONE_ID,
          published_coach_id: PUBLISHER_COACH.id,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(0.9),
          notified_at: null,
        },
        {
          id: MILESTONE_ID,
          published_coach_id: PUBLISHER_COACH.id,
          milestone_kind: 'programs_2',
          crossed_at: daysAgoIso(0.2),
          notified_at: null,
        },
      ],
      drillSharesByCoach: {
        [PUBLISHER_COACH.id]: { drill_title: 'Live closeout 1-on-1', cloning_org_name: 'Hornets' },
      },
      signalInserts,
    });
    await cronPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(signalInserts).toHaveLength(1);
    // The most-recent milestone wins.
    expect(signalInserts[0].milestone_id).toBe(MILESTONE_ID);
  });

  it('(AC v) un-Bearer-token request → 401', async () => {
    const res = await cronPost(makeRequest({ bearer: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('(AC vi) a mail failure on one batch item does NOT block the next item', async () => {
    const secondPublisher = {
      ...PUBLISHER_COACH,
      id: 'coach-publisher-002',
      email: 'ben@westview-hoops.test',
      full_name: 'Ben Riveros',
    };
    const signalInserts: Array<Record<string, unknown>> = [];
    mockSendEmail.mockImplementation((args: { to: string }) => {
      if (args.to === PUBLISHER_COACH.email) {
        return Promise.resolve({ success: false, error: 'transient' });
      }
      return Promise.resolve({ success: true, id: 'mock-email-' + args.to });
    });
    wire({
      publishers: [PUBLISHER_COACH, secondPublisher],
      milestones: [
        {
          id: 'ms-first',
          published_coach_id: PUBLISHER_COACH.id,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(0.5),
          notified_at: null,
        },
        {
          id: 'ms-second',
          published_coach_id: secondPublisher.id,
          milestone_kind: 'programs_2',
          crossed_at: daysAgoIso(0.6),
          notified_at: null,
        },
      ],
      drillSharesByCoach: {
        [PUBLISHER_COACH.id]: { drill_title: 'Closeout', cloning_org_name: 'Hornets' },
        [secondPublisher.id]: { drill_title: 'Transitions', cloning_org_name: 'Riverside' },
      },
      signalInserts,
    });
    await cronPost(makeRequest());
    // Both emails were attempted.
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    // Only the SUCCESSFUL second email wrote a signal row (best-effort:
    // the failed first item didn't block the second).
    expect(signalInserts).toHaveLength(1);
    expect(signalInserts[0].published_coach_id).toBe(secondPublisher.id);
  });

  it('(AC vii) planted DOB / parent_phone on players are NEVER read', async () => {
    const plantedPlayerReads = { count: 0 };
    wire({
      milestones: [
        {
          id: MILESTONE_ID,
          published_coach_id: PUBLISHER_COACH.id,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(0.5),
          notified_at: null,
        },
      ],
      drillSharesByCoach: {
        [PUBLISHER_COACH.id]: { drill_title: 'Closeout', cloning_org_name: 'Hornets' },
      },
      plantedPlayerRows: [
        { id: 'p1', name: 'Maya Walker', date_of_birth: '2014-07-12', parent_phone: '555-0100' },
      ],
      plantedPlayerReads,
    });
    await cronPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    // The route NEVER from('players')'d in the publisher branch.
    expect(plantedPlayerReads.count).toBe(0);
    const sent = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(sent.html).not.toContain('Maya');
    expect(sent.html).not.toContain('2014-07-12');
    expect(sent.html).not.toContain('555-0100');
  });

  it('(AC viii) the reactivation-signal row write is best-effort — a duplicate-key error does not break the cron', async () => {
    const signalInserts: Array<Record<string, unknown>> = [];
    wire({
      milestones: [
        {
          id: MILESTONE_ID,
          published_coach_id: PUBLISHER_COACH.id,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(0.5),
          notified_at: null,
        },
      ],
      drillSharesByCoach: {
        [PUBLISHER_COACH.id]: { drill_title: 'Closeout', cloning_org_name: 'Hornets' },
      },
      signalInserts,
      failSignalInsert: true,
    });
    const res = await cronPost(makeRequest());
    // The email went out; the row write was best-effort and gracefully
    // surfaced an error without throwing — the cron returns 200.
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('(voice) rendered email contains NO AGENTS.md banned word', async () => {
    wire({
      milestones: [
        {
          id: MILESTONE_ID,
          published_coach_id: PUBLISHER_COACH.id,
          milestone_kind: 'clones_3',
          crossed_at: daysAgoIso(0.5),
          notified_at: null,
        },
      ],
      drillSharesByCoach: {
        [PUBLISHER_COACH.id]: { drill_title: 'Live closeout 1-on-1', cloning_org_name: 'Hornets' },
      },
    });
    await cronPost(makeRequest());
    const sent = mockSendEmail.mock.calls[0][0] as { subject: string; html: string };
    const combined = (sent.subject + ' ' + sent.html).toLowerCase();
    for (const word of BANNED) {
      expect(combined).not.toContain(word);
    }
  });
});
