/**
 * Vitest — src/app/sitemap.ts extension for season_opener_shares (ticket 0068).
 *
 * Active season_opener_shares rows MUST appear in the sitemap as
 * `/opener/<token>` so a parent who lost the group-chat link can re-find
 * it via search. Unlike the 24h-scoped sub-handoff (LESSONS#0067), the
 * season opener is durable for the season and is crawler-reachable by
 * design.
 *
 * The route gains a 9th sequential read (after drill_shares, 8th) and the
 * coaches/handle read becomes the 10th. Every sibling sitemap*.test.ts is
 * extended in the SAME PR per LESSONS#0049 / #0100 / #0110.
 *
 * `.test.ts` not `.spec.ts` (LESSONS#0020 / #38).
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

describe('sitemap() — includes active season_opener_shares tokens (ticket 0068)', () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // LESSONS#0092 — drain mockReturnValueOnce queue between tests.
    mockFromFn.mockReset();
    vi.resetModules();
    process.env.NEXT_PUBLIC_APP_URL = BASE;
  });

  afterEach(() => {
    process.env = { ...realEnv };
  });

  it('emits one /opener/<token> entry per active season_opener_shares row', async () => {
    // Sequential reads:
    //   1) organizations
    //   2) team_card_shares
    //   3) season_recap_shares
    //   4) coach_card_shares
    //   5) game_recap_shares
    //   6) practice_plan_shares
    //   7) weekly_pulse_shares
    //   8) drill_shares
    //   9) season_opener_shares       ← new this ticket
    //  10) coaches WHERE handle IS NOT NULL
    mockFromFn
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(
        buildChain([
          { token: 'so-active-1', created_at: new Date().toISOString() },
          { token: 'so-active-2', created_at: new Date().toISOString() },
        ]),
      )
      .mockReturnValueOnce(buildChain([]));

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${BASE}/opener/so-active-1`);
    expect(urls).toContain(`${BASE}/opener/so-active-2`);
  });

  it('reads season_opener_shares (the route adds the from() call)', async () => {
    mockFromFn
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]));

    const { default: sitemap } = await import('@/app/sitemap');
    await sitemap();

    const fromCalls = mockFromFn.mock.calls.map((c) => String(c[0]));
    expect(fromCalls).toContain('season_opener_shares');
  });
});
