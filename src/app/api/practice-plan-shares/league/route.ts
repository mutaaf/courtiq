import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { memCached, TTL } from '@/lib/cache/memory';
import { leaguePlansCacheKey } from '@/lib/cache/league-plans-cache';
import {
  computeCoachReputation,
  isAboveDiscoveryThreshold,
  type CoachReputation,
  type PlanCloneRow,
  type DrillCloneRow,
  type StuckCloneRow,
} from '@/lib/coach-reputation-utils';

// GET /api/practice-plan-shares/league?teamId=<id> — ticket 0055.
//
// The league-internal practice-plan discovery endpoint. Powers the
// <LeaguePlansSection /> that lives at the TOP of /plans. Returns the five
// most recent ACTIVE practice-plan shares published by OTHER coaches in the
// caller's org, scoped to the caller's active team's sport. The publishing
// coach's first name only is returned — never email or full_name (COPPA-
// adjacent posture mirroring 0049's /[token] route).
//
// Auth: createServerSupabase().auth.getUser() — 401 on missing auth.
// Team ownership: the supplied teamId must belong to the caller (the same
// posture as LESSONS#36 — 404, never 403, on a foreign-team lookup).
// Solo coach (NULL org_id): returns { plans: [], eligible: false } — the
// shape the section uses to render NOTHING. Silence beats an empty-state nag.
//
// Cache: a 5-minute in-memory slot keyed by `league:${org_id}:${sport_slug}`.
// The publish route (POST /api/practice-plan-shares/create) calls
// `bustLeagueCache(org_id)` after a successful insert so the next read in
// the org sees the new plan immediately (LESSONS#41 cache-bust-on-write).
export async function GET(request: Request) {
  // 1) Auth.
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2) Parse teamId from the query string.
  const url = new URL(request.url);
  const teamId = url.searchParams.get('teamId');
  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // 3) Team ownership lookup. The team must belong to the caller — a
    // foreign team id returns 404 (LESSONS#36), never 403. We also pull
    // sport_id here for the same-sport filter below.
    const { data: callerTeam } = await supabase
      .from('teams')
      .select('id, coach_id, sport_id')
      .eq('id', teamId)
      .eq('coach_id', user.id)
      .single();

    if (!callerTeam) {
      return NextResponse.json({ error: 'Team not found for this coach' }, { status: 404 });
    }

    // 4) Caller's org_id. A null org_id means the caller is a solo coach —
    // there's no "league" to draw from, so the section renders nothing.
    const { data: callerCoach } = await supabase
      .from('coaches')
      .select('id, org_id')
      .eq('id', user.id)
      .single();

    if (!callerCoach?.org_id) {
      return NextResponse.json({ plans: [], eligible: false });
    }

    // From here the caller IS eligible (they have an org). The plans array
    // can still be empty if no peer has published — but `eligible: true`
    // signals that the surface should pre-warm for when one does.
    const orgId = callerCoach.org_id;

    // The sport_id is a UUID; we cache by sport_id so the key stays cheap
    // and stable (no extra `sports` lookup on the hot path).
    const sportKey = String(callerTeam.sport_id ?? 'unknown');
    const cacheKey = leaguePlansCacheKey(orgId, sportKey);

    const plans = await memCached(cacheKey, TTL.LONG, async () => {
      return await queryLeaguePlans({
        supabase,
        callerId: user.id,
        orgId,
        callerSportId: String(callerTeam.sport_id ?? ''),
      });
    });

    // Strip the internal `publishedCoachId` field — it is used inside
    // queryLeaguePlans to scope per-coach reputation aggregation; it
    // is NOT part of the public response keyset (the existing 0055
    // contract pins 8 keys + the new `reputation`).
    const publicPlans = plans.map(({ publishedCoachId: _internal, ...rest }) => rest);
    return NextResponse.json({ plans: publicPlans, eligible: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('League practice plans error:', message);
    // A best-effort surface: a 500 on the DB read STILL returns a valid
    // shape so the plans page never blocks. The component renders nothing
    // when the array is empty — silence beats a broken page.
    return NextResponse.json({ plans: [], eligible: false, error: message }, { status: 500 });
  }
}

interface LeaguePlanRow {
  token: string;
  planTitle: string | null;
  publishedAt: string;
  coachFirstName: string | null;
  sportSlug: string;
  ageGroup: string | null;
  sourcePlanId: string;
  note: string | null;
  // Ticket 0073 — reputation extension. `null` when the published
  // coach's clone counts are below the discovery-surface threshold
  // (cloneCount < 3 OR distinctProgramCount < 2). The component
  // surface renders nothing for a null reputation — silence beats
  // small-number bragging.
  reputation: CoachReputation | null;
  publishedCoachId: string;
}

/**
 * The heavy read. Returns up to 5 most-recent active practice-plan shares
 * from OTHER coaches in the caller's org on teams of the caller's sport.
 * Pulled apart from the GET handler so the cache wrapper above stays thin.
 *
 * The shape we return is the COPPA-safe allow-list — exactly the eight
 * documented fields per row. No email, no full_name, no minor data.
 */
async function queryLeaguePlans(args: {
  supabase: Awaited<ReturnType<typeof createServiceSupabase>>;
  callerId: string;
  orgId: string;
  callerSportId: string;
}): Promise<LeaguePlanRow[]> {
  const { supabase, callerId, orgId, callerSportId } = args;

  // 5) Peer coaches in the same org (caller excluded). The exclusion lives
  // in SQL — we never trust client-side filtering of the response.
  const { data: peerCoaches } = await supabase
    .from('coaches')
    .select('id, full_name, org_id')
    .eq('org_id', orgId)
    .neq('id', callerId);

  if (!peerCoaches || peerCoaches.length === 0) return [];
  const peerCoachIds = peerCoaches.map((c) => c.id);
  const coachById = new Map<string, { id: string; full_name: string | null }>();
  for (const c of peerCoaches) coachById.set(c.id, { id: c.id, full_name: c.full_name ?? null });

  // 6) Peer teams in the org on the caller's sport. We pull age_group +
  // sports.slug here so the row formatter has them without a second join.
  const { data: peerTeams } = await supabase
    .from('teams')
    .select('id, sport_id, age_group, sports(slug)')
    .eq('org_id', orgId)
    .eq('sport_id', callerSportId);

  if (!peerTeams || peerTeams.length === 0) return [];
  const teamById = new Map<string, { age_group: string | null; sportSlug: string }>();
  for (const t of peerTeams) {
    const slug = (t as { sports?: { slug?: string } | Array<{ slug?: string }> }).sports;
    const sportSlug = Array.isArray(slug)
      ? (slug[0]?.slug ?? 'unknown')
      : (slug?.slug ?? 'unknown');
    teamById.set(t.id, { age_group: t.age_group ?? null, sportSlug });
  }
  const peerTeamIds = Array.from(teamById.keys());

  // 7) Active shares from peer coaches whose plan lives on a peer team
  // (= same org, same sport). We pull the plan join inline so we get the
  // plan's team_id + title in one round-trip.
  const { data: shares } = await supabase
    .from('practice_plan_shares')
    .select('id, token, coach_id, plan_id, note, created_at, is_active, plans(id, title, team_id)')
    .in('coach_id', peerCoachIds)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!shares) return [];

  const rows: LeaguePlanRow[] = [];
  for (const s of shares as Array<{
    token: string;
    coach_id: string;
    plan_id: string;
    note: string | null;
    created_at: string;
    plans?: { id: string; title: string | null; team_id: string } | Array<{ id: string; title: string | null; team_id: string }>;
  }>) {
    const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans;
    if (!plan) continue;
    // Same-sport filter: the plan's team must be one of the peer teams we
    // resolved above (caller's sport). This is the structural guarantee
    // that no off-sport plan ever leaks.
    if (!peerTeamIds.includes(plan.team_id)) continue;
    const peerTeam = teamById.get(plan.team_id);
    const peerCoach = coachById.get(s.coach_id);

    rows.push({
      token: s.token,
      planTitle: plan.title ?? null,
      publishedAt: s.created_at,
      // First-name extraction is server-side so a client splitter is never
      // the trust boundary — same posture as the public /[token] route.
      coachFirstName: peerCoach?.full_name
        ? String(peerCoach.full_name).split(' ')[0]
        : null,
      sportSlug: peerTeam?.sportSlug ?? 'unknown',
      ageGroup: peerTeam?.age_group ?? null,
      sourcePlanId: plan.id,
      note: s.note ?? null,
      reputation: null,
      publishedCoachId: s.coach_id,
    });
  }

  // Ticket 0073 — reputation aggregation. For each published coach
  // we read existing plan-clone rows (`plans.source_plan_id` set by
  // 0049) AND drill-clone rows (`drill_share_clones` by 0064), then
  // call computeCoachReputation. The route returns reputation: null
  // for any coach whose counts fall below the discovery threshold.
  await attachReputation(supabase, rows);

  // Ticket 0076 — RE-RANK by
  //   (stuckProgramCount desc,
  //    distinctProgramCount desc,
  //    cloneCount desc,
  //    recency desc).
  // When every reputation has stuckProgramCount = 0 the new tuple
  // ties on the existing 0073 order — BYTE-IDENTICAL to today (the
  // ticket contract). When every reputation is null the sort ties
  // on recency — BYTE-IDENTICAL to 0055.
  rows.sort((a, b) => {
    const aRep = a.reputation;
    const bRep = b.reputation;
    const aStickProg = aRep?.stuckProgramCount ?? 0;
    const bStickProg = bRep?.stuckProgramCount ?? 0;
    if (aStickProg !== bStickProg) return bStickProg - aStickProg;
    const aProg = aRep?.distinctProgramCount ?? 0;
    const bProg = bRep?.distinctProgramCount ?? 0;
    if (aProg !== bProg) return bProg - aProg;
    const aClones = aRep?.cloneCount ?? 0;
    const bClones = bRep?.cloneCount ?? 0;
    if (aClones !== bClones) return bClones - aClones;
    // Recency tiebreaker — newer first (matches the existing sort).
    return b.publishedAt.localeCompare(a.publishedAt);
  });

  return rows;
}

/**
 * Read plan + drill clones for each published coach in `rows`, compute
 * reputation, and attach the result to each row (null below the
 * discovery threshold). Two new from() calls; the existing 5-call
 * baseline keeps its sibling test mock queue updated in the same PR
 * per LESSONS#0049 / #0092 / #0100 / #0110.
 */
async function attachReputation(
  supabase: Awaited<ReturnType<typeof createServiceSupabase>>,
  rows: LeaguePlanRow[],
): Promise<void> {
  if (rows.length === 0) return;

  // Group source plans by their publishing coach so we can keep the
  // per-coach aggregation honest (a coach with two published plans
  // gets ONE reputation across both).
  const coachIds = Array.from(new Set(rows.map((r) => r.publishedCoachId)));
  const sourcePlanIds = Array.from(new Set(rows.map((r) => r.sourcePlanId)));

  // 6) Plan clones — `plans` rows whose `source_plan_id IN
  // <sourcePlanIds>`. Allow-list (NO player_id, no minor data).
  const { data: planCloneRowsRaw } = await supabase
    .from('plans')
    .select('source_plan_id, coach_id, team_id, created_at')
    .in('source_plan_id', sourcePlanIds);
  const planCloneRows = (planCloneRowsRaw ?? []) as Array<{
    source_plan_id: string;
    coach_id: string;
    team_id: string;
    created_at: string;
  }>;

  // 7) Cloning coach org_ids. Allow-list (id + org_id only).
  const cloningCoachIds = Array.from(
    new Set<string>(planCloneRows.map((r) => r.coach_id)),
  );
  // 8) Drill clones — `drill_share_clones` rows joined to the
  // publishing coach. We read drill_shares first to find the
  // publisher's share ids; then drill_share_clones on those.
  const { data: publisherDrillSharesRaw } = await supabase
    .from('drill_shares')
    .select('id, coach_id')
    .in('coach_id', coachIds);
  const publisherDrillShares = (publisherDrillSharesRaw ?? []) as Array<{
    id: string;
    coach_id: string;
  }>;
  const drillShareIdToCoachId = new Map<string, string>();
  for (const s of publisherDrillShares) drillShareIdToCoachId.set(s.id, s.coach_id);

  let drillCloneRows: Array<{
    drill_share_id: string;
    cloner_coach_id: string;
    cloned_at: string;
  }> = [];
  if (publisherDrillShares.length > 0) {
    const { data: drillCloneRowsRaw } = await supabase
      .from('drill_share_clones')
      .select('drill_share_id, cloner_coach_id, cloned_at')
      .in(
        'drill_share_id',
        publisherDrillShares.map((s) => s.id),
      );
    drillCloneRows = (drillCloneRowsRaw ?? []) as Array<{
      drill_share_id: string;
      cloner_coach_id: string;
      cloned_at: string;
    }>;
    for (const r of drillCloneRows) cloningCoachIds.push(r.cloner_coach_id);
  }

  // Ticket 0076 — stick signals on the publisher's drill shares. One
  // extra `from()` call (LESSONS#0049 / #0092 / #0100 / #0110 — sibling
  // mock queues are extended in the same PR). The read is SKIPPED
  // entirely when the publisher has zero drill shares (the common case
  // for a coach who only publishes plans).
  let stickRows: Array<{
    drill_share_id: string;
    cloner_coach_id: string;
    cloner_org_id: string | null;
    stuck_at: string;
  }> = [];
  if (publisherDrillShares.length > 0) {
    const { data: stickRowsRaw } = await supabase
      .from('drill_clone_stick_signals')
      .select('drill_share_id, cloner_coach_id, cloner_org_id, stuck_at')
      .in(
        'drill_share_id',
        publisherDrillShares.map((s) => s.id),
      );
    stickRows = (stickRowsRaw ?? []) as Array<{
      drill_share_id: string;
      cloner_coach_id: string;
      cloner_org_id: string | null;
      stuck_at: string;
    }>;
  }

  // Now resolve all cloning-coach org_ids in one batched read.
  const distinctCloningCoachIds = Array.from(new Set(cloningCoachIds));
  const coachOrgById = new Map<string, string | null>();
  if (distinctCloningCoachIds.length > 0) {
    const { data: coachOrgRowsRaw } = await supabase
      .from('coaches')
      .select('id, org_id')
      .in('id', distinctCloningCoachIds);
    for (const r of (coachOrgRowsRaw ?? []) as Array<{
      id: string;
      org_id: string | null;
    }>) {
      coachOrgById.set(r.id, r.org_id ?? null);
    }
  }

  // Build the per-coach clone arrays.
  const planClonesByCoach = new Map<string, PlanCloneRow[]>();
  for (const r of planCloneRows) {
    // Walk back from source_plan_id → publishing coach via rows.
    const publishingCoachId = rows.find((row) => row.sourcePlanId === r.source_plan_id)
      ?.publishedCoachId;
    if (!publishingCoachId) continue;
    const arr = planClonesByCoach.get(publishingCoachId) ?? [];
    arr.push({
      source_plan_id: r.source_plan_id,
      cloning_coach_id: r.coach_id,
      cloning_team_id: r.team_id,
      cloning_org_id: coachOrgById.get(r.coach_id) ?? null,
      created_at: r.created_at,
    });
    planClonesByCoach.set(publishingCoachId, arr);
  }

  const drillClonesByCoach = new Map<string, DrillCloneRow[]>();
  for (const r of drillCloneRows) {
    const publishingCoachId = drillShareIdToCoachId.get(r.drill_share_id);
    if (!publishingCoachId) continue;
    const arr = drillClonesByCoach.get(publishingCoachId) ?? [];
    arr.push({
      source_drill_share_id: r.drill_share_id,
      cloning_coach_id: r.cloner_coach_id,
      cloning_team_id: '',
      cloning_org_id: coachOrgById.get(r.cloner_coach_id) ?? null,
      created_at: r.cloned_at,
    });
    drillClonesByCoach.set(publishingCoachId, arr);
  }

  // Ticket 0076 — group stick rows by publishing coach so each row's
  // reputation includes only THEIR sticks. The publishing coach is
  // resolved via drill_shares.coach_id (the share owner).
  const stickClonesByCoach = new Map<string, StuckCloneRow[]>();
  for (const r of stickRows) {
    const publishingCoachId = drillShareIdToCoachId.get(r.drill_share_id);
    if (!publishingCoachId) continue;
    const arr = stickClonesByCoach.get(publishingCoachId) ?? [];
    arr.push({
      drill_share_id: r.drill_share_id,
      cloner_coach_id: r.cloner_coach_id,
      cloner_org_id: r.cloner_org_id,
      stuck_at: r.stuck_at,
    });
    stickClonesByCoach.set(publishingCoachId, arr);
  }

  const nowMs = Date.now();
  for (const row of rows) {
    const rep = computeCoachReputation({
      publishedCoachId: row.publishedCoachId,
      planClones: planClonesByCoach.get(row.publishedCoachId) ?? [],
      drillClones: drillClonesByCoach.get(row.publishedCoachId) ?? [],
      stuckClones: stickClonesByCoach.get(row.publishedCoachId) ?? [],
      nowMs,
    });
    // Keep the discovery-threshold gate AS-IS — the 0073 threshold
    // (cloneCount >= 3 AND distinctProgramCount >= 2) still governs
    // whether the reputation surface is rendered. The new stuck
    // fields ride along on the same payload when above threshold;
    // they do NOT promote a sub-threshold publisher.
    row.reputation = isAboveDiscoveryThreshold(rep) ? rep : null;
  }
}
