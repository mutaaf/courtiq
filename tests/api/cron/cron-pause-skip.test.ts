/**
 * Ticket 0042 — every existing cron skips a paused coach.
 *
 * One file, one test per cron. The cron POSTs themselves are exercised in their
 * own files (or via their util tests); here we only assert the new
 * isCoachPaused short-circuit lives BEFORE any send work in:
 *  - weekly-digest
 *  - parent-digest
 *  - practice-reminder
 *  - weekly-parent-rollup
 *
 * Each case seeds a coach whose `paused_until` is 5 days in the future and
 * whose other gates would otherwise pass, then asserts:
 *   - sendEmail was NEVER called for that coach
 *   - totalSkipped >= 1
 *   - NO preferences write occurred (the dedup key isn't "earned" by a skip)
 *
 * .test.ts (NOT .spec.ts) — LESSONS#38.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

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

const DAY = 24 * 60 * 60 * 1000;
const FUTURE_PAUSE = new Date(Date.now() + 5 * DAY).toISOString();

interface Coach {
  id: string;
  email: string;
  full_name: string;
  preferences: Record<string, unknown> | null;
  paused_until: string | null;
  last_active_at?: string | null;
  org_id?: string;
  created_at: string;
}

let coachesStore: Coach[] = [];
let prefsWrites: Array<{ coachId: string; preferences: Record<string, unknown> }> = [];

function buildCoachesChain() {
  let _ordered: Coach[] = [...coachesStore];
  let _filter: ((c: Coach) => boolean) | null = null;
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn(() => {
      _ordered = [..._ordered].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return chain;
    }),
    range: vi.fn((from: number, to: number) => {
      const rows = _filter ? _ordered.filter(_filter) : _ordered;
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    }),
    eq: vi.fn((col: string, val: unknown) => {
      const prev = _filter;
      _filter = (c) => (prev ? prev(c) : true) && (c as unknown as Record<string, unknown>)[col] === val;
      return chain;
    }),
    single: vi.fn(() => {
      const rows = _filter ? coachesStore.filter(_filter) : coachesStore;
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    }),
    update: vi.fn((patch: { preferences: Record<string, unknown> }) => ({
      eq: vi.fn((_col: string, id: string) => {
        prefsWrites.push({ coachId: id, preferences: patch.preferences });
        return Promise.resolve({ error: null });
      }),
    })),
  };
  return chain;
}

// Empty chains for ANY non-coaches table — the paused short-circuit must run
// BEFORE the route reads sessions/players/observations/etc., so these reads
// should never happen for the paused coach. We return empty data so even if a
// route accidentally proceeds past the gate, the rest of its work is a no-op
// and `sendEmail` would never be reached on a real schedule.
function emptyChain() {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    is: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => Promise.resolve({ data: [], error: null })),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    })),
    then: (onFulfilled: (v: { data: never[]; error: null }) => unknown) =>
      Promise.resolve({ data: [] as never[], error: null }).then(onFulfilled),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  coachesStore = [];
  prefsWrites = [];
  process.env.CRON_SECRET = 'test-secret-pause-skip';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') return buildCoachesChain();
    return emptyChain();
  });

  mockSendEmail.mockResolvedValue({ success: true, id: 'mock-email-id' });
});

const ORIG_CRON_SECRET = process.env.CRON_SECRET;
afterAll(() => {
  if (ORIG_CRON_SECRET == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIG_CRON_SECRET;
});

function authReq(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

// ─── weekly-digest ────────────────────────────────────────────────────────────

describe('weekly-digest cron — pause skip', () => {
  it('skips a paused coach: no email, no preferences write, totalSkipped >= 1', async () => {
    const { POST } = await import('@/app/api/cron/weekly-digest/route');
    coachesStore = [
      {
        id: 'coach-wd',
        email: 'wd@example.test',
        full_name: 'WD Coach',
        preferences: {},
        paused_until: FUTURE_PAUSE,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const res = await POST(authReq('/api/cron/weekly-digest'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(prefsWrites).toEqual([]);
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });
});

// ─── parent-digest ────────────────────────────────────────────────────────────

describe('parent-digest cron — pause skip', () => {
  it('skips a paused coach: no email, no preferences write, totalSkipped >= 1', async () => {
    const { POST } = await import('@/app/api/cron/parent-digest/route');
    coachesStore = [
      {
        id: 'coach-pd',
        email: 'pd@example.test',
        full_name: 'PD Coach',
        // Opt-in for parent digest would otherwise apply; the pause MUST
        // short-circuit BEFORE the opt-in / dedup gates fire.
        preferences: { auto_parent_digest: { enabled: true } },
        paused_until: FUTURE_PAUSE,
        org_id: 'org-1',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const res = await POST(authReq('/api/cron/parent-digest'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(prefsWrites).toEqual([]);
    expect(body.totalSkipped ?? body.skipped).toBeGreaterThanOrEqual(1);
  });
});

// ─── practice-reminder ────────────────────────────────────────────────────────
//
// practice-reminder reads `sessions` FIRST and looks up the coach per-session.
// Our `emptyChain` for `sessions` returns an empty list, so no coaches are
// loaded — meaning `sendEmail` is never called regardless. To prove the pause
// short-circuit specifically, seed one session pointing at a paused coach.

describe('practice-reminder cron — pause skip', () => {
  it('skips a paused coach whose session is scheduled today', async () => {
    coachesStore = [
      {
        id: 'coach-pr',
        email: 'pr@example.test',
        full_name: 'PR Coach',
        preferences: {},
        paused_until: FUTURE_PAUSE,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    // Customise the chain map so `sessions` returns one row for this coach.
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildCoachesChain();
      if (table === 'sessions') {
        let _ordered = [
          {
            id: 'sess-1',
            team_id: 'team-1',
            coach_id: 'coach-pr',
            type: 'practice',
            start_time: '18:00',
            date: new Date().toISOString().slice(0, 10),
          },
        ];
        const chain: Record<string, unknown> = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          lt: vi.fn(() => chain),
          order: vi.fn(() => {
            _ordered = [..._ordered];
            return chain;
          }),
          limit: vi.fn(() => chain),
          range: vi.fn((from: number, to: number) =>
            Promise.resolve({ data: _ordered.slice(from, to + 1), error: null }),
          ),
        };
        return chain;
      }
      return emptyChain();
    });

    const { POST } = await import('@/app/api/cron/practice-reminder/route');
    const res = await POST(authReq('/api/cron/practice-reminder'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(prefsWrites).toEqual([]);
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });
});

// ─── weekly-parent-rollup ─────────────────────────────────────────────────────

describe('weekly-parent-rollup cron — pause skip', () => {
  it('skips a paused coach: no email, no preferences write, totalSkipped >= 1', async () => {
    const { POST } = await import('@/app/api/cron/weekly-parent-rollup/route');
    coachesStore = [
      {
        id: 'coach-rl',
        email: 'rl@example.test',
        full_name: 'RL Coach',
        preferences: {},
        paused_until: FUTURE_PAUSE,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    // The rollup reads `parent_reactions` too — keep it empty for the paused
    // coach so a missed short-circuit doesn't silently still send nothing.
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coaches') return buildCoachesChain();
      if (table === 'parent_reactions') {
        const chain: Record<string, unknown> = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          then: (onFulfilled: (v: { data: never[]; error: null }) => unknown) =>
            Promise.resolve({ data: [] as never[], error: null }).then(onFulfilled),
        };
        return chain;
      }
      return emptyChain();
    });

    const res = await POST(authReq('/api/cron/weekly-parent-rollup'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(prefsWrites).toEqual([]);
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });
});
