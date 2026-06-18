/**
 * Ticket 0088 — GET /api/home/first-cross-coach-signal.
 *
 * The home page mounts <FirstCrossCoachSignalCard /> at the TOP of
 * the feed; that card calls THIS route to learn whether a first-of-
 * its-kind cross-coach signal has fired for the caller AND has not
 * yet been dismissed.
 *
 * Schema-wins-over-prose deviation (LESSONS#0096) — the home page
 * does NOT have a single unified home-feed route; each card calls
 * its own /api/coach/... route. The smallest-blast-radius
 * "extension" of the existing pattern is therefore a NEW dedicated
 * route mirroring `coach-reputation-milestones`. Documented in the
 * ticket's Implementation log; the empty Glob (LESSONS#0116) for
 * `tests/api/home*.test.ts` / `me*` / `app/home*` is a no-op.
 *
 * Acceptance criteria mapping:
 *  (i)   coach with no signals AND no celebrations → field is null.
 *  (ii)  coach with one clone signal AND no celebration → returns
 *        the clone fields.
 *  (iii) coach with one clone AND a celebration row for kind:'clone'
 *        → returns null (already seen).
 *  (iv)  coach with one clone AND one EARLIER thank → returns the
 *        thank fields.
 *  (vi)  unauthed caller → 401.
 *  (vii) planted coaches.email/phone/players.* on joined rows are
 *        NEVER reached by the route's .select() allow-list (COPPA).
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

import { GET } from '@/app/api/home/first-cross-coach-signal/route';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';

// Build a thenable chain that resolves to { data, error } when
// awaited and is mockReturnThis on every builder method.
function chain<T = unknown>(data: T | null = null) {
  const resolved = { data, error: null };
  const c: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return c;
}

// Builds a table-keyed mock implementation that returns a fresh
// thenable chain per call. The test queues per-table fixture data
// keyed by table name so the route can hit them in any order.
function wireTables(byTable: Record<string, unknown[]>) {
  mockFromFn.mockImplementation((table: string) => {
    const rows = byTable[table] ?? [];
    return chain(rows);
  });
}

describe('GET /api/home/first-cross-coach-signal (ticket 0088)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: COACH_ID } } });
  });

  it('(vi) unauthed caller → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('(i) coach with no signals → firstCrossCoachSignal: null', async () => {
    wireTables({});
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.firstCrossCoachSignal).toBeNull();
  });

  it('(ii) coach with one clone signal AND no celebration → returns clone fields', async () => {
    wireTables({
      drill_shares: [{ id: 'ds-1', drill_id: 'drill-1' }],
      drill_share_clones: [
        {
          id: 'd-1',
          drill_share_id: 'ds-1',
          cloned_at: '2026-06-10T12:00:00Z',
          cloner_coach_id: '00000000-0000-4000-a000-0000000000c9',
        },
      ],
      coaches: [
        {
          id: '00000000-0000-4000-a000-0000000000c9',
          full_name: 'Maya Walker',
          org_id: 'org-h',
        },
      ],
      organizations: [{ id: 'org-h', name: 'Hornets' }],
      drills: [{ id: 'drill-1', name: 'Closeout drill' }],
      coach_first_signal_celebrations: [],
      coach_thank_messages: [],
      drill_clone_stick_signals: [],
      parent_forward_signals: [],
      parent_reactions: [],
      teams: [],
      team_coaches: [],
      parent_shares: [],
      players: [],
      plans: [],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.firstCrossCoachSignal).not.toBeNull();
    expect(body.firstCrossCoachSignal.kind).toBe('clone');
    expect(body.firstCrossCoachSignal.firedAt).toBe('2026-06-10T12:00:00Z');
    expect(body.firstCrossCoachSignal.senderFirstName).toBe('Maya');
    expect(body.firstCrossCoachSignal.senderProgramName).toBe('Hornets');
    expect(body.firstCrossCoachSignal.artifactLabel).toContain('Closeout');
  });

  it('(iii) coach with one clone AND a celebration row for clone → null', async () => {
    wireTables({
      drill_shares: [{ id: 'ds-1', drill_id: 'drill-1' }],
      drill_share_clones: [
        {
          id: 'd-1',
          drill_share_id: 'ds-1',
          cloned_at: '2026-06-10T12:00:00Z',
          cloner_coach_id: '00000000-0000-4000-a000-0000000000c9',
        },
      ],
      coaches: [],
      organizations: [],
      drills: [{ id: 'drill-1', name: 'Closeout drill' }],
      coach_first_signal_celebrations: [{ kind: 'clone', dismissed_at: '2026-06-11T00:00:00Z' }],
      coach_thank_messages: [],
      drill_clone_stick_signals: [],
      parent_forward_signals: [],
      parent_reactions: [],
      teams: [],
      team_coaches: [],
      parent_shares: [],
      players: [],
      plans: [],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.firstCrossCoachSignal).toBeNull();
  });

  it('(iv) coach with one clone AND one earlier thank → returns thank fields', async () => {
    wireTables({
      drill_shares: [{ id: 'ds-1', drill_id: 'drill-1' }],
      drill_share_clones: [
        {
          id: 'd-1',
          drill_share_id: 'ds-1',
          cloned_at: '2026-06-10T12:00:00Z',
          cloner_coach_id: '00000000-0000-4000-a000-0000000000c9',
        },
      ],
      coach_thank_messages: [
        {
          id: 't-1',
          sender_coach_id: '00000000-0000-4000-a000-0000000000ca',
          drill_share_id: 'ds-1',
          plan_share_id: null,
          body: 'thanks',
          sent_at: '2026-06-05T12:00:00Z',
        },
      ],
      coaches: [
        { id: '00000000-0000-4000-a000-0000000000c9', full_name: 'Maya Walker', org_id: 'org-h' },
        { id: '00000000-0000-4000-a000-0000000000ca', full_name: 'Jordan Lee', org_id: 'org-l' },
      ],
      organizations: [
        { id: 'org-h', name: 'Hornets' },
        { id: 'org-l', name: 'Lions' },
      ],
      drills: [{ id: 'drill-1', name: 'Closeout drill' }],
      coach_first_signal_celebrations: [],
      drill_clone_stick_signals: [],
      parent_forward_signals: [],
      parent_reactions: [],
      teams: [],
      team_coaches: [],
      parent_shares: [],
      practice_plan_shares: [],
      players: [],
      plans: [],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.firstCrossCoachSignal?.kind).toBe('thank');
    expect(body.firstCrossCoachSignal?.firedAt).toBe('2026-06-05T12:00:00Z');
    expect(body.firstCrossCoachSignal?.senderFirstName).toBe('Jordan');
  });

  it('(vii) the .select() allow-list never reads coaches.email or coaches.phone', async () => {
    // We assert this by inspecting the .select() calls' arguments after
    // a full pass — any select() that names email/phone is a contract
    // bug regardless of the fixture content.
    const seenSelects: string[] = [];
    mockFromFn.mockImplementation(() => {
      const c = chain([]);
      const sel = c.select as ReturnType<typeof vi.fn>;
      sel.mockImplementation((arg: string) => {
        seenSelects.push(arg ?? '');
        return c;
      });
      return c;
    });
    await GET();
    const flat = seenSelects.join(' | ').toLowerCase();
    // Defensive contract: never selects email / phone / DOB / parent_email
    // from any joined table.
    expect(flat).not.toContain('email');
    expect(flat).not.toContain('phone');
    expect(flat).not.toContain('date_of_birth');
    expect(flat).not.toContain('parent_email');
    expect(flat).not.toContain('parent_name');
    expect(flat).not.toContain('parent_phone');
  });
});
