/**
 * Ticket 0041 — POST /api/cron/weekly-parent-rollup: Monday rollup of the
 * prior calendar week's parent reactions.
 *
 * Each acceptance-criteria box maps to one or more cases:
 *  (1) 401 on missing/wrong bearer; 200 + result shape on valid bearer; no DB
 *      writes on the 401 path.
 *  (2) Coach with >=1 reactions in the prior week gets ONE email; subject
 *      contains coach first name + week label; HTML body contains the top-3
 *      message bodies and the parent first names.
 *  (3) Coach with 0 reactions is skipped — no sendEmail call; totalSkipped++.
 *  (4) Opt-out via preferences.weekly_parent_rollup === false skips; unset /
 *      true sends.
 *  (5) Dedup: after a successful send, preferences.parent_rollup_week_<date> is
 *      set; a second run on the same fixture skips.
 *  (6) COPPA: planted player-name "ZZ-CHILD-MARKER" never appears in the HTML
 *      (the route's SELECT reads only reaction/message/parent_name/created_at).
 *  (7) Top-3 selection deterministic, ranked by created_at DESC over the
 *      non-null-message subset; if zero messages but >=1 reactions, send the
 *      count line + "no notes this week".
 *  (8) Regression: the weekly-digest dedup + opt-out keys on preferences stay
 *      byte-identical after a rollup run.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (reserved for
 * Playwright). See docs/LESSONS.md.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

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

import { POST as rollupPost } from '@/app/api/cron/weekly-parent-rollup/route';
import { getPriorWeekMonday, getWeekWindow } from '@/lib/weekly-digest-utils';

// ─── In-memory data store + chainable mock ────────────────────────────────────
//
// One mockFromFn for the whole suite that branches on table name and supports
// the chained calls the route uses (select, eq, gte, lte, order, range, update,
// then-as-thenable). Tests configure the store via setStore() before each case.

interface Coach {
  id: string;
  email: string;
  full_name: string;
  preferences: Record<string, unknown> | null;
  created_at: string;
}

interface Reaction {
  reaction: string;
  message: string | null;
  parent_name: string | null;
  created_at: string;
  coach_id: string;
  // Planted COPPA marker the route MUST NOT read (it'd require selecting
  // `players(name, nickname)`). The select-only-these-columns contract is
  // asserted by leaving the marker on the row but expecting it to never reach
  // the rendered HTML.
  players?: { name?: string; nickname?: string };
}

const store: {
  coaches: Coach[];
  reactions: Reaction[];
  // capture every preferences mutation so we can assert dedup/opt-out persistence
  prefsWrites: Array<{ coachId: string; preferences: Record<string, unknown> }>;
  selectColumnsCalled: string[];
} = {
  coaches: [],
  reactions: [],
  prefsWrites: [],
  selectColumnsCalled: [],
};

function clearStore() {
  store.coaches = [];
  store.reactions = [];
  store.prefsWrites = [];
  store.selectColumnsCalled = [];
}

function buildCoachesChain() {
  // Range-paged select; range(offset, end) resolves with the slice.
  let _ordered: Coach[] = [...store.coaches];
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn((col: string, opts?: { ascending: boolean }) => {
      _ordered = [..._ordered].sort((a, b) => {
        const av = String(a.created_at);
        const bv = String(b.created_at);
        return (opts?.ascending !== false ? 1 : -1) * av.localeCompare(bv);
      });
      void col;
      return chain;
    }),
    range: vi.fn((from: number, to: number) =>
      Promise.resolve({ data: _ordered.slice(from, to + 1), error: null }),
    ),
    update: vi.fn((patch: { preferences: Record<string, unknown> }) => ({
      eq: vi.fn((_col: string, id: string) => {
        store.prefsWrites.push({ coachId: id, preferences: patch.preferences });
        // also reflect into the local store so a SECOND cron run sees the dedup key
        const c = store.coaches.find((x) => x.id === id);
        if (c) c.preferences = patch.preferences;
        return Promise.resolve({ error: null });
      }),
    })),
  };
  return chain;
}

function buildReactionsChain() {
  let coachId: string | null = null;
  let start: string | null = null;
  let end: string | null = null;

  const chain: Record<string, unknown> = {
    select: vi.fn((cols: string) => {
      store.selectColumnsCalled.push(cols);
      return chain;
    }),
    eq: vi.fn((col: string, val: string) => {
      if (col === 'coach_id') coachId = val;
      return chain;
    }),
    gte: vi.fn((_col: string, val: string) => {
      start = val;
      return chain;
    }),
    lte: vi.fn((_col: string, val: string) => {
      end = val;
      return chain;
    }),
    order: vi.fn(() => chain),
    // thenable: when awaited, resolves to the filtered slice
    then: (onFulfilled: (v: { data: Reaction[]; error: null }) => unknown) => {
      const rows = store.reactions.filter((r) => {
        if (coachId && r.coach_id !== coachId) return false;
        if (start && r.created_at < start) return false;
        if (end && r.created_at > end) return false;
        return true;
      });
      // Strip players join — the contract says the route must never request it.
      const stripped: Reaction[] = rows.map((r) => {
        const copy: Reaction = { ...r };
        delete copy.players;
        return copy;
      });
      return Promise.resolve({ data: stripped, error: null }).then(onFulfilled);
    },
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Mocks queued via mockReturnValueOnce do NOT drain with clearAllMocks (LESSONS#92).
  mockFromFn.mockReset();
  clearStore();
  process.env.CRON_SECRET = 'test-secret';

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') return buildCoachesChain();
    if (table === 'parent_reactions') return buildReactionsChain();
    // Defensive: any other table is unexpected for this cron.
    throw new Error(`unexpected table read: ${table}`);
  });

  mockSendEmail.mockResolvedValue({ success: true, id: 'mock-email-id' });
});

// ─── Helpers to build a deterministic prior-week fixture ──────────────────────

function priorWeekDates() {
  const monday = getPriorWeekMonday(new Date());
  const { start, end } = getWeekWindow(monday);
  // Pick a midweek timestamp safely inside the window.
  const midweekDate = new Date(start + 'T12:00:00Z');
  midweekDate.setUTCDate(midweekDate.getUTCDate() + 2);
  return { monday, start, end, midweekIso: midweekDate.toISOString() };
}

function authHeaders(bearer = process.env.CRON_SECRET ?? 'test-secret') {
  return { authorization: `Bearer ${bearer}` };
}

function makeRequest(headers: Record<string, string> = authHeaders()) {
  return new Request('http://localhost/api/cron/weekly-parent-rollup', {
    method: 'POST',
    headers,
  });
}

const ORIG_CRON_SECRET = process.env.CRON_SECRET;

afterAll(() => {
  if (ORIG_CRON_SECRET == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIG_CRON_SECRET;
});

// ─── (1) Auth — 401 path, no DB write ─────────────────────────────────────────

describe('POST /api/cron/weekly-parent-rollup — auth', () => {
  it('returns 401 on missing bearer and writes nothing', async () => {
    const res = await rollupPost(makeRequest({}));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(store.prefsWrites).toEqual([]);
  });

  it('returns 401 on wrong bearer and writes nothing', async () => {
    const res = await rollupPost(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(store.prefsWrites).toEqual([]);
  });

  it('returns 200 with the result shape on valid bearer', async () => {
    const res = await rollupPost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      week: expect.any(String),
      sent: expect.any(Number),
      skipped: expect.any(Number),
      errors: expect.any(Number),
    });
  });
});

// ─── (2) Coach with reactions → 1 email, subject + body shape ────────────────

describe('POST /api/cron/weekly-parent-rollup — happy path', () => {
  it('sends ONE email per eligible coach with subject + top-3 quoted messages', async () => {
    const { midweekIso, monday } = priorWeekDates();
    store.coaches = [
      {
        id: 'coach-1',
        email: 'marcus@example.com',
        full_name: 'Marcus Hill',
        preferences: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    // 5 reactions in the prior week, 3 with messages (Sarah/James/Maria) + 2 hearts-only.
    const t = (h: number) => {
      const d = new Date(midweekIso);
      d.setUTCHours(d.getUTCHours() + h);
      return d.toISOString();
    };
    store.reactions = [
      { reaction: '❤️', message: null, parent_name: 'Anon1', created_at: t(-10), coach_id: 'coach-1' },
      { reaction: '❤️', message: "thanks for sticking with Devon on his shooting.", parent_name: 'Sarah', created_at: t(-8), coach_id: 'coach-1' },
      { reaction: '❤️', message: 'he came home pumped after Saturday.', parent_name: 'James', created_at: t(2), coach_id: 'coach-1' },
      { reaction: '❤️', message: null, parent_name: 'Anon2', created_at: t(4), coach_id: 'coach-1' },
      { reaction: '❤️', message: 'first time he asked for the ball at school.', parent_name: 'Maria', created_at: t(-2), coach_id: 'coach-1' },
    ];

    const res = await rollupPost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.week).toBe(monday);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(call.to).toBe('marcus@example.com');
    // Subject: first name + "your team's parents this week" + the week label.
    expect(call.subject).toMatch(/^Marcus,/);
    expect(call.subject).toMatch(/your team's parents this week/);

    // Top-3 message bodies all appear.
    expect(call.html).toContain('thanks for sticking with Devon on his shooting.');
    expect(call.html).toContain('he came home pumped after Saturday.');
    expect(call.html).toContain('first time he asked for the ball at school.');
    // Parent first names appear.
    expect(call.html).toContain('Sarah');
    expect(call.html).toContain('James');
    expect(call.html).toContain('Maria');
  });
});

// ─── (3) Zero reactions → skip (no email) ─────────────────────────────────────

describe('POST /api/cron/weekly-parent-rollup — no reactions', () => {
  it('skips a coach with zero reactions in the prior week — no email, totalSkipped increments', async () => {
    store.coaches = [
      {
        id: 'coach-quiet',
        email: 'quiet@example.com',
        full_name: 'Quiet Coach',
        preferences: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    store.reactions = []; // empty

    const res = await rollupPost(makeRequest());
    const body = await res.json();

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });
});

// ─── (4) Opt-out via preferences.weekly_parent_rollup === false ──────────────

describe('POST /api/cron/weekly-parent-rollup — opt-out', () => {
  it('skips when weekly_parent_rollup === false; sends when unset or true', async () => {
    const { midweekIso } = priorWeekDates();
    store.coaches = [
      { id: 'coach-true', email: 't@x.com', full_name: 'T Coach', preferences: { weekly_parent_rollup: true }, created_at: '2026-01-01T00:00:00Z' },
      { id: 'coach-unset', email: 'u@x.com', full_name: 'U Coach', preferences: {}, created_at: '2026-01-02T00:00:00Z' },
      { id: 'coach-false', email: 'f@x.com', full_name: 'F Coach', preferences: { weekly_parent_rollup: false }, created_at: '2026-01-03T00:00:00Z' },
    ];
    for (const c of store.coaches) {
      store.reactions.push({ reaction: '❤️', message: 'thanks!', parent_name: 'P', created_at: midweekIso, coach_id: c.id });
    }

    const res = await rollupPost(makeRequest());
    const body = await res.json();

    // Two emails sent (true + unset), one skipped (false).
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const toAddresses = mockSendEmail.mock.calls.map((c) => (c[0] as { to: string }).to).sort();
    expect(toAddresses).toEqual(['t@x.com', 'u@x.com']);
    expect(body.sent).toBe(2);
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });
});

// ─── (5) Dedup: second run skips ──────────────────────────────────────────────

describe('POST /api/cron/weekly-parent-rollup — dedup', () => {
  it('second run on the same week skips; dedup key is parent_rollup_week_<YYYY-MM-DD>', async () => {
    const { midweekIso, monday } = priorWeekDates();
    store.coaches = [
      { id: 'coach-dd', email: 'd@x.com', full_name: 'D Coach', preferences: {}, created_at: '2026-01-01T00:00:00Z' },
    ];
    store.reactions = [
      { reaction: '❤️', message: 'thanks!', parent_name: 'P', created_at: midweekIso, coach_id: 'coach-dd' },
    ];

    await rollupPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    // The dedup write must have landed with the exact key shape from the ticket.
    const dedupWrite = store.prefsWrites.find((w) => w.coachId === 'coach-dd');
    expect(dedupWrite).toBeDefined();
    expect((dedupWrite!.preferences as Record<string, unknown>)[`parent_rollup_week_${monday}`]).toBe(true);

    // Second invocation — same fixture, no new sends.
    mockSendEmail.mockClear();
    await rollupPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ─── (6) COPPA — no player-name leak ─────────────────────────────────────────

describe('POST /api/cron/weekly-parent-rollup — COPPA', () => {
  it('never includes a roster player name in the rendered HTML', async () => {
    const { midweekIso } = priorWeekDates();
    store.coaches = [
      { id: 'coach-coppa', email: 'c@x.com', full_name: 'C Coach', preferences: {}, created_at: '2026-01-01T00:00:00Z' },
    ];
    // Plant a distinctive token on the `players` join the route MUST NOT read.
    store.reactions = [
      {
        reaction: '❤️',
        message: 'thanks for sticking with him this week.',
        parent_name: 'Sarah',
        created_at: midweekIso,
        coach_id: 'coach-coppa',
        players: { name: 'ZZ-CHILD-MARKER', nickname: 'ZZ-NICK-MARKER' },
      },
    ];

    await rollupPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(call.html).not.toContain('ZZ-CHILD-MARKER');
    expect(call.html).not.toContain('ZZ-NICK-MARKER');

    // The route's select() column list NEVER asks for the players() join.
    expect(store.selectColumnsCalled.length).toBeGreaterThan(0);
    for (const cols of store.selectColumnsCalled) {
      expect(cols).not.toMatch(/players/);
    }
  });
});

// ─── (7) Top-3 / no-messages fallback ─────────────────────────────────────────

describe('POST /api/cron/weekly-parent-rollup — top-3 / no-messages', () => {
  it('5 reactions w/ only 2 messages renders both messages + count line', async () => {
    const { midweekIso } = priorWeekDates();
    store.coaches = [
      { id: 'coach-m2', email: 'm2@x.com', full_name: 'M Coach', preferences: {}, created_at: '2026-01-01T00:00:00Z' },
    ];
    store.reactions = [
      { reaction: '❤️', message: null, parent_name: 'A', created_at: midweekIso, coach_id: 'coach-m2' },
      { reaction: '❤️', message: null, parent_name: 'B', created_at: midweekIso, coach_id: 'coach-m2' },
      { reaction: '❤️', message: null, parent_name: 'C', created_at: midweekIso, coach_id: 'coach-m2' },
      { reaction: '❤️', message: 'first', parent_name: 'D', created_at: midweekIso, coach_id: 'coach-m2' },
      { reaction: '❤️', message: 'second', parent_name: 'E', created_at: midweekIso, coach_id: 'coach-m2' },
    ];

    await rollupPost(makeRequest());

    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(call.html).toContain('5');
    expect(call.html).toContain('first');
    expect(call.html).toContain('second');
  });

  it('5 reactions w/ 0 messages still sends — count line + no quote block', async () => {
    const { midweekIso } = priorWeekDates();
    store.coaches = [
      { id: 'coach-m0', email: 'm0@x.com', full_name: 'M Coach', preferences: {}, created_at: '2026-01-01T00:00:00Z' },
    ];
    store.reactions = Array.from({ length: 5 }).map((_, i) => ({
      reaction: '❤️',
      message: null,
      parent_name: `P${i}`,
      created_at: midweekIso,
      coach_id: 'coach-m0',
    }));

    await rollupPost(makeRequest());

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(call.html).toContain('5');
    expect(call.html).toMatch(/no notes this week/i);
  });
});

// ─── (8) Regression: digest keys stay byte-identical ─────────────────────────

describe('POST /api/cron/weekly-parent-rollup — independence from weekly digest', () => {
  it('preserves digest_week_* and disable_weekly_digest after a rollup send', async () => {
    const { midweekIso, monday } = priorWeekDates();
    // This coach is already marked sent for the (same) week's weekly digest, AND
    // they have the weekly-digest opt-out set. The rollup write must leave those
    // keys byte-identical.
    store.coaches = [
      {
        id: 'coach-reg',
        email: 'r@x.com',
        full_name: 'R Coach',
        preferences: {
          [`digest_week_${monday}`]: true,
          disable_weekly_digest: true,
          // a soft, unrelated string the route also shouldn't drop
          favorite_color: 'orange',
        },
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    store.reactions = [
      { reaction: '❤️', message: 'thanks!', parent_name: 'P', created_at: midweekIso, coach_id: 'coach-reg' },
    ];

    await rollupPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const write = store.prefsWrites.find((w) => w.coachId === 'coach-reg');
    expect(write).toBeDefined();
    const prefs = write!.preferences as Record<string, unknown>;
    expect(prefs[`digest_week_${monday}`]).toBe(true);
    expect(prefs['disable_weekly_digest']).toBe(true);
    expect(prefs['favorite_color']).toBe('orange');
    expect(prefs[`parent_rollup_week_${monday}`]).toBe(true);
  });
});
