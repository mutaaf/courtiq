/**
 * Vitest — `src/app/sitemap.ts` extension for practice_plan_shares (ticket 0049).
 *
 * Active practice_plan_shares tokens MUST appear in the sitemap as `/plan/<token>`
 * so a cold searcher can find published practice plans. Inactive shares MUST NOT
 * appear (revoked content stays unindexed). The existing sitemap tests
 * (tests/app/sitemap.test.ts) lock the four prior token-table integrations; this
 * file is the same shape for the new fifth surface.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFromFn } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({
    from: mockFromFn,
  })),
}));

function buildChain(data: unknown = null) {
  const resolved = { data, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const BASE = 'https://youthsportsiq.test';

describe('sitemap() — includes active practice_plan_shares tokens (ticket 0049)', () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_APP_URL = BASE;
  });

  afterEach(() => {
    process.env = { ...realEnv };
  });

  it('emits one /plan/<token> entry per active practice_plan_shares row', async () => {
    // The new fifth token table reads AFTER the existing four in fetchActiveTokens
    // calls. The order they're consumed by mockFromFn is the route's internal
    // ordering; the assertion below proves a 'plan' URL appears with the token
    // regardless of order, and the existing sitemap.test.ts keeps the prior four
    // in place. Ticket 0054 added a 7th read (coaches WHERE handle IS NOT NULL),
    // and ticket 0057 inserted a 7th read for weekly_pulse_shares between
    // practice_plan_shares (6th) and coaches/handle (now 8th). Both mocked empty
    // here.
    const orgsChain = buildChain([]);
    const tcChain = buildChain([]);
    const srChain = buildChain([]);
    const ccChain = buildChain([]);
    const grChain = buildChain([]);
    const ppChain = buildChain([
      { token: 'pp-active-1', created_at: new Date().toISOString() },
      { token: 'pp-active-2', created_at: new Date().toISOString() },
    ]);
    const wpChain = buildChain([]); // weekly_pulse_shares — ticket 0057.
    const coachesChain = buildChain([]);
    mockFromFn
      .mockReturnValueOnce(orgsChain)
      .mockReturnValueOnce(tcChain)
      .mockReturnValueOnce(srChain)
      .mockReturnValueOnce(ccChain)
      .mockReturnValueOnce(grChain)
      .mockReturnValueOnce(ppChain)
      .mockReturnValueOnce(wpChain)
      .mockReturnValueOnce(coachesChain);

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${BASE}/plan/pp-active-1`);
    expect(urls).toContain(`${BASE}/plan/pp-active-2`);
  });

  it('scopes the practice_plan_shares query to is_active=true', async () => {
    const orgsChain = buildChain([]);
    const tcChain = buildChain([]);
    const srChain = buildChain([]);
    const ccChain = buildChain([]);
    const grChain = buildChain([]);
    const ppChain = buildChain([]);
    const wpChain = buildChain([]); // weekly_pulse_shares — ticket 0057.
    const coachesChain = buildChain([]);
    mockFromFn
      .mockReturnValueOnce(orgsChain)
      .mockReturnValueOnce(tcChain)
      .mockReturnValueOnce(srChain)
      .mockReturnValueOnce(ccChain)
      .mockReturnValueOnce(grChain)
      .mockReturnValueOnce(ppChain)
      .mockReturnValueOnce(wpChain)
      .mockReturnValueOnce(coachesChain);

    const { default: sitemap } = await import('@/app/sitemap');
    await sitemap();

    const eqCalls = (ppChain.eq as ReturnType<typeof vi.fn>).mock.calls;
    const filtered = eqCalls.some(
      ([col, val]) => String(col) === 'is_active' && val === true,
    );
    expect(filtered).toBe(true);

    // And the table name was practice_plan_shares (no parent_shares leakage).
    const fromCalls = mockFromFn.mock.calls.map((c) => String(c[0]));
    expect(fromCalls).toContain('practice_plan_shares');
    expect(fromCalls).not.toContain('parent_shares');
  });
});
