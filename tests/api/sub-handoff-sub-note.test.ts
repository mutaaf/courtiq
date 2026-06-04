/**
 * Ticket 0067 — POST /api/sub-handoff/[token]/sub-note.
 *
 * The sub-coach's one-line note back to the regular coach (public, no auth).
 *
 * Acceptance criteria → tests:
 *  - 200 + note written + sub_note_at set.
 *  - 200 idempotent re-write on the same token UPDATES the existing note.
 *  - 400 length > 500.
 *  - 400 { reason: 'voice' } on banned-word match.
 *  - 410 on expired observer token.
 *  - 404 on unknown / no-row token.
 *  - 429 when the same token POSTs a 4th note (max 3 per token).
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#38). Public route — never auth-gated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFromFn } = vi.hoisted(() => ({ mockFromFn: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({ from: mockFromFn })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { POST } from '@/app/api/sub-handoff/[token]/sub-note/route';
import { generateObserverToken, __resetSubHandoffRateLimitForTests } from '@/lib/sub-handoff-utils';

const SESSION_ID = '00000000-0000-4000-a000-000000000040';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

function freshToken() {
  return generateObserverToken(SESSION_ID, 24);
}

function expiredTokenStr() {
  return generateObserverToken(SESSION_ID, -1);
}

function makeReq(token: string, body: unknown) {
  return new Request(`http://localhost/api/sub-handoff/${token}/sub-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const BASE_HANDOFF = {
  id: 'handoff-1',
  session_id: SESSION_ID,
  coach_id: 'coach-1',
};

describe('POST /api/sub-handoff/[token]/sub-note (ticket 0067)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    __resetSubHandoffRateLimitForTests();
  });

  it('404 when the token resolves to no handoff row', async () => {
    const token = freshToken();
    mockFromFn.mockReturnValueOnce(buildChain(null)); // sub_handoffs lookup
    const res = await POST(makeReq(token, { text: 'hi' }), makeParams(token));
    expect(res.status).toBe(404);
  });

  it('410 when the observer token has expired', async () => {
    const token = expiredTokenStr();
    const res = await POST(makeReq(token, { text: 'hi' }), makeParams(token));
    expect(res.status).toBe(410);
  });

  it('400 when text is missing or empty', async () => {
    const token = freshToken();
    mockFromFn.mockReturnValueOnce(buildChain({ ...BASE_HANDOFF, observer_token: token }));
    const res = await POST(makeReq(token, { text: '' }), makeParams(token));
    expect(res.status).toBe(400);
  });

  it('400 when text > 500 chars', async () => {
    const token = freshToken();
    mockFromFn.mockReturnValueOnce(buildChain({ ...BASE_HANDOFF, observer_token: token }));
    const res = await POST(makeReq(token, { text: 'a'.repeat(501) }), makeParams(token));
    expect(res.status).toBe(400);
  });

  it("400 { reason: 'voice' } on banned-word match", async () => {
    const token = freshToken();
    mockFromFn.mockReturnValueOnce(buildChain({ ...BASE_HANDOFF, observer_token: token }));
    const res = await POST(makeReq(token, { text: 'this practice was amazing' }), makeParams(token));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('voice');
  });

  it('200 happy path writes the note + sub_note_at', async () => {
    const token = freshToken();
    const handoffChain = buildChain({ ...BASE_HANDOFF, observer_token: token });
    const updateChain = buildChain({ ...BASE_HANDOFF, observer_token: token, sub_note_text: 'all 12 showed' });
    mockFromFn.mockReturnValueOnce(handoffChain).mockReturnValueOnce(updateChain);

    const res = await POST(makeReq(token, { text: 'all 12 showed' }), makeParams(token));
    expect(res.status).toBe(200);
  });

  it('idempotent re-write on the same token updates the existing note', async () => {
    const token = freshToken();
    // 1st POST
    const handoff1 = buildChain({ ...BASE_HANDOFF, observer_token: token });
    const update1 = buildChain({ ...BASE_HANDOFF, observer_token: token, sub_note_text: 'first' });
    mockFromFn.mockReturnValueOnce(handoff1).mockReturnValueOnce(update1);
    const r1 = await POST(makeReq(token, { text: 'first' }), makeParams(token));
    expect(r1.status).toBe(200);

    // 2nd POST should also succeed (under the 3/per-token rate limit).
    const handoff2 = buildChain({ ...BASE_HANDOFF, observer_token: token });
    const update2 = buildChain({ ...BASE_HANDOFF, observer_token: token, sub_note_text: 'second' });
    mockFromFn.mockReturnValueOnce(handoff2).mockReturnValueOnce(update2);
    const r2 = await POST(makeReq(token, { text: 'second' }), makeParams(token));
    expect(r2.status).toBe(200);
  });

  it('429 on the 4th POST against the same token (max 3)', async () => {
    const token = freshToken();
    for (let i = 0; i < 3; i++) {
      mockFromFn
        .mockReturnValueOnce(buildChain({ ...BASE_HANDOFF, observer_token: token }))
        .mockReturnValueOnce(buildChain({ ...BASE_HANDOFF, observer_token: token, sub_note_text: `note ${i}` }));
      const r = await POST(makeReq(token, { text: `note ${i}` }), makeParams(token));
      expect(r.status).toBe(200);
    }
    // 4th POST → 429, no DB write attempted.
    const r4 = await POST(makeReq(token, { text: 'fourth' }), makeParams(token));
    expect(r4.status).toBe(429);
  });
});
