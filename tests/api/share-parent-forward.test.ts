/**
 * Ticket 0079 — POST /api/share/parent-forward.
 *
 * Public route (the parent-portal share token IS the contract).
 * Accepts the new ParentForwardOnTeamButton sheet's payload:
 *   { shareToken, recipientPlayerId, senderFirstName, note }
 * Validates, resolves the sender's player + team via the existing
 * parent_shares contract, verifies the recipient is on the SAME team,
 * reads the recipient's parent_email server-side, mints a new parent-
 * portal share token for the RECIPIENT's player, dispatches ONE email
 * via the existing sendEmail() pipeline, and writes ONE row to
 * parent_forward_signals (idempotent on (sender_player_id,
 * recipient_player_id) via the 0079 UNIQUE constraint).
 *
 * COPPA: the response NEVER returns the sender's OR the recipient's
 * parent_email. The signal row stores ONLY player-id edges +
 * team_id; never a name, an email, a phone, or the note text.
 *
 * Mocks: hoisted Supabase + sendEmail (LESSONS#0049 / #0092). The
 * route's reads happen in a fixed order, so `mockReturnValueOnce` is
 * the right shape (not `mockImplementation((table) => ...)`).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SHARE_TOKEN = 'test-share-token-e2e-001';

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

// ─── Chain helpers ────────────────────────────────────────────────────────────

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
  const calls: Array<unknown> = [];
  const resolved = { data, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: unknown) => {
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

const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const SENDER_PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const RECIPIENT_PLAYER_ID = '00000000-0000-4000-a000-0000000000e1';
const OFF_TEAM_PLAYER_ID = '00000000-0000-4000-a000-0000000000e9';

const SHARE_ROW = {
  id: '00000000-0000-4000-a000-000000000060',
  player_id: SENDER_PLAYER_ID,
  team_id: TEAM_ID,
  coach_id: '00000000-0000-4000-a000-000000000001',
  is_active: true,
  expires_at: null,
};

const SENDER_PLAYER = {
  id: SENDER_PLAYER_ID,
  name: 'Maya Walker',
  team_id: TEAM_ID,
};

const RECIPIENT_PLAYER = {
  id: RECIPIENT_PLAYER_ID,
  name: 'Liam Carter',
  team_id: TEAM_ID,
  parent_email: 'liam-parent@e2e.test',
};

const OFF_TEAM_PLAYER = {
  id: OFF_TEAM_PLAYER_ID,
  name: 'Kai Other',
  team_id: '00000000-0000-4000-a000-0000000000ff',
  parent_email: 'kai-parent@e2e.test',
};

const TEAM_ROW = {
  id: TEAM_ID,
  name: 'Hawks U10',
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
    note: "I thought you'd want to read this — Maya and Liam are on the same team.",
    ...overrides,
  };
}

/**
 * Queue the happy-path chain sequence:
 *   1) parent_shares — share-token lookup
 *   2) players       — sender player (single)
 *   3) players       — recipient player (single, by id + same team_id check)
 *   4) teams         — team display name for the email
 *   5) parent_forward_signals — prior signal check (last 7 days)
 *   6) parent_shares — INSERT the recipient's new portal token
 *   7) parent_forward_signals — INSERT the signal row
 */
function queueHappyPath(opts: {
  share?: unknown;
  sender?: unknown;
  recipient?: unknown;
  team?: unknown;
  prior?: unknown;
  mintResult?: unknown;
} = {}) {
  const mintChain = insertCaptureChain(opts.mintResult ?? {
    share_token: 'recipient-token-001',
    id: '00000000-0000-4000-a000-0000000000ff',
  });
  const signalChain = insertCaptureChain({ id: 'signal-row-1' });

  mockFromFn
    .mockReturnValueOnce(buildChain(opts.share ?? SHARE_ROW))           // parent_shares
    .mockReturnValueOnce(buildChain(opts.sender ?? SENDER_PLAYER))      // players (sender)
    .mockReturnValueOnce(buildChain(opts.recipient ?? RECIPIENT_PLAYER)) // players (recipient)
    .mockReturnValueOnce(buildChain(opts.team ?? TEAM_ROW))             // teams
    .mockReturnValueOnce(buildChain(opts.prior ?? null))                // parent_forward_signals (dedup)
    .mockReturnValueOnce(mintChain)                                     // parent_shares INSERT
    .mockReturnValueOnce(signalChain);                                  // parent_forward_signals INSERT
  return { mintChain, signalChain };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/share/parent-forward (ticket 0079)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true, id: 'em_pf1' });
    process.env.NEXT_PUBLIC_APP_URL = 'https://youthsportsiq.com';
  });

  // ─── Validation ────────────────────────────────────────────────────────────

  it('returns 400 on malformed JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/share/parent-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-json',
      }),
    );
    expect(res.status).toBe(400);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 400 when shareToken is missing', async () => {
    const res = await POST(makeRequest(defaultBody({ shareToken: '' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 when recipientPlayerId is missing', async () => {
    const res = await POST(makeRequest(defaultBody({ recipientPlayerId: '' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 when senderFirstName contains non-alpha (sanitizer)', async () => {
    const res = await POST(
      makeRequest(defaultBody({ senderFirstName: 'Sarah123' })),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when senderFirstName exceeds 30 chars', async () => {
    const res = await POST(
      makeRequest(defaultBody({ senderFirstName: 'S'.repeat(31) })),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when note is empty after sanitization', async () => {
    const res = await POST(makeRequest(defaultBody({ note: '   ' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 when note exceeds 200 chars', async () => {
    const res = await POST(
      makeRequest(defaultBody({ note: 'x'.repeat(201) })),
    );
    expect(res.status).toBe(400);
  });

  // ─── Token resolution ─────────────────────────────────────────────────────

  it('returns 400 invalid_share_token on a tampered/unknown token', async () => {
    mockFromFn.mockReturnValueOnce(buildChain(null)); // parent_shares not found
    const res = await POST(
      makeRequest(defaultBody({ shareToken: 'bogus' })),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('invalid_share_token');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Same-team contract ───────────────────────────────────────────────────

  it('returns 400 not_in_same_program when the recipient lives on a different team and a different program (cross-team widening, ticket 0080)', async () => {
    // The route's 0079 prose said "not_on_same_team" — ticket 0080
    // widens it: same `org_id` is now allowed (the cross-team-same-
    // program contract). When the orgs differ, the route returns
    // `not_in_same_program` instead. The OFF_TEAM_PLAYER fixture
    // lives in a DIFFERENT org so the new error reads.
    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))         // parent_shares
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))     // players (sender)
      .mockReturnValueOnce(buildChain(OFF_TEAM_PLAYER))   // players (recipient — off team)
      .mockReturnValueOnce(buildChain({ id: TEAM_ID, name: 'Hawks U10', sport_id: null, org_id: 'org-A' }))    // teams (sender full)
      .mockReturnValueOnce(buildChain({ id: '00000000-0000-4000-a000-0000000000ff', name: 'Wolves', sport_id: null, org_id: 'org-B' })); // teams (recipient full, different org)

    const res = await POST(
      makeRequest(defaultBody({ recipientPlayerId: OFF_TEAM_PLAYER_ID })),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('not_in_same_program');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── parent_email gate ────────────────────────────────────────────────────

  it('returns 400 no_parent_email_on_file when the recipient has no parent_email', async () => {
    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))
      .mockReturnValueOnce(buildChain({ ...RECIPIENT_PLAYER, parent_email: null }));

    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('no_parent_email_on_file');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it('happy path: mints a recipient portal token, writes ONE signal row, sends ONE email, returns 200', async () => {
    const { mintChain, signalChain } = queueHappyPath();
    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Exactly one signal row written with the documented allow-list of columns.
    // Ticket 0080 widened the allow-list with `cross_team` (boolean
    // flag) per LESSONS#0103 — every 0079 caller stays byte-identical
    // EXCEPT the new flag, which is `false` on the same-team path.
    const signalInserts = signalChain._calls as unknown[];
    expect(signalInserts).toHaveLength(1);
    const signalPayload = signalInserts[0] as Record<string, unknown>;
    expect(Object.keys(signalPayload).sort()).toEqual(
      ['cross_team', 'recipient_player_id', 'sender_player_id', 'team_id'].sort(),
    );
    expect(signalPayload.sender_player_id).toBe(SENDER_PLAYER_ID);
    expect(signalPayload.recipient_player_id).toBe(RECIPIENT_PLAYER_ID);
    expect(signalPayload.team_id).toBe(TEAM_ID);
    // Same-team forward inherits the default `false` (LESSONS#0103).
    expect(signalPayload.cross_team).toBe(false);

    // A recipient parent_shares token was minted. The mint payload references
    // the RECIPIENT's player_id (NOT the sender's) — the receiving parent
    // lands on HER OWN kid's portal session per the COPPA contract.
    const mintInserts = mintChain._calls as Record<string, unknown>[];
    expect(mintInserts).toHaveLength(1);
    expect(mintInserts[0].player_id).toBe(RECIPIENT_PLAYER_ID);
    expect(mintInserts[0].team_id).toBe(TEAM_ID);

    // Exactly one email sent. The to: header is the recipient's parent_email
    // resolved server-side (NEVER exposed to the sender via the response).
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sendArg = mockSendEmail.mock.calls[0][0];
    expect(sendArg.to).toBe(RECIPIENT_PLAYER.parent_email);
    // The subject names the team and the sender.
    expect(sendArg.subject).toMatch(/Sarah/);
    expect(sendArg.subject).toMatch(/Hawks U10/);
  });

  // ─── COPPA: response never leaks parent contact info ──────────────────────

  it('never returns the recipient parent_email in the response payload (COPPA)', async () => {
    queueHappyPath();
    const res = await POST(makeRequest(defaultBody()));
    const json = await res.json();
    // Stringify the whole response and assert no email-shape leak.
    const blob = JSON.stringify(json);
    expect(blob).not.toContain(RECIPIENT_PLAYER.parent_email);
    expect(blob).not.toMatch(/parent_email/i);
    expect(blob).not.toMatch(/parent_phone/i);
    expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });

  it('the response payload contains no player name, no team name, no contact info', async () => {
    queueHappyPath();
    const res = await POST(makeRequest(defaultBody()));
    const json = await res.json();
    const blob = JSON.stringify(json);
    expect(blob).not.toContain('Liam Carter');
    expect(blob).not.toContain('Maya Walker');
    expect(blob).not.toContain('Hawks U10');
  });

  // ─── Idempotency ──────────────────────────────────────────────────────────

  it('returns 429 when the same sender → recipient edge already fired in the last 7 days', async () => {
    // Prior signal row found in the 7-day window.
    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))
      .mockReturnValueOnce(buildChain(RECIPIENT_PLAYER))
      .mockReturnValueOnce(buildChain(TEAM_ROW))
      .mockReturnValueOnce(
        buildChain({
          id: 'signal-prior-1',
          sender_player_id: SENDER_PLAYER_ID,
          recipient_player_id: RECIPIENT_PLAYER_ID,
          dispatched_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        }),
      );

    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('already_sent');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── COPPA: column allow-list ─────────────────────────────────────────────

  it('reads ONLY the allow-listed columns from players (never DOB/medical/jersey)', async () => {
    // Plant noise on the recipient row — the response payload must
    // never echo it.
    const recipientWithPlanted = {
      ...RECIPIENT_PLAYER,
      date_of_birth: '2015-06-01',
      medical_notes: 'mild asthma',
      jersey_number: 23,
      parent_phone: '+1-555-0100',
    };
    mockFromFn
      .mockReturnValueOnce(buildChain(SHARE_ROW))
      .mockReturnValueOnce(buildChain(SENDER_PLAYER))
      .mockReturnValueOnce(buildChain(recipientWithPlanted))
      .mockReturnValueOnce(buildChain(TEAM_ROW))
      .mockReturnValueOnce(buildChain(null))
      .mockReturnValueOnce(insertCaptureChain({ share_token: 'r-tok', id: 'r-id' }))
      .mockReturnValueOnce(insertCaptureChain({ id: 'signal-1' }));

    const res = await POST(makeRequest(defaultBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    const blob = JSON.stringify(json);
    expect(blob).not.toContain('2015-06-01');
    expect(blob).not.toContain('mild asthma');
    expect(blob).not.toContain('23');
    expect(blob).not.toContain('555-0100');
  });

  // ─── Tier-gate contract ──────────────────────────────────────────────────

  it('does NOT import @/lib/tier (the surface is not tier-gated)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const raw = readFileSync(
      join(process.cwd(), 'src/app/api/share/parent-forward/route.ts'),
      'utf8',
    );
    // Strip /** ... */ blocks then `//` line comments — the route's
    // docstring legitimately names the tier module to document why it
    // is omitted (LESSONS#0023 / #0088).
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(code).not.toMatch(/from\s+['"]@\/lib\/tier['"]/);
    expect(code).not.toMatch(/\bcanAccess\b/);
  });
});
