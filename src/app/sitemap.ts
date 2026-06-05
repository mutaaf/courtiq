import type { MetadataRoute } from 'next';
import { createServiceSupabase } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Dynamic sitemap (ticket 0038).
//
// Enumerates every PUBLIC coach surface so a cold searcher can find it via a
// web search:
//   - The static marketing routes (root, demo, signup, login, privacy, terms).
//   - /programs — the directory page (ticket 0033) — always indexed.
//   - One /org/<slug> per organization that has explicitly opted into discovery
//     (settings.discoverable = true), the same gate /api/programs filters on.
//   - One entry per ACTIVE token across the six shipped public-token surfaces:
//       team_card_shares       → /team-card/<token>      (0010)
//       season_recap_shares    → /season-recap/<token>   (0017)
//       coach_card_shares      → /coach/<token>          (0026)
//       game_recap_shares      → /recap/<token>          (0027)
//       practice_plan_shares   → /plan/<token>           (0049)
//       weekly_pulse_shares    → /week/<token>           (0057)
//
// The parent portal at /share/<token> (parent_shares) is NEVER included — it
// carries per-minor content and is marked `noindex` at the page level. The
// dashboard, /api/, /share/ paths never appear here.
//
// Privacy: this file emits ONLY org slugs and opaque tokens. No coach, player,
// or team name (and no observation text) is part of any URL or any sitemap
// field. Tokens are the same opaque values the public APIs already accept.
//
// Sizing: hard-capped at 50,000 entries (the per-sitemap-file limit Google's
// indexer enforces). Per-token tables are ordered by created_at DESC so the
// freshest are always indexed first.
//
// The handler reads no params/body, so it declares zero parameters
// (LESSONS.md 2026-05-21 re: no-arg handlers).
// ---------------------------------------------------------------------------

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';

// Per-sitemap-file URL cap (Google indexer limit). Acts as a defensive bound:
// if the four token tables together ever exceed this, the post-merge slice
// keeps the most recent rows (the per-table ORDER BY created_at DESC + the
// per-table LIMIT below already keep the cap reachable in practice).
const SITEMAP_MAX_ENTRIES = 50_000;

// Per-token-table soft cap. Four tables × this cap ≤ SITEMAP_MAX_ENTRIES with
// room for the static routes + opted-in orgs (well under 50k in practice).
const TOKEN_TABLE_LIMIT = 10_000;

// Re-resolve the base URL inside the handler so a per-request env (preview vs
// prod) is honored even when the module's BASE_URL was captured at boot.
function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || BASE_URL;
}

interface TokenRow {
  token: string | null;
  created_at?: string | null;
  coach_id?: string | null;
}

interface OrgRow {
  slug: string | null;
}

interface HandleRow {
  id: string | null;
  handle: string | null;
}

async function fetchActiveTokens(
  supabase: { from: (t: string) => any },
  table: string,
): Promise<TokenRow[]> {
  // Active only; revoked/inactive tokens NEVER index. Order by created_at DESC
  // so the freshest are first. Bounded by TOKEN_TABLE_LIMIT.
  const { data } = await supabase
    .from(table)
    .select('token, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(TOKEN_TABLE_LIMIT);
  return ((data ?? []) as TokenRow[]).filter((r) => typeof r.token === 'string' && r.token.length > 0);
}

// Ticket 0054 — coach_card_shares with the coach_id so we can swap the URL to
// /coach/<handle> when the coach has claimed a vanity handle. Same shape /
// gating as fetchActiveTokens; only the SELECT changes.
async function fetchActiveCoachCards(
  supabase: { from: (t: string) => any },
): Promise<TokenRow[]> {
  const { data } = await supabase
    .from('coach_card_shares')
    .select('token, created_at, coach_id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(TOKEN_TABLE_LIMIT);
  return ((data ?? []) as TokenRow[]).filter((r) => typeof r.token === 'string' && r.token.length > 0);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base = baseUrl();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${base}/demo`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${base}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    // The cold-traffic acquisition page (ticket 0033). Static, always present.
    {
      url: `${base}/programs`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  let orgEntries: MetadataRoute.Sitemap = [];
  let tokenEntries: MetadataRoute.Sitemap = [];

  try {
    const supabase = (await createServiceSupabase()) as { from: (t: string) => any };

    // 1) Opted-in orgs — same `settings.discoverable = true` gate /api/programs
    //    uses (ticket 0033). A non-opted-in org is never indexed.
    const { data: orgs } = await supabase
      .from('organizations')
      .select('slug')
      .eq('settings->>discoverable', 'true')
      .order('slug');
    orgEntries = ((orgs ?? []) as OrgRow[])
      .filter((o) => typeof o.slug === 'string' && o.slug.length > 0)
      .map((o) => ({
        url: `${base}/org/${o.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));

    // 2) Active tokens across the FIVE shipped public-token surfaces. NOTE:
    //    parent_shares (the parent portal) is NEVER read here — it carries
    //    per-minor content. The dashboard and the /api/* routes are also
    //    structurally excluded — only public surfaces are enumerated.
    //    The fifth surface (practice_plan_shares → /plan/<token>) is read
    //    sequentially AFTER the prior four so the existing sitemap.test.ts
    //    mock-ordering keeps matching byte-for-byte (LESSONS#0040 family).
    //
    //    Ticket 0054 — coach_card_shares reads include coach_id so we can
    //    swap the URL to /coach/<handle> when the coach has claimed a vanity
    //    handle. A 7th read (`coaches` WHERE handle IS NOT NULL …) follows
    //    so the mock-queue update is contained to one new step. Per
    //    LESSONS#0099/#0100, every consumer mock of this route is updated in
    //    the same PR.
    const [teamCards, seasonRecaps, coachCards, gameRecaps] = await Promise.all([
      fetchActiveTokens(supabase, 'team_card_shares'),
      fetchActiveTokens(supabase, 'season_recap_shares'),
      fetchActiveCoachCards(supabase),
      fetchActiveTokens(supabase, 'game_recap_shares'),
    ]);
    const practicePlans = await fetchActiveTokens(supabase, 'practice_plan_shares');
    // Ticket 0057 — weekly_pulse_shares read AFTER the prior five so the
    // existing sitemap.test.ts mock-ordering keeps matching byte-for-byte
    // (LESSONS#0049 / #0100 family — sitemap test mocks are queued in the
    // route's exact read order). The mock queue in tests/app/sitemap.test.ts
    // is extended to add this 8th sequential read.
    const weeklyPulses = await fetchActiveTokens(supabase, 'weekly_pulse_shares');
    // Ticket 0064 — single-drill publish-and-clone surface. drill_shares
    // uses `share_token` (not `token`) as its public-URL column, so we
    // read it through a dedicated helper rather than fetchActiveTokens.
    // The 7th sequential read; the mock queue in tests/app/sitemap.test.ts
    // is extended to add the 7th `mockReturnValueOnce` chain in the same
    // PR per LESSONS#0049 / #0100.
    const { data: drillShareRows } = await supabase
      .from('drill_shares')
      .select('share_token, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(TOKEN_TABLE_LIMIT);
    const drillShares = ((drillShareRows ?? []) as Array<{
      share_token: string | null;
      created_at?: string | null;
    }>).filter(
      (r) => typeof r.share_token === 'string' && r.share_token.length > 0,
    );

    // Ticket 0068 — season_opener_shares. Sequenced AFTER drill_shares so
    // the existing sitemap mock queues only grow by one entry at the tail
    // (LESSONS#0049 / #0100 / #0110 — every sibling sitemap*.test.ts has
    // its mockReturnValueOnce queue extended in the same PR). No
    // `is_active` column on this table; the season opener is a season-
    // durable surface and every active row is indexed.
    const { data: seasonOpenerRows } = await supabase
      .from('season_opener_shares')
      .select('token, created_at')
      .order('created_at', { ascending: false })
      .limit(TOKEN_TABLE_LIMIT);
    const seasonOpeners = ((seasonOpenerRows ?? []) as TokenRow[]).filter(
      (r) => typeof r.token === 'string' && r.token.length > 0,
    );

    // Ticket 0054 — resolve which coaches have a non-null handle so the
    // /coach/<handle> URL replaces the /coach/<token> URL. Bounded by the
    // current coach-card batch (we only join against coaches whose cards we
    // are about to emit). An empty in() never throws — supabase returns [].
    const coachIdsWithCards = Array.from(
      new Set(
        coachCards
          .map((r) => r.coach_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    let handleByCoachId = new Map<string, string>();
    if (coachIdsWithCards.length > 0) {
      const { data: handleRows } = await supabase
        .from('coaches')
        .select('id, handle')
        .in('id', coachIdsWithCards)
        .not('handle', 'is', null);
      handleByCoachId = new Map(
        ((handleRows ?? []) as HandleRow[])
          .filter(
            (r): r is { id: string; handle: string } =>
              typeof r.id === 'string' && typeof r.handle === 'string' && r.handle.length > 0,
          )
          .map((r) => [r.id, r.handle]),
      );
    } else {
      // Even when the coach-card batch is empty we still read coaches so the
      // sequential mock queue in tests is deterministic (one read per coach
      // batch). The empty `in()` short-circuits to no rows.
      const { data: handleRows } = await supabase
        .from('coaches')
        .select('id, handle')
        .not('handle', 'is', null)
        .limit(0);
      handleByCoachId = new Map(
        ((handleRows ?? []) as HandleRow[])
          .filter(
            (r): r is { id: string; handle: string } =>
              typeof r.id === 'string' && typeof r.handle === 'string' && r.handle.length > 0,
          )
          .map((r) => [r.id, r.handle]),
      );
    }

    // Map each token table to its public URL path. Token is the URL — no
    // human-readable name ever rides on a URL or a lastModified field.
    const map = (
      rows: TokenRow[],
      pathPrefix: string,
    ): MetadataRoute.Sitemap =>
      rows.map((r) => ({
        url: `${base}${pathPrefix}/${r.token}`,
        lastModified: r.created_at ? new Date(r.created_at) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }));

    // Coach cards specifically: prefer /coach/<handle> when the coach has one,
    // else fall back to /coach/<token>. Exactly ONE entry per coach-card row
    // (the handle replaces the token URL; it never appears alongside it).
    const coachCardEntries: MetadataRoute.Sitemap = coachCards.map((r) => {
      const handle = r.coach_id ? handleByCoachId.get(r.coach_id) : undefined;
      const path = handle ? `/coach/${handle}` : `/coach/${r.token}`;
      return {
        url: `${base}${path}`,
        lastModified: r.created_at ? new Date(r.created_at) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      };
    });

    // Ticket 0064 — drill_shares uses the column `share_token` instead of
    // `token`; map to a TokenRow-shaped object so the same `map` helper
    // re-uses the existing URL emission shape.
    const drillShareEntries: MetadataRoute.Sitemap = drillShares.map((r) => ({
      url: `${base}/drill/${r.share_token}`,
      lastModified: r.created_at ? new Date(r.created_at) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));

    tokenEntries = [
      ...map(teamCards, '/team-card'),
      ...map(seasonRecaps, '/season-recap'),
      ...coachCardEntries,
      ...map(gameRecaps, '/recap'),
      ...map(practicePlans, '/plan'),
      ...map(weeklyPulses, '/week'),
      ...drillShareEntries,
      // Ticket 0068 — season_opener_shares → /opener/<token>.
      ...map(seasonOpeners, '/opener'),
    ];
  } catch (error) {
    // Sitemap generation must never throw — a transient DB hiccup degrades to
    // the static-only sitemap rather than a 500 page. Log and continue.
    console.error('[sitemap] dynamic enumeration failed', error);
  }

  // Merge in priority order: static (highest), opted-in orgs, then tokens.
  // The 50,000-entry cap is the indexer ceiling; we keep the most important
  // surfaces first so a cap-induced slice never drops the static pages.
  const merged: MetadataRoute.Sitemap = [
    ...staticEntries,
    ...orgEntries,
    ...tokenEntries,
  ];

  if (merged.length > SITEMAP_MAX_ENTRIES) {
    return merged.slice(0, SITEMAP_MAX_ENTRIES);
  }
  return merged;
}
