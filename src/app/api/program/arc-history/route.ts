import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  computeProgramArcShape,
  type ProgramArcPlanRow,
} from '@/lib/program-arc-utils';

// ─── GET /api/program/arc-history ─────────────────────────────────────────
// Ticket 0083 — program-scoped Practice Arc memory.
//
// Reads the prior season's plans of OTHER teams in the same
// (org_id, age_group, sport_id) tuple, aggregates them into a week-by-
// week arc shape, and returns the shape + a coverage flag so the
// <ProgramArcHistoryHint /> can render the one-line summary above the
// empty Practice Arc state.
//
// Auth posture: authed coach. Any coach who owns at least one team in
// the named org may read the aggregate (the surface's read is
// non-sensitive aggregate per the ticket; the program arc is a free
// affordance, NOT a tier feature). The ticket explicitly says v1 is
// open to any coach in the program, NOT director-only.
//
// COPPA / data minimization (LESSONS#0036): every `.select()` is an
// explicit allow-list. The route NEVER reads `players`, `observations`,
// `parent_email`, `date_of_birth`, `jersey_number`, `medical_notes`, or
// any plan content beyond the aggregator's `skills_targeted +
// curriculum_week`. The response carries only the program name + the
// age group + the per-week skill names + integer counts.
//
// Schema reconciliation (LESSONS#0096): `plans` has NO org_id / age_group
// / sport_id / season_week columns. The route joins plans ↔ teams to
// scope (org_id, age_group, sport_id) at the SQL layer, and reads
// `plans.curriculum_week` (the existing column) as the helper's
// `season_week`. The team-coach ownership check uses `team_coaches`,
// NEVER `teams.coach_id` (LESSONS#0057).
//
// Best-effort posture: the surface is silent when coverage is thin or
// the read fails; the route always returns 200 with `coverage: 'thin'`
// and `weeks: []` on a read failure rather than a 5xx.

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const orgId = url.searchParams.get('orgId');
  const ageGroup = url.searchParams.get('ageGroup');
  const sportId = url.searchParams.get('sportId');
  const seasonLookbackParam = url.searchParams.get('seasonLookback');

  if (!orgId || !ageGroup || !sportId) {
    return NextResponse.json(
      { error: 'orgId, ageGroup, and sportId are required' },
      { status: 400 },
    );
  }

  const seasonLookback = seasonLookbackParam
    ? Math.max(1, Math.min(3, parseInt(seasonLookbackParam, 10) || 1))
    : 1;

  const admin = await createServiceSupabase();

  // ── Step 1: verify the caller owns at least one team in the named org. ─
  // Org membership is established by the existence of a team_coaches row
  // pairing the caller with a team in the org. The team_coaches table is
  // the source of truth for team-coach ownership (LESSONS#0057).
  // Allow-list select per LESSONS#0036 — only the join columns we need.
  const { data: callerTeamCoachesRaw, error: tcError } = await admin
    .from('team_coaches')
    .select('team_id, coach_id')
    .eq('coach_id', user.id);

  if (tcError) {
    return NextResponse.json({ error: 'Failed to resolve ownership' }, { status: 500 });
  }

  const callerTeamIds = ((callerTeamCoachesRaw ?? []) as Array<{ team_id: string }>).map(
    (r) => r.team_id,
  );
  if (callerTeamIds.length === 0) {
    return NextResponse.json({ error: 'No team in this org' }, { status: 404 });
  }

  // ── Step 2: list teams in the program (org + age_group + sport). ──────
  // Allow-list select per LESSONS#0036 — only the four columns the
  // aggregator + the membership check need. No team.name, no
  // organizations.tier, no archived_at, no settings.
  const { data: programTeamRowsRaw, error: teamsError } = await admin
    .from('teams')
    .select('id, org_id, age_group, sport_id')
    .eq('org_id', orgId)
    .eq('age_group', ageGroup)
    .eq('sport_id', sportId);

  if (teamsError) {
    // Best-effort posture — read failure resolves to thin coverage so
    // the surface stays silent rather than blocking on a 5xx.
    return NextResponse.json({
      coverage: 'thin',
      weeks: [],
      programName: null,
      ageGroup,
    });
  }

  const programTeams = (programTeamRowsRaw ?? []) as Array<{
    id: string;
    org_id: string;
    age_group: string;
    sport_id: string;
  }>;

  // ── Step 3: confirm the caller has at least one team in THIS program. ──
  // This is the org-membership gate: if none of the caller's teams are in
  // the program teams set, return 404 (never leak another program's
  // existence).
  const programTeamIds = new Set(programTeams.map((t) => t.id));
  const callerTeamInProgram = callerTeamIds.some((id) => programTeamIds.has(id));
  if (!callerTeamInProgram) {
    return NextResponse.json({ error: 'No team in this org' }, { status: 404 });
  }

  // ── Step 4: read the program's plans, allow-list select. ──────────────
  // Per LESSONS#0036 — the four columns the aggregator reads; NEVER
  // plans.content, content_structured, title, observations, player_id,
  // coach_id, ai_interaction_id, or any minor field.
  const programTeamIdsArray = Array.from(programTeamIds);
  let programPlanRows: Array<{
    team_id: string;
    skills_targeted: string[] | null;
    created_at: string;
    curriculum_week: number | null;
  }> = [];

  if (programTeamIdsArray.length > 0) {
    const { data: planRowsRaw, error: plansError } = await admin
      .from('plans')
      .select('team_id, skills_targeted, created_at, curriculum_week')
      .in('team_id', programTeamIdsArray);
    if (!plansError) {
      programPlanRows = (planRowsRaw ?? []) as typeof programPlanRows;
    }
  }

  // ── Step 5: resolve the program's display name from organizations. ───
  // Allow-list select — only id + name. The route NEVER reads
  // organizations.tier / stripe_customer_id / preferences / branding.
  let programName: string | null = null;
  const { data: orgRowRaw } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle();
  if (orgRowRaw && typeof (orgRowRaw as { name?: string }).name === 'string') {
    programName = (orgRowRaw as { name: string }).name;
  }

  // ── Step 6: walk the plans into ProgramArcPlanRow[] (join team → org). ──
  // The aggregator filters rowwise as defense-in-depth; the SQL layer
  // already pre-filtered by org/age/sport, so this is a structural
  // re-projection.
  const teamMeta = new Map(programTeams.map((t) => [t.id, t]));
  const aggregatorPlans: ProgramArcPlanRow[] = [];
  for (const row of programPlanRows) {
    const team = teamMeta.get(row.team_id);
    if (!team) continue;
    aggregatorPlans.push({
      team_id: row.team_id,
      org_id: team.org_id,
      age_group: team.age_group,
      sport_id: team.sport_id,
      skills_targeted: row.skills_targeted,
      created_at: row.created_at,
      season_week: row.curriculum_week,
    });
  }

  // ── Step 7: compute the arc shape; the caller's team is excluded. ────
  // The helper requires a callerTeamId — we pick the FIRST caller team in
  // this program (the relevant one for the empty-state hint). The
  // aggregate excludes ALL of the caller's teams via the team_id match —
  // the helper does not own multi-team-exclusion; rowwise we drop every
  // row whose team_id is in callerTeamIds before calling the helper.
  const callerTeamIdsSet = new Set(callerTeamIds);
  const filteredPlans = aggregatorPlans.filter((p) => !callerTeamIdsSet.has(p.team_id));
  const callerTeamForHelper =
    callerTeamIds.find((id) => programTeamIds.has(id)) ?? callerTeamIds[0];

  const shape = computeProgramArcShape({
    plans: filteredPlans,
    callerTeamId: callerTeamForHelper,
    orgId,
    ageGroup,
    sportId,
    seasonLookback,
    nowMs: Date.now(),
  });

  return NextResponse.json({
    coverage: shape.coverage,
    weeks: shape.weeks,
    programName,
    ageGroup,
  });
}
