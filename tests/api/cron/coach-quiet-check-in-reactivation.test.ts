/**
 * Ticket 0072 — the reactivation email branch on the 0042
 * `/api/cron/coach-quiet-check-in` route.
 *
 * Each AC box maps to a case:
 *  - a dormant coach with one unconsumed signal → ONE email sent with
 *    the reactivation subject;
 *  - a signal already marked notified_at → no second email;
 *  - a dormant coach who paused per 0042 → no email;
 *  - a NON-dormant coach with a signal → no email (already engaged);
 *  - the email body contains the player first name + a deep-link with
 *    the priorPlayerId;
 *  - the email body contains no AGENTS.md banned word.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
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
function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

interface Resolved<T = unknown> { data: T | null; error: unknown }

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
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: Resolved<T>) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

// A recent dedup key (yesterday) prevents the 0042 quiet-check-in email
// from firing — so the ONLY email the cron sends in our tests is the
// ticket 0072 reactivation branch.
function yesterdayDedupKey(): string {
  const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  return `quiet_check_in_${yesterday}`;
}

function dormantCoach(overrides: Partial<typeof BASE_COACH> = {}): typeof BASE_COACH {
  return { ...BASE_COACH, preferences: { [yesterdayDedupKey()]: true }, ...overrides };
}

const BASE_COACH = {
  id: 'coach-dormant',
  email: 'dormant@example.test',
  full_name: 'Sarah Hawkes',
  preferences: {} as Record<string, unknown>,
  paused_until: null as string | null,
  last_active_at: daysAgoIso(35), // > 14, so quiet → and > 30, so dormant
  created_at: '2026-01-01T00:00:00Z',
};
const DORMANT_COACH = dormantCoach();

interface WireOpts {
  signals?: Array<{
    id: string;
    dormant_coach_id: string;
    prior_team_id: string;
    prior_player_id: string;
    fired_at: string;
  }>;
  coaches?: typeof DORMANT_COACH[];
  priorPlayers?: Array<{ id: string; name: string }>;
  priorTeams?: Array<{ id: string; name: string }>;
  notifyUpdates?: Array<{ id: string; payload: Record<string, unknown> }>;
}

function wire(opts: WireOpts = {}) {
  const notifyUpdates = opts.notifyUpdates ?? [];
  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') {
      // The 0042 read uses .order(...).range(...). The reactivation
      // branch uses .in(...). We dispatch on call shape — but supabase
      // doesn't expose call shape here, so the simplest dispatch is by
      // first call returns the paginated batch, then the reactivation
      // path's .in(...) read returns the same coaches.
      // For simplicity: return the same coach list both times. The 0042
      // path consumes it via .range(); the reactivation branch via .in().
      const coaches = opts.coaches ?? [DORMANT_COACH];
      const resolved = { data: coaches, error: null };
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
    if (table === 'coach_reactivation_signals') {
      const signals = opts.signals ?? [];
      // First call: read with select/is/is/gte/order → returns the rows.
      // Second call: update notified_at → captures the payload.
      const readResolved = { data: signals, error: null };
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn((_col: string, id: string) => {
            notifyUpdates.push({ id, payload });
            return Promise.resolve({ error: null });
          }),
        })),
        then: (onFulfilled: (v: typeof readResolved) => unknown) =>
          Promise.resolve(readResolved).then(onFulfilled),
      };
      return chain;
    }
    if (table === 'players') {
      return buildChain(opts.priorPlayers ?? []);
    }
    if (table === 'teams') {
      return buildChain(opts.priorTeams ?? []);
    }
    // Ticket 0078 — the cron's publisher-reactivation branch reads these
    // tables. In the 0072 tests the publisher branch is a silent no-op:
    // empty milestone rows means the branch never selects a candidate.
    // Per LESSONS#0118 — broaden the whitelist to drop the noisy
    // console.error from the new branch.
    if (
      table === 'coach_reputation_milestones' ||
      table === 'coach_clone_reactivation_signals' ||
      table === 'drill_shares' ||
      table === 'drill_share_clones' ||
      table === 'organizations'
    ) {
      return buildChain([]);
    }
    throw new Error(`unexpected table read: ${table}`);
  });
}

const TEAM_ID = '00000000-0000-4000-a000-0000000000a1';
const PLAYER_ID = '00000000-0000-4000-a000-0000000000c1';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential'];

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  mockSendEmail.mockResolvedValue({ success: true, id: 'mock-email-id' });
  process.env.CRON_SECRET = 'test-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
});

function makeRequest() {
  return new Request('http://localhost/api/cron/coach-quiet-check-in', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

describe('POST /api/cron/coach-quiet-check-in — ticket 0072 reactivation branch', () => {
  it('sends ONE reactivation email per unconsumed signal for a dormant coach with a recent dedup', async () => {
    const notifyUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];
    wire({
      signals: [
        {
          id: 'sig-1',
          dormant_coach_id: DORMANT_COACH.id,
          prior_team_id: TEAM_ID,
          prior_player_id: PLAYER_ID,
          fired_at: daysAgoIso(2),
        },
      ],
      priorPlayers: [{ id: PLAYER_ID, name: 'Liam Walker' }],
      priorTeams: [{ id: TEAM_ID, name: 'Spring Hawks' }],
      notifyUpdates,
    });

    const res = await cronPost(makeRequest());
    expect(res.status).toBe(200);
    // The 0042 branch skips this coach (dedup key set), so the SINGLE
    // email sent is the reactivation branch.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendEmail.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(sent.to).toBe(DORMANT_COACH.email);
    expect(sent.subject).toMatch(/Liam'?'?s parent is back on SportsIQ this week/);
    expect(sent.html).toContain('Liam');
    // The deep-link points at the existing 0061 trajectory page.
    expect(sent.html).toContain(`/roster/${PLAYER_ID}/trajectory`);
    // notified_at was stamped.
    expect(notifyUpdates).toHaveLength(1);
    expect(notifyUpdates[0].id).toBe('sig-1');
    expect(typeof notifyUpdates[0].payload.notified_at).toBe('string');
  });

  it('does not send a reactivation email when no unconsumed signals exist', async () => {
    wire({ signals: [], coaches: [DORMANT_COACH] });
    await cronPost(makeRequest());
    // The 0042 branch is silent (dedup key set); the reactivation
    // branch sees nothing. Zero emails.
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not send to a coach who paused per 0042', async () => {
    const pausedCoach = { ...DORMANT_COACH, id: 'coach-paused', paused_until: daysFromNowIso(10) };
    wire({
      coaches: [pausedCoach],
      signals: [
        {
          id: 'sig-1',
          dormant_coach_id: pausedCoach.id,
          prior_team_id: TEAM_ID,
          prior_player_id: PLAYER_ID,
          fired_at: daysAgoIso(2),
        },
      ],
      priorPlayers: [{ id: PLAYER_ID, name: 'Liam Walker' }],
      priorTeams: [{ id: TEAM_ID, name: 'Spring Hawks' }],
    });
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not send to a NON-dormant coach with a signal (already engaged this week)', async () => {
    const activeCoach = { ...DORMANT_COACH, id: 'coach-active', last_active_at: daysAgoIso(2) };
    wire({
      coaches: [activeCoach],
      signals: [
        {
          id: 'sig-1',
          dormant_coach_id: activeCoach.id,
          prior_team_id: TEAM_ID,
          prior_player_id: PLAYER_ID,
          fired_at: daysAgoIso(2),
        },
      ],
      priorPlayers: [{ id: PLAYER_ID, name: 'Liam Walker' }],
      priorTeams: [{ id: TEAM_ID, name: 'Spring Hawks' }],
    });
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('rendered email subject + body contain NO AGENTS.md banned word', async () => {
    wire({
      signals: [
        {
          id: 'sig-1',
          dormant_coach_id: DORMANT_COACH.id,
          prior_team_id: TEAM_ID,
          prior_player_id: PLAYER_ID,
          fired_at: daysAgoIso(2),
        },
      ],
      priorPlayers: [{ id: PLAYER_ID, name: 'Liam Walker' }],
      priorTeams: [{ id: TEAM_ID, name: 'Spring Hawks' }],
    });
    await cronPost(makeRequest());
    const sent = mockSendEmail.mock.calls[0][0] as { subject: string; html: string };
    const combined = (sent.subject + sent.html).toLowerCase();
    for (const word of BANNED) {
      expect(combined).not.toContain(word);
    }
  });

  it('rendered email body NEVER contains the parent email (hashed or plaintext)', async () => {
    wire({
      signals: [
        {
          id: 'sig-1',
          dormant_coach_id: DORMANT_COACH.id,
          prior_team_id: TEAM_ID,
          prior_player_id: PLAYER_ID,
          fired_at: daysAgoIso(2),
        },
      ],
      priorPlayers: [{ id: PLAYER_ID, name: 'Liam Walker' }],
      priorTeams: [{ id: TEAM_ID, name: 'Spring Hawks' }],
    });
    await cronPost(makeRequest());
    const sent = mockSendEmail.mock.calls[0][0] as { subject: string; html: string };
    // Neither the field name nor an @-address shape leaks.
    expect(sent.html).not.toContain('returning_parent_email_hash');
    expect(sent.html).not.toContain('parent_email');
    expect(sent.html).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+/i);
  });
});
