import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { memCached, TTL } from '@/lib/cache/memory';
import { leaguePlansCacheKey } from '@/lib/cache/league-plans-cache';

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

    return NextResponse.json({ plans, eligible: true });
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
    });
  }

  return rows;
}
