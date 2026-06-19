/**
 * GET /api/sport-wide-convergence — ticket 0091.
 *
 * The Capture surface mounts <SportWideConvergenceLine />; that line
 * calls THIS route to learn whether the sport-wide pulse is eligible
 * (25+ DISTINCT programs across the sport shipping the same skill in
 * the last 7 days) AND who the top 2 named programs are.
 *
 * Authed: every signed-in coach can read the cross-sport pulse for any
 * skill in their sport. There is NO tier gate — the read is a FREE
 * affordance. Gating it would invert the supply-loop compound (a coach
 * who has to upgrade to see the pulse never sees it, and the surface
 * produces no acquisition signal).
 *
 * Schema-wins-over-prose (LESSONS#0096):
 *   - `plans.sport_id`, `plans.org_id`, `plans.age_groups` do NOT
 *     exist on the real schema. Sport / org / age_group ALL come from
 *     the `teams` row via `plans.team_id`. The route joins through
 *     teams.
 *   - The director-role check is `coaches.role === 'admin'`
 *     (LESSONS#0087).
 *   - `team_coaches` is the team-membership table (LESSONS#0057), but
 *     the director-role coach is keyed by `coaches.org_id ===
 *     org.id`, not by `team_coaches`, so the route reads coaches
 *     directly here.
 *
 * COPPA / data minimization (LESSONS#0036): allow-list `.select()` on
 * every read. The route NEVER reads `coaches.email`, `coaches.phone`,
 * `players.*`, `plans.content`, `plans.content_structured`. The
 * response carries only the program count + the program name + the
 * director first name + the age-groups served.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively; never
 * embeds an AGENTS.md banned word verbatim.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  computeSportWideConvergence,
  type SportWidePlanRow,
  type SportWideProgramRow,
} from '@/lib/sport-wide-convergence';

const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Response shape consumed by the Capture surface. Mirrored in the
 *  component's data prop type. */
export interface SportWideConvergenceResponse {
  eligible: boolean;
  distinctProgramCount: number;
  totalPlanCount: number;
  namedPrograms: Array<{
    orgId: string;
    programName: string;
    directorFirstName: string;
    planCount: number;
    ageGroupsServed: string[];
  }>;
  eligibilityReason?: 'too_few_programs' | 'no_skill_match';
}

/** Strip surname via literal space (LESSONS#0061). */
function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  const idx = trimmed.indexOf(' ');
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

const EMPTY_RESPONSE: SportWideConvergenceResponse = {
  eligible: false,
  distinctProgramCount: 0,
  totalPlanCount: 0,
  namedPrograms: [],
};

export async function GET(
  request: Request,
): Promise<NextResponse<SportWideConvergenceResponse | { error: string }>> {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const skillId = url.searchParams.get('skillId');
  const sportId = url.searchParams.get('sportId');
  if (!skillId || !sportId) {
    return NextResponse.json(EMPTY_RESPONSE);
  }

  const admin = await createServiceSupabase();

  try {
    // ── Step 1: list all teams in the sport. Allow-list select per
    //    LESSONS#0036 — id + org_id + age_group only. sport_id is the
    //    filter, not part of the projection.
    const { data: teamRows } = await admin
      .from('teams')
      .select('id, org_id, age_group')
      .eq('sport_id', sportId);

    const teams = ((teamRows ?? []) as Array<{
      id: string;
      org_id: string;
      age_group: string | null;
    }>);

    if (teams.length === 0) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const teamIds = teams.map((t) => t.id);
    const teamOrgById = new Map(teams.map((t) => [t.id, t.org_id]));
    const teamAgeById = new Map(teams.map((t) => [t.id, t.age_group ?? '']));

    // ── Step 2: 7-day window of plans for those teams. Allow-list
    //    select per LESSONS#0036 — id + team_id + created_at +
    //    skills_targeted only. NEVER content, NEVER content_structured.
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data: planRowsRaw } = await admin
      .from('plans')
      .select('id, team_id, created_at, skills_targeted')
      .in('team_id', teamIds)
      .gte('created_at', since);

    const planRowsTeamScoped = ((planRowsRaw ?? []) as Array<{
      id: string;
      team_id: string;
      created_at: string;
      skills_targeted: string[] | null;
    }>);

    // Shape plans for the pure helper: derive org_id + sport_id +
    // age_groups from the team join. Per the schema-wins note above,
    // plans carries none of these columns directly.
    const helperPlanRows: SportWidePlanRow[] = [];
    const orgIdsTouched = new Set<string>();
    const ageGroupsByOrg = new Map<string, Set<string>>();
    for (const row of planRowsTeamScoped) {
      const orgId = teamOrgById.get(row.team_id);
      if (!orgId) continue;
      const ageGroup = teamAgeById.get(row.team_id) ?? '';
      helperPlanRows.push({
        id: row.id,
        org_id: orgId,
        created_at: row.created_at,
        skills_targeted: row.skills_targeted,
        sport_id: sportId,
        age_groups: ageGroup ? [ageGroup] : [],
      });
      orgIdsTouched.add(orgId);
      let set = ageGroupsByOrg.get(orgId);
      if (!set) {
        set = new Set<string>();
        ageGroupsByOrg.set(orgId, set);
      }
      if (ageGroup) set.add(ageGroup);
    }

    if (orgIdsTouched.size === 0) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const orgIds = Array.from(orgIdsTouched);

    // ── Step 3: read the organizations rows for the touched orgs.
    //    Allow-list select — id + name + opted_out_of_sport_pulse only.
    //    NEVER tier / subscription_status / stripe_*.
    const { data: orgRowsRaw } = await admin
      .from('organizations')
      .select('id, name, opted_out_of_sport_pulse')
      .in('id', orgIds);
    const orgRows = ((orgRowsRaw ?? []) as Array<{
      id: string;
      name: string;
      opted_out_of_sport_pulse: boolean | null;
    }>);

    // ── Step 4: read the director coach (role='admin') for each org.
    //    Allow-list select — id + org_id + full_name + role only.
    //    NEVER email, NEVER phone. We split the surname off in-process
    //    via a literal-space split (LESSONS#0061).
    const { data: directorRowsRaw } = await admin
      .from('coaches')
      .select('id, org_id, full_name, role')
      .in('org_id', orgIds)
      .eq('role', 'admin');
    const directorRows = ((directorRowsRaw ?? []) as Array<{
      id: string;
      org_id: string;
      full_name: string | null;
      role: string | null;
    }>);

    const directorByOrgId = new Map<string, string>();
    for (const c of directorRows) {
      if (!c.org_id) continue;
      // First director wins for an org (deterministic by row order).
      if (directorByOrgId.has(c.org_id)) continue;
      const first = firstNameOf(c.full_name);
      if (first) directorByOrgId.set(c.org_id, first);
    }

    // Shape program rows for the helper.
    const helperProgramRows: SportWideProgramRow[] = orgRows.map((o) => ({
      id: o.id,
      name: o.name,
      director_first_name: directorByOrgId.get(o.id),
      opted_out: o.opted_out_of_sport_pulse === true,
      age_groups_served: Array.from(ageGroupsByOrg.get(o.id) ?? []),
    }));

    // ── Step 5: aggregate via the pure helper.
    const result = computeSportWideConvergence({
      skillId,
      sportId,
      planRows: helperPlanRows,
      programRows: helperProgramRows,
      nowMs: Date.now(),
    });

    // ── Step 6: if eligible AND the caller is the director of a
    //    NAMED program, write a celebration row (best-effort) so the
    //    existing 0088 first-cross-coach-signal card can surface the
    //    new `sport_pulse_named` variant. Idempotent via the table's
    //    UNIQUE (coach_id, kind) constraint — duplicate inserts no-op.
    if (result.eligible) {
      // Resolve the caller's coach row (role + org_id).
      const { data: callerRow } = await admin
        .from('coaches')
        .select('id, org_id, role')
        .eq('id', user.id)
        .maybeSingle();
      const callerCoach = callerRow as
        | { id: string; org_id: string | null; role: string | null }
        | null;
      if (
        callerCoach
        && callerCoach.role === 'admin'
        && callerCoach.org_id
        && result.namedPrograms.some((p) => p.orgId === callerCoach.org_id)
      ) {
        try {
          await admin.from('coach_first_signal_celebrations').insert({
            coach_id: callerCoach.id,
            kind: 'sport_pulse_named',
            fired_at: new Date().toISOString(),
          });
        } catch {
          // Idempotent: the UNIQUE (coach_id, kind) constraint will
          // reject duplicate inserts. Swallowed — the read path must
          // never throw because of the celebration write.
        }
      }
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('sport-wide-convergence error:', message);
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
