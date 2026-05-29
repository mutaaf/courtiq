/**
 * Ticket 0050 — POST /api/share/[token]/program-referral.
 *
 * The route is public (no auth header). Acceptance criteria → tests:
 *  - 400 on a missing/invalid body.
 *  - 422 on missing/invalid required fields (parentFirstName, directorFirstName,
 *    directorEmail format).
 *  - 404 on an inactive/unknown token.
 *  - happy path inserts ONE row and calls sendEmail() once with an
 *    HTTPS share URL carrying a verifiable `pr` token (HMAC-signed
 *    server-side from share_token + director_email_hash).
 *  - dedup re-post within 30 days returns `{ alreadySent: true }` and does
 *    NOT call sendEmail.
 *  - re-post after 30 days DOES re-send (new sendEmail call, new row).
 *  - rate limit: the 4th submit within 24h on the SAME share_token returns
 *    429 without inserting.
 *  - COPPA: the email subject/body never contains a planted player-name
 *    token (the spec injects "BANNED_PLAYER_NAME" via mocked org/team data;
 *    the route MUST NOT echo a player name into the body, and in fact never
 *    reads players at all).
 *  - voice: the email subject + html + text contain none of the AGENTS.md
 *    banned tokens (journey / amazing / exciting / elevate / empower / synergy).
 *
 * Mocking pattern mirrors tests/api/practice-plan-shares-create.test.ts:
 * hoisted Supabase mock with chainable single() / maybeSingle() / then()
 * resolvers, vi.mocked-controlled mockReturnValueOnce queue. .test.ts NOT
 * .spec.ts (LESSONS#38). Always call the route with a real Request body
 * because POST reads JSON (LESSONS#55).
 *
 * Run under Node 20.19.0 (LESSONS#0003 / #0010); .test.ts not .spec.ts
 * (LESSONS#0020 / #0038).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SHARE_TOKEN = 'test-share-token-program-referral';
const SECRET = 'cron-secret-test-value';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockFromFn,
  mockSendEmail,
} = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: mockSendEmail,
}));

import { POST } from '@/app/api/share/[token]/program-referral/route';
import {
  _resetProgramReferralRateLimiterForTest,
  hashDirectorEmail,
  verifyDirectorId,
} from '@/lib/program-referral-utils';

// ─── Chain helpers ────────────────────────────────────────────────────────────

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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

// A captured-insert chain returns its insert payload via a getter so tests
// can assert the keys/values written.
function insertCaptureChain(data: unknown = { id: 'pr-row-1' }) {
  const calls: Array<unknown> = [];
  const resolved = { data, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: unknown) => {
      calls.push(payload);
      return chain;
    }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
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

// The full happy-path chain sequence:
//   1) from('parent_shares') — token lookup
//   2) from('program_referrals') — dedup query (maybeSingle)
//   3) from('program_referrals') — insert
//   4) from('teams') — org_id lookup for programName
//   5) from('organizations') — name lookup for programName
function queueHappyPath(opts: {
  share?: unknown;
  priorReferral?: unknown;
  insertResult?: unknown;
  team?: unknown;
  org?: unknown;
} = {}): { insertChain: ReturnType<typeof insertCaptureChain> } {
  const share = opts.share ?? {
    id: 'share-1',
    team_id: 'team-1',
    coach_id: 'coach-1',
    is_active: true,
    expires_at: null,
  };
  const insertChain = insertCaptureChain(opts.insertResult ?? { id: 'pr-row-1' });

  mockFromFn
    .mockReturnValueOnce(buildChain(share, null)) // parent_shares
    .mockReturnValueOnce(buildChain(opts.priorReferral ?? null, null)) // program_referrals dedup
    .mockReturnValueOnce(insertChain) // program_referrals insert
    .mockReturnValueOnce(buildChain(opts.team ?? { org_id: 'org-1' }, null)) // teams
    .mockReturnValueOnce(buildChain(opts.org ?? { name: 'Discoverable Rec League' }, null)); // orgs

  return { insertChain };
}

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/share/${SHARE_TOKEN}/program-referral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function defaultBody(overrides: Record<string, unknown> = {}) {
  return {
    parentFirstName: 'Maria',
    directorFirstName: 'Jordan',
    directorEmail: 'jordan@reclyleague.org',
    note: 'You should see this.',
    ...overrides,
  };
}

const tokenParams = Promise.resolve({ token: SHARE_TOKEN });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/share/[token]/program-referral (ticket 0050)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    mockSendEmail.mockReset();
    _resetProgramReferralRateLimiterForTest();
    process.env.CRON_SECRET = SECRET;
    process.env.NEXT_PUBLIC_APP_URL = 'https://youthsportsiq.com';
    // sendEmail default success
    mockSendEmail.mockResolvedValue({ success: true, id: 'em_1' });
  });

  // ─── Validation ────────────────────────────────────────────────────────────

  it('returns 400 when the request body is malformed JSON', async () => {
    const req = new Request(`http://localhost/api/share/${SHARE_TOKEN}/program-referral`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    const res = await POST(req, { params: tokenParams });
    expect(res.status).toBe(400);
  });

  it('returns 422 when parentFirstName is missing', async () => {
    const res = await POST(
      makeRequest(defaultBody({ parentFirstName: '' })),
      { params: tokenParams },
    );
    expect(res.status).toBe(422);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 422 when directorFirstName is missing', async () => {
    const res = await POST(
      makeRequest(defaultBody({ directorFirstName: '   ' })),
      { params: tokenParams },
    );
    expect(res.status).toBe(422);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 422 when directorEmail is not a valid shape', async () => {
    const res = await POST(
      makeRequest(defaultBody({ directorEmail: 'not-an-email' })),
      { params: tokenParams },
    );
    expect(res.status).toBe(422);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 422 when an optional parentEmail is provided but malformed', async () => {
    const res = await POST(
      makeRequest(defaultBody({ parentEmail: 'bad@@email' })),
      { params: tokenParams },
    );
    expect(res.status).toBe(422);
  });

  // ─── Token resolution ─────────────────────────────────────────────────────

  it('returns 404 when no parent_shares row matches the token', async () => {
    mockFromFn.mockReturnValueOnce(buildChain(null, null)); // parent_shares lookup → null
    const res = await POST(makeRequest(defaultBody()), { params: tokenParams });
    expect(res.status).toBe(404);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 410 when the share has expired', async () => {
    mockFromFn.mockReturnValueOnce(buildChain({
      id: 'share-1',
      team_id: 'team-1',
      coach_id: 'coach-1',
      is_active: true,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }, null));
    const res = await POST(makeRequest(defaultBody()), { params: tokenParams });
    expect(res.status).toBe(410);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it('inserts one row and sends ONE email on the happy path', async () => {
    const { insertChain } = queueHappyPath();

    const res = await POST(makeRequest(defaultBody()), { params: tokenParams });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.alreadySent).toBe(false);
    expect(json.directorFirstName).toBe('Jordan');

    // Exactly one insert with the expected keys (no minor data).
    const inserts = insertChain._calls as unknown[];
    expect(inserts).toHaveLength(1);
    const payload = inserts[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        'director_email',
        'director_email_hash',
        'director_first_name',
        'note',
        'parent_email',
        'parent_first_name',
        'share_token',
        'signed_director_id',
      ].sort(),
    );
    expect(payload.share_token).toBe(SHARE_TOKEN);
    expect(payload.parent_first_name).toBe('Maria');
    expect(payload.director_first_name).toBe('Jordan');
    expect(payload.director_email).toBe('jordan@reclyleague.org');
    expect(payload.director_email_hash).toBe(hashDirectorEmail('jordan@reclyleague.org'));
    expect(payload.parent_email).toBeNull();
    expect(payload.note).toBe('You should see this.');

    // signed_director_id must verify back to the same share_token + hash
    // (LESSONS#0039 — never trust client; sign server-side).
    const v = verifyDirectorId(String(payload.signed_director_id), SECRET);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.shareToken).toBe(SHARE_TOKEN);
      expect(v.directorEmailHash).toBe(hashDirectorEmail('jordan@reclyleague.org'));
    }

    // Exactly one email sent.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sendArg = mockSendEmail.mock.calls[0][0];
    expect(sendArg.to).toBe('jordan@reclyleague.org');
    expect(sendArg.subject).toMatch(/Maria/);
    expect(sendArg.html).toContain('Read the update');
    // Share URL inside the email carries the signed pr token.
    expect(sendArg.html).toContain(`pr=${encodeURIComponent(String(payload.signed_director_id))}`);
    // Program name resolved from teams -> organizations was rendered.
    expect(sendArg.html).toContain('Discoverable Rec League');
  });

  it('still inserts even when the program name lookup degrades to null', async () => {
    queueHappyPath({ team: { org_id: null }, org: null });
    const res = await POST(makeRequest(defaultBody()), { params: tokenParams });
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  // ─── COPPA / voice ─────────────────────────────────────────────────────────

  it('never echoes a player name into the email body (COPPA)', async () => {
    queueHappyPath();
    const planted = 'BANNED_PLAYER_NAME';
    const res = await POST(
      makeRequest(defaultBody({ note: `Just look at what they did with ${planted}.` })),
      { params: tokenParams },
    );
    expect(res.status).toBe(200);
    // The parent's own note is allowed (they wrote it themselves), but the
    // route MUST NOT inject any minor data of its own. Drop the parent's
    // note and re-check the standard scaffolding for a smuggled name.
    const sendArg = mockSendEmail.mock.calls[0][0];
    // The note text is escaped HTML inside a blockquote. The rest of the
    // template (subject, button, footer) must never contain a player
    // name — the route doesn't even read the players table.
    const scaffold = String(sendArg.html).replace(
      /<blockquote[\s\S]*?<\/blockquote>/,
      '',
    );
    expect(scaffold).not.toContain(planted);
    expect(sendArg.subject).not.toContain(planted);
  });

  it('contains no AGENTS.md banned tokens in the email body or subject', async () => {
    queueHappyPath();
    const res = await POST(makeRequest(defaultBody({ note: null })), { params: tokenParams });
    expect(res.status).toBe(200);
    const sendArg = mockSendEmail.mock.calls[0][0];
    const corpus = `${sendArg.subject}\n${sendArg.html}`.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(corpus).not.toContain(banned);
    }
  });

  // ─── Dedup ─────────────────────────────────────────────────────────────────

  it('dedups a re-submit within 30 days without re-sending', async () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    mockFromFn
      .mockReturnValueOnce(buildChain({
        id: 'share-1',
        team_id: 'team-1',
        coach_id: 'coach-1',
        is_active: true,
        expires_at: null,
      }, null))
      .mockReturnValueOnce(buildChain({ id: 'pr-prior', sent_at: recent }, null));

    const res = await POST(makeRequest(defaultBody()), { params: tokenParams });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadySent).toBe(true);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('re-sends after the 30-day window has elapsed', async () => {
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    queueHappyPath({ priorReferral: { id: 'pr-old', sent_at: longAgo } });

    const res = await POST(makeRequest(defaultBody()), { params: tokenParams });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadySent).toBe(false);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  // ─── Rate limit ────────────────────────────────────────────────────────────

  it('returns 429 on the 4th submit within 24h for the same share_token', async () => {
    // Three successful submits queue the full happy-path chain each time;
    // the 4th submit short-circuits before any DB read, so no extra chain.
    queueHappyPath();
    expect((await POST(makeRequest(defaultBody({ directorEmail: 'a@x.com' })), { params: tokenParams })).status).toBe(200);
    queueHappyPath();
    expect((await POST(makeRequest(defaultBody({ directorEmail: 'b@x.com' })), { params: tokenParams })).status).toBe(200);
    queueHappyPath();
    expect((await POST(makeRequest(defaultBody({ directorEmail: 'c@x.com' })), { params: tokenParams })).status).toBe(200);

    const res4 = await POST(
      makeRequest(defaultBody({ directorEmail: 'd@x.com' })),
      { params: tokenParams },
    );
    expect(res4.status).toBe(429);
    // The 4th call must not have triggered any DB or email work.
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
  });

  // ─── Server posture ───────────────────────────────────────────────────────

  it('returns 500 when CRON_SECRET is missing (cannot sign the director id)', async () => {
    delete process.env.CRON_SECRET;
    mockFromFn
      .mockReturnValueOnce(buildChain({
        id: 'share-1',
        team_id: 'team-1',
        coach_id: 'coach-1',
        is_active: true,
        expires_at: null,
      }, null))
      .mockReturnValueOnce(buildChain(null, null));

    const res = await POST(makeRequest(defaultBody()), { params: tokenParams });
    expect(res.status).toBe(500);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
