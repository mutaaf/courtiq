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
//   - One entry per ACTIVE token across the five shipped public-token surfaces:
//       team_card_shares       → /team-card/<token>      (0010)
//       season_recap_shares    → /season-recap/<token>   (0017)
//       coach_card_shares      → /coach/<token>          (0026)
//       game_recap_shares      → /recap/<token>          (0027)
//       practice_plan_shares   → /plan/<token>           (0049)
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
}

interface OrgRow {
  slug: string | null;
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
    const [teamCards, seasonRecaps, coachCards, gameRecaps] = await Promise.all([
      fetchActiveTokens(supabase, 'team_card_shares'),
      fetchActiveTokens(supabase, 'season_recap_shares'),
      fetchActiveTokens(supabase, 'coach_card_shares'),
      fetchActiveTokens(supabase, 'game_recap_shares'),
    ]);
    const practicePlans = await fetchActiveTokens(supabase, 'practice_plan_shares');

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

    tokenEntries = [
      ...map(teamCards, '/team-card'),
      ...map(seasonRecaps, '/season-recap'),
      ...map(coachCards, '/coach'),
      ...map(gameRecaps, '/recap'),
      ...map(practicePlans, '/plan'),
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
