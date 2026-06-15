import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  computeProgramArcShape,
  type ProgramArcPlanRow,
} from '@/lib/program-arc-utils';

// ─── POST /api/program/arc-history/adopt ──────────────────────────────────
// Ticket 0083 — one-shot seed of the program's arc shape into the caller's
// own Practice Arc.
//
// Mirrors the existing 0018 arc-write primitive: the route resolves the
// program arc shape via the same helper the GET uses, builds a single
// `plans` row of type `practice_arc` with `content_structured` carrying
// the per-week shape, and inserts it. The new coach can edit any week
// from there — the seed is a STARTING POINT, NOT a synced clone (no v1
// sync; per the ticket's Out-of-scope).
//
// Idempotency: the route enforces that the caller's arc is currently
// empty before writing. A second call after one ran returns 409
// `arc_already_populated` — the surface treats the existing 0018 empty-
// state condition as the source of truth, and the hint disappears the
// moment any arc data exists.
//
// COPPA / data minimization (LESSONS#0036): every `.select()` is an
// explicit allow-list. The route NEVER reads `players`, `observations`,
// `parent_email`, `date_of_birth`, `jersey_number`, `medical_notes`, or
// any plan content beyond the aggregator's `skills_targeted +
// curriculum_week`. The inserted `content_structured` carries the
// PROGRAM-SCOPED aggregate ONLY — no minor field, no previous coach
// name, no team name attribution.
//
// Team ownership uses team_coaches, NEVER teams.coach_id (LESSONS#0057).

interface AdoptBody {
  teamId?: unknown;
  orgId?: unknown;
  ageGroup?: unknown;
  sportId?: unknown;
  seasonLookback?: unknown;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: AdoptBody;
  try {
    raw = (await request.json()) as AdoptBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const teamId = typeof raw.teamId === 'string' ? raw.teamId : null;
  const orgId = typeof raw.orgId === 'string' ? raw.orgId : null;
  const ageGroup = typeof raw.ageGroup === 'string' ? raw.ageGroup : null;
  const sportId = typeof raw.sportId === 'string' ? raw.sportId : null;
  const seasonLookback =
    typeof raw.seasonLookback === 'number'
      ? Math.max(1, Math.min(3, Math.floor(raw.seasonLookback)))
      : 1;

  if (!teamId || !orgId || !ageGroup || !sportId) {
    return NextResponse.json(
      { error: 'teamId, orgId, ageGroup, and sportId are required' },
      { status: 400 },
    );
  }

  const admin = await createServiceSupabase();

  // ── Step 1: verify the caller owns teamId (team_coaches). ──────────────
  const { data: tcRows, error: tcError } = await admin
    .from('team_coaches')
    .select('team_id, coach_id')
    .eq('coach_id', user.id);
  if (tcError) {
    return NextResponse.json({ error: 'Failed to resolve ownership' }, { status: 500 });
  }
  const callerTeamIds = ((tcRows ?? []) as Array<{ team_id: string }>).map((r) => r.team_id);
  if (!callerTeamIds.includes(teamId)) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  // ── Step 2: list program teams (org + age_group + sport). ─────────────
  const { data: programTeamRowsRaw } = await admin
    .from('teams')
    .select('id, org_id, age_group, sport_id')
    .eq('org_id', orgId)
    .eq('age_group', ageGroup)
    .eq('sport_id', sportId);
  const programTeams = (programTeamRowsRaw ?? []) as Array<{
    id: string;
    org_id: string;
    age_group: string;
    sport_id: string;
  }>;
  const programTeamIds = new Set(programTeams.map((t) => t.id));
  if (!programTeamIds.has(teamId)) {
    return NextResponse.json({ error: 'Team not in this program' }, { status: 404 });
  }

  // ── Step 3: verify the caller's arc is currently empty. ───────────────
  // Allow-list select per LESSONS#0036 — id + type only; the existing
  // 0018 empty-state condition is "no plans of type practice_arc on this
  // team" (the same condition the surface uses).
  const { data: existingArcRows } = await admin
    .from('plans')
    .select('id, type')
    .eq('team_id', teamId)
    .eq('type', 'practice_arc')
    .limit(1);
  if (existingArcRows && (existingArcRows as Array<unknown>).length > 0) {
    return NextResponse.json({ error: 'arc_already_populated' }, { status: 409 });
  }

  // ── Step 4: read the program plans, aggregate, compose the arc. ───────
  let aggregatorPlans: ProgramArcPlanRow[] = [];
  const programTeamIdsArray = Array.from(programTeamIds);
  if (programTeamIdsArray.length > 0) {
    const { data: planRowsRaw } = await admin
      .from('plans')
      .select('team_id, skills_targeted, created_at, curriculum_week')
      .in('team_id', programTeamIdsArray);
    const teamMeta = new Map(programTeams.map((t) => [t.id, t]));
    for (const row of (planRowsRaw ?? []) as Array<{
      team_id: string;
      skills_targeted: string[] | null;
      created_at: string;
      curriculum_week: number | null;
    }>) {
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
  }

  const callerTeamIdsSet = new Set(callerTeamIds);
  aggregatorPlans = aggregatorPlans.filter((p) => !callerTeamIdsSet.has(p.team_id));

  const shape = computeProgramArcShape({
    plans: aggregatorPlans,
    callerTeamId: teamId,
    orgId,
    ageGroup,
    sportId,
    seasonLookback,
    nowMs: Date.now(),
  });

  if (shape.coverage !== 'sufficient' || shape.weeks.length === 0) {
    // The surface only renders the hint when coverage is sufficient, so
    // an adopt request on thin coverage is an edge case (race, manual
    // POST). Return 409 — there's nothing meaningful to seed.
    return NextResponse.json(
      { error: 'insufficient_program_coverage' },
      { status: 409 },
    );
  }

  // ── Step 5: project the arc shape into the existing
  //          practice_arc content_structured schema. The 0018 generator's
  //          insert shape is `{ arc_title, total_sessions, sessions:
  //          [{ session_number, theme, drills, ... }], progression_note }`
  //          per src/lib/ai/schemas.ts. The adopt write mirrors the same
  //          structural shape — each contributing week becomes one
  //          session, themed by the week's top_skills, with empty drill
  //          arrays the new coach can fill in.
  const arcWeeks = shape.weeks;
  const arcTitle = `Program arc — last year's ${ageGroup} program`;

  const sessions = arcWeeks.map((week, idx) => ({
    session_number: idx + 1,
    title: `Week ${week.week_index}`,
    theme:
      week.top_skills.length > 0
        ? week.top_skills.join(' & ')
        : 'Open',
    session_goal:
      week.top_skills.length > 0
        ? `Build on ${week.top_skills.join(' and ')} the way the program ran it last year.`
        : 'Open week — adapt to your roster.',
    week_index: week.week_index,
    program_team_count: week.team_count,
    program_practice_count: week.practice_count,
    top_skills: week.top_skills,
    drills: [],
  }));

  const contentStructured = {
    arc_title: arcTitle,
    total_sessions: sessions.length,
    primary_focus: arcWeeks.length > 0 && arcWeeks[0].top_skills.length > 0
      ? arcWeeks[0].top_skills.slice(0, 2)
      : [],
    arc_goal: `Pick up the program's last-year arc as a starting point for ${ageGroup}.`,
    sessions,
    progression_note: 'Adopted from the program arc; edit any week from here.',
    program_arc_adopted: true,
  };

  const insertPayload = {
    team_id: teamId,
    coach_id: user.id,
    type: 'practice_arc' as const,
    title: arcTitle,
    content: JSON.stringify(contentStructured),
    content_structured: contentStructured,
  };

  const { data: inserted, error: insertError } = await admin
    .from('plans')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertError) {
    return NextResponse.json({ error: 'Failed to seed arc' }, { status: 500 });
  }

  return NextResponse.json({
    adopted: true,
    weeks: arcWeeks.length,
    planId: (inserted as { id: string } | null)?.id ?? null,
  });
}
