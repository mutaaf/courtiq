import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { canAccess, type Tier } from '@/lib/tier';
import { computeEmergentFocus, type PlanRow } from '@/lib/emergent-focus-utils';

// ─── GET /api/org/emergent-focus?orgId=<uuid> ─────────────────────────────────
// Ticket 0071 — bottom-up "your program is rallying around X" card.
//
// Reads the org's last 14 days of `plans` rows, aggregates `skills_targeted`
// across teams, and returns the top 1-2 skills that ≥ 3 distinct teams
// targeted. This is the INVERSE of 0031 (the director-set top-down focus):
// the convergence emerged from each coach's own practice plan, not from any
// program-wide directive.
//
// Auth posture MIRRORS the existing 0028 program-pulse route (read at pickup
// per LESSONS#0096): there is no `organization_members` table in this repo,
// so org membership is `coaches.org_id = orgId`, the role gate is
// `coaches.role === 'admin'`, and the tier gate is
// `canAccess(organizations.tier, 'feature_program_emergent_focus')`.
//
// COPPA / data minimization: the route's `.select()` calls are explicit
// allow-lists per LESSONS#0036 — `teams.select('id, name')` and
// `plans.select('team_id, skills_targeted, created_at')`. The route NEVER
// reads `players`, `observations`, `parent_email`, DOB, jersey numbers,
// photo URLs, or `medical_notes`. The response surface carries only skill
// strings + team display names — no per-minor field rides on the card.
//
// Best-effort posture: on a plans-read error the route returns
// `200 { focuses: [] }` — silence beats nag (mirrors the 0028 read-failure
// path; the card is then ABSENT on the admin surface).

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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
  if (!orgId) {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Resolve the caller's coach row (org_id + role + org tier) — same as 0028.
  const { data: callerRow } = await admin
    .from('coaches')
    .select('id, org_id, role, organizations(tier)')
    .eq('id', user.id)
    .single();

  const callerOrgId = (callerRow as any)?.org_id as string | undefined;
  const role = (callerRow as any)?.role as string | undefined;
  const tier = (((callerRow as any)?.organizations?.tier) || 'free') as Tier;

  // Cross-org or unknown org → 404 (never leak another org's existence).
  if (!callerOrgId || callerOrgId !== orgId) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  // Tier gate FIRST so the coach-tier check returns `{ reason: 'tier' }` (the
  // UpgradeGate's server-side counterpart).
  if (!canAccess(tier, 'feature_program_emergent_focus')) {
    return NextResponse.json(
      { error: 'The emergent focus card is an Organization plan feature.', reason: 'tier' },
      { status: 403 }
    );
  }

  // Role gate — director surface only.
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // ── Step 1: list teams in the org (id + display name only — allow-list). ──
  const { data: teamRows, error: teamsError } = await admin
    .from('teams')
    .select('id, name')
    .eq('org_id', orgId);

  if (teamsError || !teamRows || teamRows.length === 0) {
    // Best-effort: a teams-read failure resolves to an empty focus list, so
    // the admin surface renders normally and the card is simply absent.
    return NextResponse.json({ focuses: [] });
  }

  const teams = teamRows as Array<{ id: string; name: string }>;
  const teamIds = teams.map((t) => t.id);
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  // ── Step 2: read the last 14 days of practice plans for those teams. ─────
  // Allow-list select per LESSONS#0036 — only the three columns the
  // aggregator needs. No player_id, no content_structured, no title.
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: planRows, error: plansError } = await admin
    .from('plans')
    .select('team_id, skills_targeted, created_at')
    .in('team_id', teamIds)
    .gte('created_at', since);

  if (plansError) {
    return NextResponse.json({ focuses: [] });
  }

  const plans = (planRows ?? []) as PlanRow[];

  // ── Step 3: compute the emergent focus and project it to the surface. ────
  const focuses = computeEmergentFocus(plans);

  const projected = focuses.map((f) => ({
    skill: f.skill,
    teamCount: f.teamCount,
    // Display names for the card — only id + name cross to the client.
    teams: f.teamIds
      .map((id) => ({ id, name: teamNameById.get(id) || 'a team' }))
      // Stable display ordering: alphabetical by team name keeps the share
      // text deterministic across re-renders.
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  return NextResponse.json({ focuses: projected });
}
