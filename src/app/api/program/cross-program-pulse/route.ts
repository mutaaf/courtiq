import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { canAccess, type Tier } from '@/lib/tier';
import {
  computeCrossProgramDirectorPulse,
  type DirectorPulseProgramRow,
  type DirectorPulsePlanRow,
} from '@/lib/cross-program-director-utils';

// ─── GET /api/program/cross-program-pulse?orgId=<uuid> ──────────────────────
// Ticket 0077 — director-side cross-program pulse line: "Riverside and
// Westview are both on transitions this week."
//
// Reads the caller's org's plans + the plans of OTHER orgs in the same
// SPORT over the last 14 days, computes each program's TOP skill emphasis,
// and returns up to TWO neighboring programs whose top skill matches the
// caller's. The persona is a director who already opens the 0028 program
// pulse on /admin; the new pulse line lives below that surface.
//
// Auth posture MIRRORS the existing 0028 program-pulse + 0071 emergent-
// focus routes (read at pickup per LESSONS#0096):
//   - 401 unauthed
//   - 403 non-org-tier OR non-admin coach
//   - 404 cross-org / unknown org
//   - 200 happy path with the resolved { topSkill, neighborPrograms }
//   - 200 { topSkill: null, neighborPrograms: [] } on best-effort silence
//
// Reconciliation (LESSONS#0096): the AC names
// `organizations.select('id, name, sport_id')` but `organizations` has NO
// `sport_id` column — sport_id lives on `teams`. The route resolves sport
// via `teams.sport_id` (mirrors the 0075 sport-emergent-focus pattern),
// then groups teams by org_id to derive the program directory.
//
// The neighbor director's first_name + email come from the org's ADMIN
// coach (the canonical director identity in this repo; same role gate as
// 0028 / 0071). The AC's `coach_director_contacts` table is read as a
// fallback when the coach has previously invited the same email (the
// "warm" pre-fill posture from 0065) — but the AUTHORITATIVE source is
// the org's admin coach row, since the table stores per-caller contacts,
// not a directory.
//
// COPPA / data minimization: the route's `.select()` calls are explicit
// allow-lists per LESSONS#0036. The route NEVER reads `players`,
// `observations`, `parent_email`, DOB, jersey numbers, photo URLs, or
// `medical_notes`. The response carries only org-aggregate counts + the
// director-side first_name + email (the director consented to inbound
// director-to-director recommendation contact via the 0065 admin role
// posture; the cross-program pulse never exposes the neighbor's coaches
// names, the neighbor's teams names, or any per-player field).
//
// Best-effort posture: any DB read failure (other than the role/tier
// gates) returns `200 { topSkill: null, neighborPrograms: [] }`. Silence
// beats nag — the line is then ABSENT on /admin and the existing
// surface is byte-identical.

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface CrossProgramPulseResponse {
  topSkill: string | null;
  neighborPrograms: Array<{
    org_id: string;
    org_name: string;
    practice_count: number;
    director_first_name?: string;
    director_contact_email?: string;
  }>;
}

export async function GET(request: Request): Promise<NextResponse<CrossProgramPulseResponse | { error: string; reason?: string }>> {
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

  // ── Step 1: resolve the caller's coach row (org_id + role + tier). ──
  // Same posture as 0028 / 0071 (LESSONS#0096) — there is no
  // `organization_members` table; org membership is `coaches.org_id`.
  const { data: callerRow } = await admin
    .from('coaches')
    .select('id, org_id, role, organizations(tier)')
    .eq('id', user.id)
    .single();

  const callerOrgId = (callerRow as any)?.org_id as string | undefined;
  const role = (callerRow as any)?.role as string | undefined;
  const tier = (((callerRow as any)?.organizations?.tier) || 'free') as Tier;

  if (!callerOrgId || callerOrgId !== orgId) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  // Tier gate FIRST so a coach-tier caller sees a structured reason: 'tier'.
  // The cross-program pulse rides the SAME `feature_program_pulse` gate that
  // already covers 0028; no new feature key per the ticket.
  if (!canAccess(tier, 'feature_program_pulse')) {
    return NextResponse.json(
      { error: 'The cross-program pulse is an Organization plan feature.', reason: 'tier' },
      { status: 403 },
    );
  }

  // Role gate — director-only surface.
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // ── Step 2: list teams in the caller's SPORT (id + org_id + sport_id). ──
  // The caller's sport is resolved from any team they own; we read every
  // team in the sport (across all orgs) to derive the program directory.
  // Allow-list select per LESSONS#0036 — only id + org_id + sport_id.
  let teamRows: Array<{ id: string; org_id: string; sport_id: string }> = [];
  try {
    const { data: callerTeams } = await admin
      .from('teams')
      .select('id, org_id, sport_id')
      .eq('org_id', orgId)
      .limit(1);
    const callerSportId = (callerTeams ?? [])[0]?.sport_id;
    if (!callerSportId) {
      // No team in the caller's org → nothing to compare. Silence.
      return NextResponse.json({ topSkill: null, neighborPrograms: [] });
    }
    const { data: sportTeams } = await admin
      .from('teams')
      .select('id, org_id, sport_id')
      .eq('sport_id', callerSportId);
    teamRows = (sportTeams ?? []) as Array<{ id: string; org_id: string; sport_id: string }>;
  } catch {
    return NextResponse.json({ topSkill: null, neighborPrograms: [] });
  }
  if (teamRows.length === 0) {
    return NextResponse.json({ topSkill: null, neighborPrograms: [] });
  }

  // Unique org_ids in the sport (the caller + neighbors).
  const sportOrgIds = Array.from(new Set(teamRows.map((t) => t.org_id)));
  // Caller's sport is whichever sport_id the caller's teams carry — pick
  // any caller team's sport_id (all teams in an org share the sport for
  // the canonical case; if a future org spans sports, we use the
  // most-common sport).
  const callerSportId = teamRows.find((t) => t.org_id === orgId)?.sport_id;
  if (!callerSportId) {
    return NextResponse.json({ topSkill: null, neighborPrograms: [] });
  }

  // ── Step 3: resolve org names (id + name). Allow-list. ──
  let orgRows: Array<{ id: string; name: string }> = [];
  try {
    const { data: orgs } = await admin
      .from('organizations')
      .select('id, name')
      .in('id', sportOrgIds);
    orgRows = (orgs ?? []) as Array<{ id: string; name: string }>;
  } catch {
    return NextResponse.json({ topSkill: null, neighborPrograms: [] });
  }
  const orgNameById = new Map(orgRows.map((o) => [o.id, o.name]));

  // ── Step 4: resolve the NEIGHBOR director (first_name + email) from
  // the org's admin coach. We pull all admin coaches in the sport's orgs
  // (excluding the caller's org for privacy — we never need the caller's
  // own admin email here). Allow-list — `coaches.select('id, org_id,
  // full_name, email, role')`. The `coach_director_contacts` table is
  // also consulted as a fallback (per the AC) but is the secondary,
  // not authoritative, source.
  const neighborOrgIds = sportOrgIds.filter((id) => id !== orgId);
  let adminRows: Array<{ id: string; org_id: string; full_name: string; email: string; role: string }> = [];
  if (neighborOrgIds.length > 0) {
    try {
      const { data: admins } = await admin
        .from('coaches')
        .select('id, org_id, full_name, email, role')
        .in('org_id', neighborOrgIds)
        .eq('role', 'admin');
      adminRows = (admins ?? []) as Array<{ id: string; org_id: string; full_name: string; email: string; role: string }>;
    } catch {
      // Best-effort — fall through with no admin attribution.
      adminRows = [];
    }
  }
  const adminByOrg = new Map<string, { full_name: string; email: string }>();
  for (const a of adminRows) {
    if (!adminByOrg.has(a.org_id)) {
      adminByOrg.set(a.org_id, { full_name: a.full_name, email: a.email });
    }
  }

  // Optionally cross-reference coach_director_contacts for any caller-side
  // prior invite — when the caller already invited the neighbor's
  // director, prefer the contacts row's first_name (the warm pre-fill
  // from 0065). Best-effort: a read failure falls through to the admin
  // attribution.
  try {
    const { data: contacts } = await admin
      .from('coach_director_contacts')
      .select('director_first_name, director_email')
      .eq('coach_id', user.id);
    const contactList = (contacts ?? []) as Array<{ director_first_name: string; director_email: string }>;
    // Map by lowercase email so a future hash-based contact still resolves.
    const contactByEmail = new Map<string, string>();
    for (const c of contactList) {
      if (c?.director_email && c?.director_first_name) {
        contactByEmail.set(c.director_email.toLowerCase(), c.director_first_name);
      }
    }
    for (const [orgIdK, attr] of adminByOrg.entries()) {
      const knownFirst = contactByEmail.get((attr.email || '').toLowerCase());
      if (knownFirst) {
        adminByOrg.set(orgIdK, { full_name: knownFirst, email: attr.email });
      }
    }
  } catch {
    // Silent fallthrough.
  }

  // ── Step 5: read the last 14 days of plans for every team in the sport.
  // Allow-list select per LESSONS#0036 — three columns only. No title, no
  // content, no content_structured, no player_id, no coach_id.
  const teamIds = teamRows.map((t) => t.id);
  const teamOrgById = new Map(teamRows.map((t) => [t.id, t.org_id]));
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  let planRows: Array<{ team_id: string; skills_targeted: string[] | null; created_at: string }> = [];
  try {
    const { data: rows, error: plansError } = await admin
      .from('plans')
      .select('team_id, skills_targeted, created_at')
      .in('team_id', teamIds)
      .gte('created_at', since);
    if (plansError) {
      return NextResponse.json({ topSkill: null, neighborPrograms: [] });
    }
    planRows = (rows ?? []) as Array<{ team_id: string; skills_targeted: string[] | null; created_at: string }>;
  } catch {
    return NextResponse.json({ topSkill: null, neighborPrograms: [] });
  }

  // ── Step 6: project rows for the pure helper. ──
  const programs: DirectorPulseProgramRow[] = sportOrgIds.map((id) => {
    const attribution = adminByOrg.get(id);
    return {
      org_id: id,
      org_name: orgNameById.get(id) ?? 'a program',
      sport_id: callerSportId,
      director_first_name: id === orgId ? undefined : extractFirstName(attribution?.full_name),
      director_contact_email: id === orgId ? undefined : attribution?.email,
    };
  });

  const plans: DirectorPulsePlanRow[] = [];
  for (const row of planRows) {
    const orgIdFor = teamOrgById.get(row.team_id);
    if (!orgIdFor) continue;
    plans.push({
      org_id: orgIdFor,
      skills_targeted: row.skills_targeted,
      created_at: row.created_at,
    });
  }

  // ── Step 7: compute the pulse. ──
  const result = computeCrossProgramDirectorPulse({
    callerOrgId: orgId,
    callerSportId,
    programs,
    plans,
    nowMs: Date.now(),
  });

  return NextResponse.json(result);
}

/**
 * Extract the director's first name from a coach's `full_name` (the
 * canonical director identity is the org admin's `coaches.full_name`).
 * Returns undefined when the input is empty.
 */
function extractFirstName(fullName: string | null | undefined): string | undefined {
  if (!fullName || typeof fullName !== 'string') return undefined;
  const trimmed = fullName.trim();
  if (!trimmed) return undefined;
  // First whitespace-separated token is the conventional first name.
  return trimmed.split(/\s+/)[0];
}
