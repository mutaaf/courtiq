/**
 * Vitest — `src/app/sitemap.ts` (ticket 0038).
 *
 * Dynamic sitemap that enumerates every PUBLIC coach surface so a cold searcher
 * can find them. Maps 1:1 to the ticket's acceptance criteria:
 *
 *  - Static marketing routes + `/programs` are always present.
 *  - One entry per opted-in org (`settings.discoverable = true`); non-opted-in
 *    orgs absent — same gate /api/programs (ticket 0033) uses.
 *  - One entry per ACTIVE public token across the four shipped surfaces
 *    (team_card_shares, season_recap_shares, coach_card_shares,
 *    game_recap_shares); inactive or revoked tokens excluded.
 *  - Parent-portal (`parent_shares`) tokens are NEVER included — they carry
 *    per-minor content.
 *  - The payload contains ONLY slugs + opaque tokens — no coach/player/team
 *    name, no observation text (COPPA / data minimization).
 *  - Capped at 50,000 entries with the most recent tokens first.
 *  - Dashboard, /api/, /share/ paths never appear.
 *
 * File is `.test.ts` (NOT `.spec.ts`) — vitest.config.ts excludes the spec
 * glob (LESSONS.md 2026-05-20). The sitemap default-export reads no params, so
 * it's called with the signature it declares (LESSONS.md 2026-05-21
 * re: no-arg handlers).
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

// A chainable in-memory builder for the supabase service client.
// `.select`/`.eq`/`.order`/`.limit` return `this`; awaiting the chain resolves
// to the configured `{ data, error }`. Mirrors tests/programs/list.test.ts.
function buildChain(data: unknown = null) {
  const resolved = { data, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

// The order the route reads tables in. Matches src/app/sitemap.ts:
//   1) organizations  (discoverable opt-in)
//   2) team_card_shares
//   3) season_recap_shares
//   4) coach_card_shares
//   5) game_recap_shares
//   6) practice_plan_shares  (ticket 0049 — read AFTER the prior four)
function wireTables(opts: {
  orgs?: Array<{ slug: string; name?: string }>;
  teamCards?: Array<{ token: string; created_at?: string }>;
  seasonRecaps?: Array<{ token: string; created_at?: string }>;
  coachCards?: Array<{ token: string; created_at?: string }>;
  gameRecaps?: Array<{ token: string; created_at?: string }>;
  practicePlans?: Array<{ token: string; created_at?: string }>;
}) {
  mockFromFn
    .mockReturnValueOnce(buildChain(opts.orgs ?? []))
    .mockReturnValueOnce(buildChain(opts.teamCards ?? []))
    .mockReturnValueOnce(buildChain(opts.seasonRecaps ?? []))
    .mockReturnValueOnce(buildChain(opts.coachCards ?? []))
    .mockReturnValueOnce(buildChain(opts.gameRecaps ?? []))
    .mockReturnValueOnce(buildChain(opts.practicePlans ?? []));
}

const BASE = 'https://youthsportsiq.test';

describe('sitemap() — dynamic public-surface index (ticket 0038)', () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = BASE;
  });

  // Restore env after every test in this file.
  afterEach(() => {
    process.env = { ...realEnv };
  });

  // ─── AC1 ───────────────────────────────────────────────────────────────────
  it('includes every static marketing route AND /programs', async () => {
    wireTables({});
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    const expected = [
      BASE,
      `${BASE}/demo`,
      `${BASE}/signup`,
      `${BASE}/login`,
      `${BASE}/privacy`,
      `${BASE}/terms`,
      `${BASE}/programs`,
    ];
    for (const url of expected) {
      expect(urls).toContain(url);
    }
  });

  // ─── AC2 ───────────────────────────────────────────────────────────────────
  it('lists ONLY opted-in orgs at /org/<slug> — the non-opted-in org is absent', async () => {
    wireTables({
      orgs: [{ slug: 'lincoln-rec', name: 'Lincoln Rec League' }],
    });
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${BASE}/org/lincoln-rec`);
    expect(urls).not.toContain(`${BASE}/org/private-club`);
  });

  it('filters orgs on the discoverable flag at the DB query', async () => {
    const orgsChain = buildChain([]);
    mockFromFn
      .mockReturnValueOnce(orgsChain)
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(buildChain([]))
      // practice_plan_shares (ticket 0049) — read AFTER the prior four.
      .mockReturnValueOnce(buildChain([]));

    const { default: sitemap } = await import('@/app/sitemap');
    await sitemap();

    // The route must scope the org query to the opt-in flag — same gate as
    // /api/programs (ticket 0033).
    const eqCalls = (orgsChain.eq as ReturnType<typeof vi.fn>).mock.calls;
    const filteredOnFlag = eqCalls.some(
      ([col, val]) => String(col).includes('discoverable') && String(val) === 'true',
    );
    expect(filteredOnFlag).toBe(true);
  });

  // ─── AC3 ───────────────────────────────────────────────────────────────────
  it('includes one entry per ACTIVE token across the four token surfaces', async () => {
    wireTables({
      teamCards: [{ token: 'tc-active-1' }],
      seasonRecaps: [{ token: 'sr-active-1' }],
      coachCards: [{ token: 'cc-active-1' }],
      gameRecaps: [{ token: 'gr-active-1' }],
    });
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${BASE}/team-card/tc-active-1`);
    expect(urls).toContain(`${BASE}/season-recap/sr-active-1`);
    expect(urls).toContain(`${BASE}/coach/cc-active-1`);
    expect(urls).toContain(`${BASE}/recap/gr-active-1`);
  });

  it('filters each token table on is_active=true at the DB query (inactive excluded)', async () => {
    const orgsChain = buildChain([]);
    const tcChain = buildChain([]);
    const srChain = buildChain([]);
    const ccChain = buildChain([]);
    const grChain = buildChain([]);
    mockFromFn
      .mockReturnValueOnce(orgsChain)
      .mockReturnValueOnce(tcChain)
      .mockReturnValueOnce(srChain)
      .mockReturnValueOnce(ccChain)
      .mockReturnValueOnce(grChain)
      // practice_plan_shares (ticket 0049) — also filter is_active=true.
      .mockReturnValueOnce(buildChain([]));

    const { default: sitemap } = await import('@/app/sitemap');
    await sitemap();

    // Each token chain must filter is_active=true so a revoked/inactive token
    // is never indexed.
    for (const chain of [tcChain, srChain, ccChain, grChain]) {
      const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls;
      const filteredOnActive = eqCalls.some(
        ([col, val]) => String(col) === 'is_active' && val === true,
      );
      expect(filteredOnActive).toBe(true);
    }
  });

  // ─── AC4 ───────────────────────────────────────────────────────────────────
  // parent_shares (the parent portal token table) MUST NEVER appear in the
  // sitemap — its content is per-minor.
  it('never reads parent_shares (no /share/<token> in the sitemap)', async () => {
    wireTables({
      teamCards: [{ token: 'tc-1' }],
    });
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();

    const fromCalls = mockFromFn.mock.calls.map((c) => String(c[0]));
    expect(fromCalls).not.toContain('parent_shares');

    // And no /share/<…> URL was emitted defensively.
    for (const e of entries) {
      expect(e.url.startsWith(`${BASE}/share/`)).toBe(false);
    }
  });

  // ─── AC6 (privacy) ─────────────────────────────────────────────────────────
  it('payload contains ONLY org slugs + opaque tokens — no names, no observation text', async () => {
    wireTables({
      orgs: [
        // Names include long human strings; they MUST NOT appear in the XML.
        { slug: 'lincoln-rec', name: 'Lincoln Rec League — North Side Volunteers' },
      ],
      teamCards: [{ token: 'tc-aaaaaa-bbbbbb' }],
      seasonRecaps: [{ token: 'sr-cccccc-dddddd' }],
      coachCards: [{ token: 'cc-eeeeee-ffffff' }],
      gameRecaps: [{ token: 'gr-gggggg-hhhhhh' }],
    });
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const raw = JSON.stringify(entries);

    // Names + free text must NOT appear in the rendered output.
    const forbidden = [
      'Lincoln Rec League',
      'North Side Volunteers',
      'Alice Walker',
      'Bob Carter',
      'observation',
      'parent_name',
    ];
    for (const word of forbidden) {
      expect(raw).not.toContain(word);
    }

    // The slug itself IS expected to appear (it's the URL path) — sanity check
    // that the test is asserting on real output.
    expect(raw).toContain('lincoln-rec');
  });

  // ─── AC7 (size bound) ──────────────────────────────────────────────────────
  it('caps at 50,000 entries and orders per-token by created_at DESC', async () => {
    // 1,500 rows per table × 4 tables = 6,000 token rows; plus 7 static + org
    // entries. Well under the cap. Verifies the ORDER-BY + cap are honored
    // even when one table dominates.
    const big = (prefix: string) =>
      Array.from({ length: 1500 }, (_, i) => {
        const iso = new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString();
        return { token: `${prefix}-${String(i).padStart(6, '0')}`, created_at: iso };
      });

    const teamCardsChain = buildChain(big('tc'));
    const seasonRecapsChain = buildChain(big('sr'));
    const coachCardsChain = buildChain(big('cc'));
    const gameRecapsChain = buildChain(big('gr'));

    mockFromFn
      .mockReturnValueOnce(buildChain([]))
      .mockReturnValueOnce(teamCardsChain)
      .mockReturnValueOnce(seasonRecapsChain)
      .mockReturnValueOnce(coachCardsChain)
      .mockReturnValueOnce(gameRecapsChain)
      // practice_plan_shares (ticket 0049) — empty in this size-bound case.
      .mockReturnValueOnce(buildChain([]));

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();

    // Cap honored.
    expect(entries.length).toBeLessThanOrEqual(50_000);

    // Each token table ordered by created_at DESC (most recent first).
    for (const chain of [teamCardsChain, seasonRecapsChain, coachCardsChain, gameRecapsChain]) {
      const orderCalls = (chain.order as ReturnType<typeof vi.fn>).mock.calls;
      const orderedByCreatedDesc = orderCalls.some(
        ([col, opts]) =>
          String(col) === 'created_at' &&
          opts &&
          typeof opts === 'object' &&
          (opts as { ascending?: boolean }).ascending === false,
      );
      expect(orderedByCreatedDesc).toBe(true);
    }
  });

  it('also caps when the synthetic input is larger than 50,000', async () => {
    // Construct a stub LARGER than the cap to prove the post-merge slice fires.
    // 13,000 × 4 = 52,000 token rows.
    const big = (prefix: string) =>
      Array.from({ length: 13_000 }, (_, i) => ({
        token: `${prefix}-${String(i).padStart(6, '0')}`,
        created_at: new Date(Date.UTC(2026, 0, 1) - i * 1_000).toISOString(),
      }));

    wireTables({
      teamCards: big('tc'),
      seasonRecaps: big('sr'),
      coachCards: big('cc'),
      gameRecaps: big('gr'),
    });

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();

    expect(entries.length).toBeLessThanOrEqual(50_000);
  });

  // ─── AC8 (regression) ──────────────────────────────────────────────────────
  it('never includes /api/, /(dashboard), or /share/ paths', async () => {
    wireTables({
      orgs: [{ slug: 'lincoln-rec' }],
      teamCards: [{ token: 'tc-1' }],
      seasonRecaps: [{ token: 'sr-1' }],
      coachCards: [{ token: 'cc-1' }],
      gameRecaps: [{ token: 'gr-1' }],
    });

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();

    for (const e of entries) {
      expect(e.url.includes('/api/')).toBe(false);
      expect(e.url.includes('/(dashboard)')).toBe(false);
      expect(e.url.startsWith(`${BASE}/share/`)).toBe(false);
      // Common authed routes — none of them belong here.
      const authedSegments = ['/home', '/capture', '/practice', '/plans', '/settings', '/observations'];
      for (const seg of authedSegments) {
        expect(e.url.startsWith(`${BASE}${seg}`)).toBe(false);
      }
    }
  });
});

