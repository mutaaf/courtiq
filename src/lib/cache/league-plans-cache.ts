// Ticket 0055 — league-plans cache helpers.
//
// A thin layer over `memCached` / `memBustPrefix` in src/lib/cache/memory.ts.
// We expose ONLY the key constructor + the `bustLeagueCache(orgId)` helper so
// every consumer (the GET route, the publish-route bust hook, the vitest
// suite) reaches the same key shape.
//
// The hot read is GET /api/practice-plan-shares/league?teamId=, which the
// /plans page fires on every visit. The rare write is POST /api/practice-
// plan-shares/create (a coach publishes a plan). We bust the rare path so
// the hot read stays cached and the publishing org sees the new plan
// immediately — the SAME pattern as ticket 0002's `bustOrgMeCache` after a
// Stripe webhook (LESSONS#41).
//
// Key shape: `league:${org_id}:${sport_slug}`. The publish bust takes only
// org_id and drops EVERY sport's slot for that org so a publisher whose plan
// straddles a different sport on a sibling team is also reflected (rare but
// possible — e.g. a multi-sport program).

import { memBustPrefix } from '@/lib/cache/memory';

export function leaguePlansCacheKey(orgId: string, sportSlug: string): string {
  return `league:${orgId}:${sportSlug}`;
}

export function bustLeagueCache(orgId: string): void {
  memBustPrefix(`league:${orgId}:`);
}
