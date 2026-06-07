/**
 * Ticket 0072 — GET /api/share/[token] extension: best-effort detection
 * of a returning parent whose email matches a prior player on a
 * DIFFERENT team whose head coach has been dormant 30+ days.
 *
 * The extension is BEST-EFFORT (LESSONS#0036). The parent's page render
 * is BYTE-IDENTICAL to today on every code path — the response payload
 * gains no new field, the parent's parent_email is NEVER returned, and
 * any reactivation-detection failure is a silent no-op.
 *
 * Mock posture: the route uses `mockImplementation((table) => ...)`
 * (table-keyed). Extending the route with a new `from()` call does NOT
 * overflow a queued chain (LESSONS#0049 / #0092 / #0100 / #0110 family
 * does not apply here — no mockReturnValueOnce queues to extend).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { GET as shareGet } from '@/app/api/share/[token]/route';

// ─── Chain helpers ────────────────────────────────────────────────────────────

interface Resolved<T = unknown> {
  data: T | null;
  error: unknown;
}

function buildChain<T = unknown>(data: T | null = null, error: unknown = null) {
  const resolved: Resolved<T> = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: Resolved<T>) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const PARENT_EMAIL = 'linda@walker-family.test';
const CURRENT_TEAM_ID = '00000000-0000-4000-a000-000000000020'; // fall team
const SPRING_TEAM_ID = '00000000-0000-4000-a000-0000000000a1';
const CURRENT_PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const SPRING_PLAYER_ID = '00000000-0000-4000-a000-0000000000c1';
const SPRING_COACH_ID = '00000000-0000-4000-a000-0000000000b1';

const DAY_MS = 24 * 60 * 60 * 1000;
const dormantIso = new Date(Date.now() - 35 * DAY_MS).toISOString();
const activeIso = new Date(Date.now() - 5 * DAY_MS).toISOString();

const SHARE_ROW = {
  id: 'share-1',
  share_token: 'tok-1',
  player_id: CURRENT_PLAYER_ID,
  team_id: CURRENT_TEAM_ID,
  coach_id: 'coach-fall',
  is_active: true,
  expires_at: null,
  pin: null,
  view_count: 0,
  custom_message: null,
};
const CURRENT_PLAYER = {
  id: CURRENT_PLAYER_ID,
  name: 'Maya Walker',
  nickname: null,
  position: null,
  jersey_number: null,
  photo_url: null,
  parent_name: 'Linda',
  parent_phone: null,
  parent_email: PARENT_EMAIL,
};
const CURRENT_TEAM = {
  name: 'Hornets Fall',
  age_group: '8-10',
  season: 'Fall 2026',
  org_id: null,
};
const SPRING_PRIOR_PLAYER = {
  id: SPRING_PLAYER_ID,
  name: 'Liam Walker',
  team_id: SPRING_TEAM_ID,
  parent_email: PARENT_EMAIL,
};

interface WireOpts {
  priorPlayers?: typeof SPRING_PRIOR_PLAYER[] | null;
  headCoachJoins?: Array<{ team_id: string; coach_id: string; role: string }> | null;
  coachRows?: Array<{ id: string; last_active_at: string | null }> | null;
  priorPlayerThrows?: boolean;
  /** Captures every upsert(...) payload so the test can assert the row
   *  shape persisted to `coach_reactivation_signals`. */
  upsertPayloads?: Array<Record<string, unknown>>;
}

function wireTables(opts: WireOpts = {}) {
  const upserts = opts.upsertPayloads ?? [];

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'parent_shares') return buildChain(SHARE_ROW);
    if (table === 'players') {
      // The route reads `players` twice: once for the current player
      // (the `.single()` resolved row) and once for the prior-player
      // sibling search (chained list read with `.ilike(...).neq(...).eq(...)`).
      // A chain that resolves to {data: priorPlayers} via `then` covers the
      // list read; `single()` resolves to {data: CURRENT_PLAYER} for the
      // single-row read. One chain handles both because the route never
      // mixes the calls.
      // To distinguish, we use the FIRST call as the current-player single
      // read, then subsequent calls as the list read.
      // But buildChain's `then` resolves the SAME data for both, so we
      // need to interleave: use a fresh chain per call.
      // Track call count via a side-channel — first call returns CURRENT_PLAYER
      // via single(); second call returns priorPlayers via then().
      callCounts.players++;
      if (callCounts.players === 1) {
        return buildChain(CURRENT_PLAYER);
      }
      if (opts.priorPlayerThrows) {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (_resolve: any, reject: any) =>
            Promise.reject(new Error('boom')).catch(reject ?? (() => undefined)),
        } as any;
      }
      return buildChain(opts.priorPlayers ?? null);
    }
    if (table === 'teams') return buildChain(CURRENT_TEAM);
    if (table === 'coaches') {
      callCounts.coaches++;
      // First read: route's single-row coach lookup. Subsequent reads:
      // the dormant-coach freshness `.in('id', ...)` list read.
      if (callCounts.coaches === 1) {
        return buildChain({ full_name: 'Coach Hornets', preferences: {} });
      }
      return buildChain(opts.coachRows ?? null);
    }
    if (table === 'team_coaches') return buildChain(opts.headCoachJoins ?? null);
    if (table === 'coach_reactivation_signals') {
      const upsertChain = buildChain(null);
      (upsertChain.upsert as any) = vi.fn((payload: Record<string, unknown>) => {
        upserts.push(payload);
        return upsertChain;
      });
      return upsertChain;
    }
    return buildChain(null);
  });
}

const callCounts = { players: 0, coaches: 0 };

function makeRequest(token = 'tok-1') {
  return new Request(`http://localhost/api/share/${token}`);
}

const tokenParams = (token = 'tok-1') => Promise.resolve({ token });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/share/[token] — returning-parent reactivation detection (ticket 0072)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    callCounts.players = 0;
    callCounts.coaches = 0;
  });

  it('inserts one coach_reactivation_signals row when a returning parent matches a dormant prior coach', async () => {
    const upsertPayloads: Array<Record<string, unknown>> = [];
    wireTables({
      priorPlayers: [SPRING_PRIOR_PLAYER],
      headCoachJoins: [
        { team_id: SPRING_TEAM_ID, coach_id: SPRING_COACH_ID, role: 'head_coach' },
      ],
      coachRows: [{ id: SPRING_COACH_ID, last_active_at: dormantIso }],
      upsertPayloads,
    });

    const res = await shareGet(makeRequest(), { params: tokenParams() });
    expect(res.status).toBe(200);
    expect(upsertPayloads).toHaveLength(1);
    expect(upsertPayloads[0]).toMatchObject({
      dormant_coach_id: SPRING_COACH_ID,
      prior_team_id: SPRING_TEAM_ID,
      prior_player_id: SPRING_PLAYER_ID,
    });
    // Hash is a sha256 hex of the lowercased email; never plaintext.
    const expectedHash = createHash('sha256')
      .update(PARENT_EMAIL.toLowerCase())
      .digest('hex');
    expect(upsertPayloads[0].returning_parent_email_hash).toBe(expectedHash);
    expect(JSON.stringify(upsertPayloads[0])).not.toContain('linda');
  });

  it('is idempotent — the upsert names (dormant_coach_id, prior_player_id) as the conflict key so a re-visit does not spam', async () => {
    // Idempotency is asserted at the UPSERT contract level: the route's
    // .upsert(payload, { onConflict: 'dormant_coach_id,prior_player_id' })
    // is what guarantees a second visit by the same parent on the same
    // other team hits the SAME row, not a new one. The DB does the dedup;
    // the route just has to ask for it correctly. We don't simulate the
    // DB's conflict resolution — only that the route asks for it.
    const upsertCalls: Array<[Record<string, unknown>, Record<string, unknown>]> = [];
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'parent_shares') return buildChain(SHARE_ROW);
      if (table === 'players') {
        callCounts.players++;
        if (callCounts.players === 1) return buildChain(CURRENT_PLAYER);
        return buildChain([SPRING_PRIOR_PLAYER]);
      }
      if (table === 'teams') return buildChain(CURRENT_TEAM);
      if (table === 'coaches') {
        callCounts.coaches++;
        if (callCounts.coaches === 1) {
          return buildChain({ full_name: 'Coach Hornets', preferences: {} });
        }
        return buildChain([{ id: SPRING_COACH_ID, last_active_at: dormantIso }]);
      }
      if (table === 'team_coaches') {
        return buildChain([
          { team_id: SPRING_TEAM_ID, coach_id: SPRING_COACH_ID, role: 'head_coach' },
        ]);
      }
      if (table === 'coach_reactivation_signals') {
        const ch = buildChain(null);
        (ch.upsert as any) = vi.fn((payload: Record<string, unknown>, opts: Record<string, unknown>) => {
          upsertCalls.push([payload, opts]);
          return ch;
        });
        return ch;
      }
      return buildChain(null);
    });

    await shareGet(makeRequest(), { params: tokenParams() });
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0][1]).toMatchObject({
      onConflict: 'dormant_coach_id,prior_player_id',
    });
  });

  it('writes no signal row when the parent email matches nothing on any other team', async () => {
    const upsertPayloads: Array<Record<string, unknown>> = [];
    wireTables({
      priorPlayers: [],
      headCoachJoins: [],
      coachRows: [],
      upsertPayloads,
    });
    const res = await shareGet(makeRequest(), { params: tokenParams() });
    expect(res.status).toBe(200);
    expect(upsertPayloads).toHaveLength(0);
  });

  it('writes no signal row when the matched prior coach is NOT dormant', async () => {
    const upsertPayloads: Array<Record<string, unknown>> = [];
    wireTables({
      priorPlayers: [SPRING_PRIOR_PLAYER],
      headCoachJoins: [
        { team_id: SPRING_TEAM_ID, coach_id: SPRING_COACH_ID, role: 'head_coach' },
      ],
      coachRows: [{ id: SPRING_COACH_ID, last_active_at: activeIso }],
      upsertPayloads,
    });
    const res = await shareGet(makeRequest(), { params: tokenParams() });
    expect(res.status).toBe(200);
    expect(upsertPayloads).toHaveLength(0);
  });

  it('returns the parent payload BYTE-IDENTICAL — no parent_email leaks in the response', async () => {
    wireTables({
      priorPlayers: [SPRING_PRIOR_PLAYER],
      headCoachJoins: [
        { team_id: SPRING_TEAM_ID, coach_id: SPRING_COACH_ID, role: 'head_coach' },
      ],
      coachRows: [{ id: SPRING_COACH_ID, last_active_at: dormantIso }],
    });
    const res = await shareGet(makeRequest(), { params: tokenParams() });
    expect(res.status).toBe(200);
    const body = await res.json();
    // The response carries the player object but parent_email MUST be
    // stripped before returning — the detection is invisible to the
    // parent.
    expect(body.player).toBeDefined();
    expect(body.player.parent_email).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(PARENT_EMAIL);
    // No reactivation field on the response payload.
    expect(body.reactivationSignal).toBeUndefined();
    expect(body.coachReactivation).toBeUndefined();
  });

  it('still returns 200 with the parent payload when the prior-player read fails (best-effort posture)', async () => {
    const upsertPayloads: Array<Record<string, unknown>> = [];
    wireTables({
      priorPlayerThrows: true,
      upsertPayloads,
    });
    const res = await shareGet(makeRequest(), { params: tokenParams() });
    expect(res.status).toBe(200);
    expect(upsertPayloads).toHaveLength(0);
  });
});
