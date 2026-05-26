/**
 * Ticket 0042 — POST /api/cron/coach-quiet-check-in: the polite "still
 * coaching this season?" email + one-tap pause link.
 *
 * Each AC box maps to a case:
 *  (auth) 401 without/with-wrong bearer; 200 with the result shape on valid.
 *  (eligibility) a coach 15 days quiet, no pause → one email.
 *  (eligibility) a coach 10 days quiet → no email (not quiet enough yet).
 *  (eligibility) a coach 15 days quiet whose paused_until is 20 days out → no
 *                email (paused coaches are silent).
 *  (eligibility) a coach 15 days quiet whose dedup key was set 5 days ago →
 *                no email.
 *  (eligibility) a coach who was emailed 35 days ago is eligible again.
 *  (email) the rendered HTML contains BOTH "Pause for 30 days" linking to
 *          /account/pause?token=… AND "I'm still coaching" linking to /account;
 *          the token verifies and decodes back to the coach + a target ~30
 *          days out.
 *  (email) the subject is `Still coaching this season?`.
 *  (COPPA) the rendered HTML contains no player-name token.
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

import { POST as cronPost } from '@/app/api/cron/coach-quiet-check-in/route';
import { verifyPauseToken } from '@/lib/coach-pause-utils';

// ─── In-memory data store + chainable mock ────────────────────────────────────

interface Coach {
  id: string;
  email: string;
  full_name: string;
  preferences: Record<string, unknown> | null;
  paused_until: string | null;
  last_active_at: string | null;
  created_at: string;
}

const store: {
  coaches: Coach[];
  prefsWrites: Array<{ coachId: string; preferences: Record<string, unknown> }>;
} = { coaches: [], prefsWrites: [] };

function clearStore() {
  store.coaches = [];
  store.prefsWrites = [];
}

function buildCoachesChain() {
  let _ordered: Coach[] = [...store.coaches];
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn(() => {
      _ordered = [..._ordered].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return chain;
    }),
    range: vi.fn((from: number, to: number) =>
      Promise.resolve({ data: _ordered.slice(from, to + 1), error: null }),
    ),
    update: vi.fn((patch: { preferences: Record<string, unknown> }) => ({
      eq: vi.fn((_col: string, id: string) => {
        store.prefsWrites.push({ coachId: id, preferences: patch.preferences });
        const c = store.coaches.find((x) => x.id === id);
        if (c) c.preferences = patch.preferences;
        return Promise.resolve({ error: null });
      }),
    })),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  clearStore();
  process.env.CRON_SECRET = 'test-secret-coach-quiet';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') return buildCoachesChain();
    throw new Error(`unexpected table read: ${table}`);
  });

  mockSendEmail.mockResolvedValue({ success: true, id: 'mock-email-id' });
});

function authHeaders(bearer = process.env.CRON_SECRET ?? 'test-secret-coach-quiet') {
  return { authorization: `Bearer ${bearer}` };
}

function makeRequest(headers: Record<string, string> = authHeaders()) {
  return new Request('http://localhost/api/cron/coach-quiet-check-in', {
    method: 'POST',
    headers,
  });
}

const ORIG_CRON_SECRET = process.env.CRON_SECRET;

afterAll(() => {
  if (ORIG_CRON_SECRET == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIG_CRON_SECRET;
});

const DAY = 24 * 60 * 60 * 1000;
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}
function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString();
}

// ─── auth ─────────────────────────────────────────────────────────────────────

describe('POST /api/cron/coach-quiet-check-in — auth', () => {
  it('401 on missing bearer; no DB write', async () => {
    const res = await cronPost(makeRequest({}));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(store.prefsWrites).toEqual([]);
  });

  it('401 on wrong bearer; no DB write', async () => {
    const res = await cronPost(makeRequest({ authorization: 'Bearer no' }));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(store.prefsWrites).toEqual([]);
  });

  it('200 with the result shape on valid bearer', async () => {
    const res = await cronPost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      sent: expect.any(Number),
      skipped: expect.any(Number),
      errors: expect.any(Number),
    });
  });
});

// ─── eligibility ──────────────────────────────────────────────────────────────

describe('POST /api/cron/coach-quiet-check-in — eligibility', () => {
  it('emails a coach 15 days quiet with no pause and no recent dedup', async () => {
    store.coaches = [
      {
        id: 'coach-q1',
        email: 'quiet@example.test',
        full_name: 'Quiet Coach',
        preferences: {},
        paused_until: null,
        last_active_at: daysAgoIso(15),
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const res = await cronPost(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(call.to).toBe('quiet@example.test');
  });

  it('does NOT email a coach who is only 10 days quiet', async () => {
    store.coaches = [
      {
        id: 'coach-fresh',
        email: 'fresh@example.test',
        full_name: 'Fresh Coach',
        preferences: {},
        paused_until: null,
        last_active_at: daysAgoIso(10),
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does NOT email a coach who is quiet but currently paused', async () => {
    store.coaches = [
      {
        id: 'coach-paused',
        email: 'paused@example.test',
        full_name: 'Paused Coach',
        preferences: {},
        paused_until: daysFromNowIso(20),
        last_active_at: daysAgoIso(40),
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does NOT email a coach whose dedup key was set 5 days ago', async () => {
    const recentKey = new Date(Date.now() - 5 * DAY)
      .toISOString()
      .slice(0, 10); // YYYY-MM-DD
    store.coaches = [
      {
        id: 'coach-dedup',
        email: 'dedup@example.test',
        full_name: 'Dedup Coach',
        preferences: { [`quiet_check_in_${recentKey}`]: true },
        paused_until: null,
        last_active_at: daysAgoIso(40),
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('emails a coach whose dedup key is 35 days old (eligible again)', async () => {
    const oldKey = new Date(Date.now() - 35 * DAY).toISOString().slice(0, 10);
    store.coaches = [
      {
        id: 'coach-resurfaced',
        email: 'again@example.test',
        full_name: 'Returning Coach',
        preferences: { [`quiet_check_in_${oldKey}`]: true },
        paused_until: null,
        last_active_at: daysAgoIso(30),
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    await cronPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('writes a fresh dedup key after a successful send', async () => {
    store.coaches = [
      {
        id: 'coach-dedup-write',
        email: 'ddw@example.test',
        full_name: 'DDW Coach',
        preferences: {},
        paused_until: null,
        last_active_at: daysAgoIso(20),
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    await cronPost(makeRequest());
    const write = store.prefsWrites.find((w) => w.coachId === 'coach-dedup-write');
    expect(write).toBeDefined();
    const today = new Date().toISOString().slice(0, 10);
    expect((write!.preferences as Record<string, unknown>)[`quiet_check_in_${today}`]).toBe(true);
  });
});

// ─── email content ────────────────────────────────────────────────────────────

describe('POST /api/cron/coach-quiet-check-in — email content', () => {
  function seedOneEligible() {
    store.coaches = [
      {
        id: 'coach-email-1',
        email: 'subject@example.test',
        full_name: 'Sam Rivers',
        preferences: {},
        paused_until: null,
        last_active_at: daysAgoIso(15),
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
  }

  it("the subject is `Still coaching this season?`", async () => {
    seedOneEligible();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { subject: string };
    expect(call.subject).toBe('Still coaching this season?');
  });

  it('greets the coach by first name only (COPPA-adjacent privacy)', async () => {
    seedOneEligible();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(call.html).toMatch(/\bSam\b/);
    // Last name must not appear — first-name-only greeting.
    expect(call.html).not.toMatch(/\bRivers\b/);
  });

  it('embeds a /account/pause?token=… link whose token verifies for this coach', async () => {
    seedOneEligible();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { html: string };

    const m = call.html.match(/\/account\/pause\?token=([A-Za-z0-9._%\-]+)/);
    expect(m).not.toBeNull();
    const token = decodeURIComponent(m![1]);
    const result = verifyPauseToken(token, process.env.CRON_SECRET!);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.coachId).toBe('coach-email-1');
      // The target is ~30 days out. Allow a 1-day fudge for cron clock skew.
      const target = new Date(result.pausedUntilIso).getTime();
      const expected = Date.now() + 30 * DAY;
      expect(Math.abs(target - expected)).toBeLessThan(2 * DAY);
    }
  });

  it('rejects a tampered version of the email token', async () => {
    seedOneEligible();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    const m = call.html.match(/\/account\/pause\?token=([A-Za-z0-9._%\-]+)/);
    expect(m).not.toBeNull();
    const token = decodeURIComponent(m![1]);
    // Replace the coachId prefix with a different value, keeping the rest of
    // the token intact — the verify must recompute the HMAC over the new
    // payload and reject (LESSONS#39 family — never trust a client-supplied
    // identifier).
    const realCoachId = 'coach-email-1';
    const fakeCoachId = '00000000-0000-4000-a000-000000009999';
    const tampered = fakeCoachId + token.slice(realCoachId.length);
    expect(verifyPauseToken(tampered, process.env.CRON_SECRET!).ok).toBe(false);
  });

  it("includes the symmetric `I'm still coaching` button linking to /account", async () => {
    seedOneEligible();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    // Both CTAs render so the coach has a one-tap "yes I'm still coaching"
    // path that's not just "ignore the email". The literal apostrophe is
    // HTML-escaped to `&#39;` in the rendered output, so tolerate either.
    expect(call.html).toMatch(/href="[^"]*\/account"/);
    expect(call.html).toMatch(/i(?:'|&#39;)m still coaching/i);
    expect(call.html).toMatch(/pause for 30 days/i);
  });

  it('uses positive voice instruction in the template — no banned hype words appear', async () => {
    // LESSONS#0023: instruct positively. The rendered HTML must not contain
    // breathless hype words.
    seedOneEligible();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(call.html.toLowerCase()).not.toContain(banned);
    }
  });
});

// ─── COPPA — no minor data on this surface ────────────────────────────────────

describe('POST /api/cron/coach-quiet-check-in — COPPA', () => {
  it('never reads from `players` (the chain throws if the route asks)', async () => {
    store.coaches = [
      {
        id: 'coach-coppa',
        email: 'coppa@example.test',
        full_name: 'Coppa Coach',
        preferences: {},
        paused_until: null,
        last_active_at: daysAgoIso(20),
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    // The beforeEach throws on any non-coaches table; if the route widens to
    // read `players`, this case throws and the suite fails.
    const res = await cronPost(makeRequest());
    expect(res.status).toBe(200);
  });
});
