/**
 * Vitest — `src/app/sitemap.ts` extension for coach handles (ticket 0054).
 *
 * When a coach with an active coach_card_shares row ALSO has a non-null
 * coaches.handle, the sitemap emits `/coach/<handle>` instead of
 * `/coach/<token>` for that coach (the handle is the canonical URL). A coach
 * without a handle still gets the token entry. No coach is emitted twice.
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

// Wires the existing 8 sequential reads (orgs → team_cards → season_recaps →
// coach_cards → game_recaps → practice_plans → weekly_pulse_shares →
// drill_shares) PLUS the 9th read for coaches with non-null handle. Ticket
// 0064 added the drill_shares read between weekly_pulse_shares (7th) and
// coaches/handle (now 9th). LESSONS#0049 / #0100 — the queue for every
// sibling sitemap test gets the new chain in the same PR; without it, the
// drill_shares from() resolves to undefined and the route throws inside the
// next chained call.
function wireTables(opts: {
  orgs?: Array<{ slug: string }>;
  teamCards?: Array<{ token: string; created_at?: string }>;
  seasonRecaps?: Array<{ token: string; created_at?: string }>;
  coachCards?: Array<{ token: string; coach_id?: string; created_at?: string }>;
  gameRecaps?: Array<{ token: string; created_at?: string }>;
  practicePlans?: Array<{ token: string; created_at?: string }>;
  weeklyPulses?: Array<{ token: string; created_at?: string }>;
  drillShares?: Array<{ share_token: string; created_at?: string }>;
  seasonOpeners?: Array<{ token: string; created_at?: string }>;
  handleByCoachId?: Array<{ id: string; handle: string }>;
}) {
  mockFromFn
    .mockReturnValueOnce(buildChain(opts.orgs ?? []))
    .mockReturnValueOnce(buildChain(opts.teamCards ?? []))
    .mockReturnValueOnce(buildChain(opts.seasonRecaps ?? []))
    .mockReturnValueOnce(buildChain(opts.coachCards ?? []))
    .mockReturnValueOnce(buildChain(opts.gameRecaps ?? []))
    .mockReturnValueOnce(buildChain(opts.practicePlans ?? []))
    // 7th: weekly_pulse_shares (ticket 0057) — same is_active=true gating
    // as the other token tables, /week/<token> URL prefix.
    .mockReturnValueOnce(buildChain(opts.weeklyPulses ?? []))
    // 8th: drill_shares (ticket 0064) — same is_active=true gating,
    // /drill/<share_token> URL prefix.
    .mockReturnValueOnce(buildChain(opts.drillShares ?? []))
    // 9th: season_opener_shares (ticket 0068) — durable token, /opener/<token>
    // URL prefix; no is_active column.
    .mockReturnValueOnce(buildChain(opts.seasonOpeners ?? []))
    // 10th: coaches WHERE handle IS NOT NULL AND id IN (coach_ids from coach_cards).
    .mockReturnValueOnce(buildChain(opts.handleByCoachId ?? []));
}

describe('sitemap() — coach handles prefer /coach/<handle> over /coach/<token> (ticket 0054)', () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // LESSONS#0092 — drain the mockReturnValueOnce queue so a leak from
    // a sibling test cannot shift the consumed order in this one.
    mockFromFn.mockReset();
    vi.resetModules();
    process.env.NEXT_PUBLIC_APP_URL = BASE;
  });

  afterEach(() => {
    process.env = { ...realEnv };
  });

  it('emits /coach/<handle> when a coach with an active card has a non-null handle', async () => {
    wireTables({
      coachCards: [{ token: 'cc-aaaa', coach_id: 'coach-1' }],
      handleByCoachId: [{ id: 'coach-1', handle: 'sarah-rodriguez' }],
    });

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${BASE}/coach/sarah-rodriguez`);
    expect(urls).not.toContain(`${BASE}/coach/cc-aaaa`);
  });

  it('falls back to /coach/<token> when the coach has no handle', async () => {
    wireTables({
      coachCards: [{ token: 'cc-aaaa', coach_id: 'coach-1' }],
      handleByCoachId: [], // no coach in this batch has a handle
    });

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${BASE}/coach/cc-aaaa`);
    // Bonus: never accidentally emit a handle for them.
    expect(urls.filter((u) => u.startsWith(`${BASE}/coach/`))).toHaveLength(1);
  });

  it('emits exactly ONE entry per coach card (no duplicate handle+token emission)', async () => {
    wireTables({
      coachCards: [
        { token: 'cc-aaaa', coach_id: 'coach-1' },
        { token: 'cc-bbbb', coach_id: 'coach-2' },
      ],
      handleByCoachId: [{ id: 'coach-1', handle: 'sarah-rodriguez' }],
    });

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    const coachUrls = urls.filter((u) => u.startsWith(`${BASE}/coach/`));

    // Coach 1 -> handle URL; coach 2 -> token URL; nothing else.
    expect(coachUrls.sort()).toEqual(
      [`${BASE}/coach/cc-bbbb`, `${BASE}/coach/sarah-rodriguez`].sort(),
    );
    // And the token URL for coach 1 is suppressed.
    expect(urls).not.toContain(`${BASE}/coach/cc-aaaa`);
  });
});
