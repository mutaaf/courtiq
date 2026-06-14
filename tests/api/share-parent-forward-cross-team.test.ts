/**
 * Ticket 0080 — POST /api/share/parent-forward extended for the
 * CROSS-TEAM-SAME-PROGRAM forward.
 *
 * The 0079 route accepts a `recipientPlayerId` only when the recipient
 * is on the SAME team as the sender. This ticket widens it so the
 * recipient MAY be on a DIFFERENT team in the SAME `org_id` (the
 * cross-team-same-program contract). When the team_ids differ:
 *   (a) the route mints the recipient's portal token against the
 *       RECIPIENT'S OWN coach (NOT the sender's coach);
 *   (b) the `parent_forward_signals` row is written with
 *       `cross_team = true`;
 *   (c) when the team_ids match, `cross_team = false` (the 0079
 *       byte-identical path).
 *
 * The 0079 anti-spam UNIQUE on (sender_player_id, recipient_player_id)
 * remains the load-bearing idempotency gate and the route's 7-day
 * dedupe stays byte-identical (LESSONS#0118 — broaden the existing
 * whitelist; never weaken the contract).
 *
 * COPPA: the response NEVER returns the recipient's parent_email, the
 * recipient's surname, the recipient coach's name, or the recipient
 * coach's email. The signal row stores ONLY player-id edges + team
 * scope + the new boolean flag.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SHARE_TOKEN = 'test-share-token-0080';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

import { POST } from '@/app/api/share/parent-forward/route';

// ─── Chain helpers (mirror the 0079 shape exactly) ───────────────────────────

interface Resolved<T = unknown> {
  data: T | null;
  error: unknown;
}

function buildChain<T = unknown>(data: T | null = null, error: unknown = null) {
  const resolved: Resolved<T> = { data, error };
  const selectCalls: string[] = [];
  const chain: Record<string, unknown> = {
    select: vi.fn((sel?: string) => {
      if (typeof sel === 'string') selectCalls.push(sel);
      return chain;
    }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: Resolved<T>) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
    _selectCalls: selectCalls,
  };
  return chain;
}

function insertCaptureChain(data: unknown = { id: 'signal-row-1' }) {
  const calls: Array<Record<string, unknown>> = [];
  const resolved = { data, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: Record<string, unknown>) => {
      calls.push(payload);
      return chain;
    }),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
    _calls: calls,
  };
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = '00000000-0000-4000-a000-000000000010';
const SENDER_TEAM_ID = '00000000-0000-4000-a000-000000000020';
const RECIPIENT_TEAM_ID = '00000000-0000-4000-a000-000000000a01'; // different team, SAME org
const OTHER_ORG_TEAM_ID = '00000000-0000-4000-a000-000000000b01'; // different team, DIFFERENT org

const SENDER_PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const RECIPIENT_PLAYER_ID = '00000000-0000-4000-a000-000000000a31';
const OTHER_ORG_PLAYER_ID = '00000000-0000-4000-a000-000000000b31';

const SENDER_COACH_ID = '00000000-0000-4000-a000-000000000001';
const RECIPIENT_COACH_ID = '00000000-0000-4000-a000-000000000a01';

const SHARE_ROW = {
  id: '00000000-0000-4000-a000-000000000060',
  player_id: SENDER_PLAYER_ID,
  team_id: SENDER_TEAM_ID,
  coach_id: SENDER_COACH_ID,
  is_active: true,
  expires_at: null,
};

const SENDER_PLAYER = {
  id: SENDER_PLAYER_ID,
  name: 'Maya Walker',
  team_id: SENDER_TEAM_ID,
};

const RECIPIENT_PLAYER_CROSS = {
  id: RECIPIENT_PLAYER_ID,
  name: 'Devon Bear',
  team_id: RECIPIENT_TEAM_ID,
  parent_email: 'devon-mom@e2e.test',
};

const RECIPIENT_PLAYER_SAME = {
  id: '00000000-0000-4000-a000-000000000031',
  name: 'Liam Carter',
  team_id: SENDER_TEAM_ID,
  parent_email: 'liam-parent@e2e.test',
};

const OTHER_ORG_PLAYER = {
  id: OTHER_ORG_PLAYER_ID,
  name: 'Kai Other',
  team_id: OTHER_ORG_TEAM_ID,
  parent_email: 'kai-parent@e2e.test',
};

const SENDER_TEAM_FULL = {
  id: SENDER_TEAM_ID,
  name: 'Hawks U10',
  sport_id: '00000000-0000-4000-a000-00000000ff01',
  org_id: ORG_ID,
};

const RECIPIENT_TEAM_FULL_SAME_ORG = {
  id: RECIPIENT_TEAM_ID,
  name: 'Bears U12',
  sport_id: '00000000-0000-4000-a000-00000000ff01',
  org_id: ORG_ID,
};

const RECIPIENT_TEAM_FULL_DIFF_ORG = {
  id: OTHER_ORG_TEAM_ID,
  name: 'Wolves U10',
  sport_id: '00000000-0000-4000-a000-00000000ff01',
  org_id: '00000000-0000-4000-a000-0000000ff010', // different org
};

const SENDER_TEAM_ROW = {
  id: SENDER_TEAM_ID,
  name: 'Hawks U10',
  sport_id: '00000000-0000-4000-a000-00000000ff01',
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/share/parent-forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function defaultBody(overrides: Record<string, unknown> = {}) {
  return {
    shareToken: SHARE_TOKEN,
    recipientPlayerId: RECIPIENT_PLAYER_ID,
    senderFirstName: 'Sarah',
    note: "I thought you'd want to read this — Maya and Devon are in the same program.",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/share/parent-forward cross-team (ticket 0080)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true, id: 'em_pf2' });
    process.env.NEXT_PUBLIC_APP_URL = 'https://youthsportsiq.com';
  });

  // ─── Cross-team happy path ────────────────────────────────────────────────

  it('happy path cross-team: writes parent_forward_signals with cross_team = true and returns 200', async () => {
    const mintChain = insertCaptureChain({
      share_token: 'recipient-token-cross',
      id: '00000000-0000-4000-a000-0000000000ff',
    });
    const signalChain = insertCaptureChain({ id: 'signal-1' });

    mockFromFn
      // 1) parent_shares (token lookup)
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      // 2) players (sender)
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))
      // 3) players (recipient)
      .mockReturnValueOnce(buildChain(RECIPIENT_PLAYER_CROSS))
      // 4) teams (sender's team for org_id check)
      .mockReturnValueOnce(buildChain(SENDER_TEAM_FULL))
      // 5) teams (recipient's team for org_id check)
      .mockReturnValueOnce(buildChain(RECIPIENT_TEAM_FULL_SAME_ORG))
      // 6) team_coaches (recipient's team's head coach)
      .mockReturnValueOnce(buildChain({ coach_id: RECIPIENT_COACH_ID, role: 'head_coach' }))
      // 7) teams (display row for the email — sender's team name)
      .mockReturnValueOnce(buildChain(SENDER_TEAM_ROW))
      // 8) parent_forward_signals (idempotency check)
      .mockReturnValueOnce(buildChain(null))
      // 9) parent_shares INSERT (mint recipient token)
      .mockReturnValueOnce(mintChain)
      // 10) sports (best-effort lookup for the email)
      .mockReturnValueOnce(buildChain({ slug: 'basketball', name: 'basketball' }))
      // 11) organizations (program name for the cross-team email)
      .mockReturnValueOnce(buildChain({ name: 'Riverside' }))
      // 12) parent_forward_signals INSERT (signal row)
      .mockReturnValueOnce(signalChain);

    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // The signal row carries cross_team = true.
    const signalInserts = signalChain._calls as Array<Record<string, unknown>>;
    expect(signalInserts).toHaveLength(1);
    expect(signalInserts[0].sender_player_id).toBe(SENDER_PLAYER_ID);
    expect(signalInserts[0].recipient_player_id).toBe(RECIPIENT_PLAYER_ID);
    expect(signalInserts[0].cross_team).toBe(true);
    // Team scope is the RECIPIENT's team for cross-team forwards so
    // downstream surfaces credit the receiving team.
    expect(signalInserts[0].team_id).toBe(RECIPIENT_TEAM_ID);

    // The minted recipient share is owned by the RECIPIENT's coach
    // (NOT the sender's coach). The receiving parent lands on HER own
    // kid's portal under HER own coach's voice.
    const mintInserts = mintChain._calls as Array<Record<string, unknown>>;
    expect(mintInserts).toHaveLength(1);
    expect(mintInserts[0].player_id).toBe(RECIPIENT_PLAYER_ID);
    expect(mintInserts[0].team_id).toBe(RECIPIENT_TEAM_ID);
    expect(mintInserts[0].coach_id).toBe(RECIPIENT_COACH_ID);

    // One email dispatched.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sendArg = mockSendEmail.mock.calls[0][0];
    expect(sendArg.to).toBe(RECIPIENT_PLAYER_CROSS.parent_email);
  });

  // ─── Same-team regression (0079 byte-identical) ────────────────────────────

  it('same-team happy path (regression): writes cross_team = false, returns 200', async () => {
    const mintChain = insertCaptureChain({
      share_token: 'recipient-token-same',
      id: '00000000-0000-4000-a000-0000000000fe',
    });
    const signalChain = insertCaptureChain({ id: 'signal-same' });

    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))
      .mockReturnValueOnce(buildChain(RECIPIENT_PLAYER_SAME))
      // For the same-team path the route's 0079 shape only reads
      // teams ONCE (for the display name). Keep the queue minimal.
      .mockReturnValueOnce(buildChain(SENDER_TEAM_ROW))
      .mockReturnValueOnce(buildChain(null)) // parent_forward_signals dedupe
      .mockReturnValueOnce(mintChain)
      // sports (best-effort) — the sender team has a sport_id.
      .mockReturnValueOnce(buildChain({ slug: 'basketball', name: 'basketball' }))
      .mockReturnValueOnce(signalChain);

    const res = await POST(
      makeRequest(defaultBody({ recipientPlayerId: RECIPIENT_PLAYER_SAME.id })),
    );
    expect(res.status).toBe(200);
    const signalInserts = signalChain._calls as Array<Record<string, unknown>>;
    expect(signalInserts).toHaveLength(1);
    expect(signalInserts[0].cross_team).toBe(false);
    expect(signalInserts[0].team_id).toBe(SENDER_TEAM_ID);
  });

  // ─── Cross-program rejection ──────────────────────────────────────────────

  it('returns 400 not_in_same_program when the recipient is in a DIFFERENT org_id', async () => {
    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))
      .mockReturnValueOnce(buildChain(OTHER_ORG_PLAYER))
      .mockReturnValueOnce(buildChain(SENDER_TEAM_FULL))
      .mockReturnValueOnce(buildChain(RECIPIENT_TEAM_FULL_DIFF_ORG));

    const res = await POST(
      makeRequest(defaultBody({ recipientPlayerId: OTHER_ORG_PLAYER_ID })),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('not_in_same_program');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── COPPA: response payload never leaks recipient contact info ────────────

  it('never returns recipient parent_email, surname, or recipient coach email/name in cross-team response', async () => {
    const mintChain = insertCaptureChain({
      share_token: 'recipient-token-cross',
      id: '00000000-0000-4000-a000-0000000000ff',
    });
    const signalChain = insertCaptureChain({ id: 'signal-1' });

    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))
      .mockReturnValueOnce(buildChain(RECIPIENT_PLAYER_CROSS))
      .mockReturnValueOnce(buildChain(SENDER_TEAM_FULL))
      .mockReturnValueOnce(buildChain(RECIPIENT_TEAM_FULL_SAME_ORG))
      .mockReturnValueOnce(buildChain({ coach_id: RECIPIENT_COACH_ID, role: 'head_coach' }))
      .mockReturnValueOnce(buildChain(SENDER_TEAM_ROW))
      .mockReturnValueOnce(buildChain(null))
      .mockReturnValueOnce(mintChain)
      .mockReturnValueOnce(buildChain({ slug: 'basketball', name: 'basketball' }))
      .mockReturnValueOnce(buildChain({ name: 'Riverside' }))
      .mockReturnValueOnce(signalChain);

    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    const blob = JSON.stringify(json);
    expect(blob).not.toContain(RECIPIENT_PLAYER_CROSS.parent_email);
    expect(blob).not.toContain('Devon Bear');
    expect(blob).not.toContain('Bears U12');
    expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(blob).not.toMatch(/parent_email/i);
  });

  // ─── Idempotency preserved ────────────────────────────────────────────────

  it('returns 429 on a re-tap of the same cross-team edge inside 7 days', async () => {
    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))
      .mockReturnValueOnce(buildChain(RECIPIENT_PLAYER_CROSS))
      .mockReturnValueOnce(buildChain(SENDER_TEAM_FULL))
      .mockReturnValueOnce(buildChain(RECIPIENT_TEAM_FULL_SAME_ORG))
      .mockReturnValueOnce(buildChain({ coach_id: RECIPIENT_COACH_ID, role: 'head_coach' }))
      .mockReturnValueOnce(buildChain(SENDER_TEAM_ROW))
      // Prior signal row found within the 7-day window.
      .mockReturnValueOnce(
        buildChain({
          id: 'signal-prior',
          sender_player_id: SENDER_PLAYER_ID,
          recipient_player_id: RECIPIENT_PLAYER_ID,
          cross_team: true,
          dispatched_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        }),
      );

    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('already_sent');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Cross-team minted URL belongs to the RECIPIENT's coach ───────────────

  it('the minted recipient share is owned by the recipient coach (NOT the sender coach)', async () => {
    const mintChain = insertCaptureChain({
      share_token: 'recipient-token-cross',
      id: '00000000-0000-4000-a000-0000000000ff',
    });
    const signalChain = insertCaptureChain({ id: 'signal-1' });

    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))
      .mockReturnValueOnce(buildChain(RECIPIENT_PLAYER_CROSS))
      .mockReturnValueOnce(buildChain(SENDER_TEAM_FULL))
      .mockReturnValueOnce(buildChain(RECIPIENT_TEAM_FULL_SAME_ORG))
      .mockReturnValueOnce(buildChain({ coach_id: RECIPIENT_COACH_ID, role: 'head_coach' }))
      .mockReturnValueOnce(buildChain(SENDER_TEAM_ROW))
      .mockReturnValueOnce(buildChain(null))
      .mockReturnValueOnce(mintChain)
      .mockReturnValueOnce(buildChain({ slug: 'basketball', name: 'basketball' }))
      .mockReturnValueOnce(buildChain({ name: 'Riverside' }))
      .mockReturnValueOnce(signalChain);

    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(200);
    const mintInserts = mintChain._calls as Array<Record<string, unknown>>;
    expect(mintInserts[0].coach_id).toBe(RECIPIENT_COACH_ID);
    expect(mintInserts[0].coach_id).not.toBe(SENDER_COACH_ID);
  });
});
