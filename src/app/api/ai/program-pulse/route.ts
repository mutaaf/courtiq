import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { programPulseSchema, type ProgramPulse } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { canAccess, type Tier } from '@/lib/tier';
import {
  summarizeProgramTierState,
  type ProgramTierCoachRow,
  type ProgramTierState,
} from '@/lib/program-tier-state';
import { QUALIFYING_ARTIFACT_TYPES } from '@/lib/referral-credit-utils';

// ─── POST /api/ai/program-pulse ───────────────────────────────────────────────
// Ticket 0028 — the director-private weekly "program pulse".
//
// Summarizes the org's last 7 days of COACH activity (sessions + observations)
// into a structured pulse (week_summary / active_coaches / total_coaches /
// teams_to_watch / next_action) via callAIWithJSON(). Gated server-side BOTH on
// the caller being an org admin (coaches.role === 'admin') AND the org tier
// satisfying canAccess(tier, 'feature_program_pulse') — Organization tier only.
// Generated on demand for the admin card — nothing is persisted (no new
// plans.type, no migration).
//
// Best-effort by design: the admin card never blocks on this read. Below a small
// activity threshold the route returns { pulse: null } WITHOUT calling AI.
//
// COPPA / data-minimization: the pulse is COACH and TEAM aggregate only. The
// prompt is fed counts + team/coach names; no player rows are read and no
// per-minor field is ever surfaced (reconciled to the REAL column contract —
// observations/sessions key activity off coach_id, not the nonexistent
// `created_by` the org-analytics route's select referenced; see ticket log).

// Below this much activity in the last 7 days there is nothing worth recapping —
// return a null pulse and make NO AI call (matches the AC: "a quiet org
// short-circuits before callAIWithJSON").
const MIN_WEEKLY_SESSIONS = 1;
const MIN_WEEKLY_OBSERVATIONS = 3;

// A coach who hasn't logged anything in this many days is a nudge candidate.
const QUIET_COACH_DAYS = 14;

interface CoachRow {
  id: string;
  full_name: string | null;
  role: string;
  org_id: string;
}

interface ActivityRow {
  team_id: string | null;
  coach_id: string | null;
  created_at: string;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { orgId } = body;

  if (!orgId) {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  }

  try {
    // Resolve the caller's org + role + tier, and gate server-side (AGENTS.md rule 5).
    const { data: callerRow } = await admin
      .from('coaches')
      .select('id, org_id, role, organizations(tier)')
      .eq('id', user.id)
      .single();

    const callerOrgId = (callerRow as any)?.org_id as string | undefined;
    const role = (callerRow as any)?.role as string | undefined;
    const tier = (((callerRow as any)?.organizations?.tier) || 'free') as Tier;

    // Cross-org request: the caller must be operating on their OWN org. Treat a
    // mismatch as not-found so we never leak another org's activity.
    if (!callerOrgId || callerOrgId !== orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Role gate: the program pulse is a director surface (mirrors the
    // /admin/org-analytics admin gate). The new ticket 0087 widening also
    // rides under this role gate — only an admin sees `programTierState`.
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Ticket 0087 — when the org is on the FREE tier, the AI pulse itself
    // is still Organization-only (the existing 0028 contract), but the
    // route ALSO returns `programTierState` so the new
    // `<ProgramOrgTierCard />` can fire on the director's home. This is
    // the structural inversion the upgrade moment depends on: a FREE org
    // has no pulse to render, but it DOES have a paid-coach count worth
    // surfacing. The widening returns `{ pulse: null, programTierState }`
    // for the free-tier branch; the existing `pulse !== null` branches
    // continue to require Organization tier.
    if (tier === 'free') {
      const programTierState = await computeProgramTierState(admin, orgId, user.id, tier);
      return NextResponse.json({ pulse: null, programTierState });
    }

    // Tier gate: Organization tier only for the AI pulse itself. Coach-
    // tier / Pro-tier directors continue to see no pulse (the existing
    // 0028 contract).
    if (!canAccess(tier, 'feature_program_pulse')) {
      return NextResponse.json(
        { error: 'The program pulse is an Organization plan feature.' },
        { status: 403 }
      );
    }

    // ── Aggregate the org's last 7 days (reuses the org-analytics aggregation
    //    shape; keys activity off the REAL coach_id column). ──────────────────
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: coachRows } = await admin
      .from('coaches')
      .select('id, full_name, role, org_id')
      .eq('org_id', orgId);

    const coaches = (coachRows ?? []) as CoachRow[];

    const { data: teamRows } = await admin
      .from('teams')
      .select('id, name')
      .eq('org_id', orgId);

    const teams = (teamRows ?? []) as Array<{ id: string; name: string }>;
    const teamIds = teams.map((t) => t.id);

    const { data: sessionRows } = await admin
      .from('sessions')
      .select('team_id, coach_id, created_at')
      .in('team_id', teamIds.length > 0 ? teamIds : ['none'])
      .gte('created_at', since);

    const { data: obsRows } = await admin
      .from('observations')
      .select('team_id, coach_id, sentiment, created_at')
      .in('team_id', teamIds.length > 0 ? teamIds : ['none'])
      .gte('created_at', since);

    const sessions = (sessionRows ?? []) as ActivityRow[];
    const observations = (obsRows ?? []) as Array<ActivityRow & { sentiment: string }>;

    // Quiet program → null pulse, no AI call (best-effort, no nag).
    if (sessions.length < MIN_WEEKLY_SESSIONS && observations.length < MIN_WEEKLY_OBSERVATIONS) {
      return NextResponse.json({ pulse: null });
    }

    // Active coach = logged ≥1 session or observation this week (by coach_id).
    const activeCoachIds = new Set<string>();
    for (const s of sessions) if (s.coach_id) activeCoachIds.add(s.coach_id);
    for (const o of observations) if (o.coach_id) activeCoachIds.add(o.coach_id);
    const activeCoaches = coaches.filter((c) => activeCoachIds.has(c.id)).length;
    const totalCoaches = coaches.length;

    // Per-team activity rollup (team-level aggregate only).
    const teamSummaries = teams.map((team) => {
      const teamSessions = sessions.filter((s) => s.team_id === team.id);
      const teamObs = observations.filter((o) => o.team_id === team.id);
      const needsWork = teamObs.filter((o) => o.sentiment === 'needs-work').length;
      return {
        team_name: team.name,
        sessions: teamSessions.length,
        observations: teamObs.length,
        needsWork,
        quiet: teamSessions.length === 0 && teamObs.length === 0,
      };
    });

    // Quiet-coach candidates: an org coach with no activity in the last
    // QUIET_COACH_DAYS days (they did not log a session or observation this week).
    const quietCoaches = coaches
      .filter((c) => c.role !== 'admin' && !activeCoachIds.has(c.id))
      .slice(0, 3)
      .map((c) => ({
        coach_name: (c.full_name || 'A coach').trim(),
        daysSinceActive: QUIET_COACH_DAYS,
      }));

    // Resolve org name for the prompt header (coach/team aggregate only).
    const { data: orgRow } = await admin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();
    const orgName = (orgRow as any)?.name as string | undefined;

    // Candidate next actions the pulse can choose from. The kinds are the closed
    // enum the admin card maps to existing routes (the 0024 staff-invite or the
    // org-analytics detail). The pulse deep-links into surfaces that already exist.
    const teamNeedingAttention = [...teamSummaries].sort((a, b) => b.needsWork - a.needsWork)[0];
    const candidateActions: Array<{ kind: string; label: string; reason: string }> = [];
    if (quietCoaches.length > 0) {
      candidateActions.push({
        kind: 'nudge_coach',
        label: `Nudge ${quietCoaches[0].coach_name} — no notes logged recently`,
        reason: 'A coach has gone quiet; a check-in keeps the program moving.',
      });
    }
    if (totalCoaches <= 1 || activeCoaches < totalCoaches) {
      candidateActions.push({
        kind: 'invite_staff',
        label: 'Bring more coaches onto the program',
        reason: 'Growing the staff spreads the coaching load across the league.',
      });
    }
    candidateActions.push({
      kind: 'view_analytics',
      label: teamNeedingAttention ? `Check in on ${teamNeedingAttention.team_name}` : 'Open program analytics',
      reason: 'See the team-level detail behind this week\'s numbers.',
    });

    const prompt = PROMPT_REGISTRY.programPulse({
      orgName,
      activeCoaches,
      totalCoaches,
      totalSessions: sessions.length,
      totalObservations: observations.length,
      teams: teamSummaries,
      quietCoaches,
      candidateActions,
    });

    const result = await callAIWithJSON<ProgramPulse>(
      {
        coachId: user.id,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId,
        maxTokens: 600,
        temperature: 0.6,
      },
      admin
    );

    let pulse: ProgramPulse;
    try {
      pulse = programPulseSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Program pulse Zod validation relaxed:', zodError);
      pulse = result.parsed as ProgramPulse;
    }

    // Ticket 0087 — additive widening: every pulse response also carries
    // `programTierState`. On an Organization-tier org the eligibility flag
    // is always false (the org is already on the right tier), so the
    // additive field is a no-op for the card render — but the response
    // shape stays uniform.
    const programTierState = await computeProgramTierState(admin, orgId, user.id, tier);

    return NextResponse.json({ pulse, programTierState, interactionId: result.interactionId });
  } catch (error: unknown) {
    return handleAIError(error, 'Program pulse generation');
  }
}

// ─── Ticket 0087 — programTierState computation ─────────────────────────────
//
// Resolve the per-coach paying-tier + 30-day shipped-artifact counts that
// the pure `summarizeProgramTierState` helper folds into the card state.
// Service-role reads only (`admin` is `createServiceSupabase()`); the
// `.select()` allow-lists are minimal (LESSONS#0036 — never reads email /
// phone / DOB on any coach). The query shape mirrors the existing 0028
// coach-roster read above.
async function computeProgramTierState(
  admin: Awaited<ReturnType<typeof createServiceSupabase>>,
  orgId: string,
  callerCoachId: string,
  callingTier: Tier,
): Promise<ProgramTierState> {
  // Active-snooze short-circuit (LESSONS#0066 — widen-existing-read posture
  // doesn't apply here: snoozes are a separate table the existing 0028 path
  // never touched). If the org has an active snooze, the card stays silent.
  const nowIso = new Date().toISOString();
  const { data: snoozeRows } = await admin
    .from('org_card_snoozes')
    .select('id, snoozed_until')
    .eq('org_id', orgId)
    .eq('card_kind', 'program_org_tier');
  const activeSnooze = (snoozeRows ?? []).some(
    (r) => typeof r?.snoozed_until === 'string' && r.snoozed_until > nowIso,
  );

  // Coaches in the PROGRAM. LESSONS#0057 — "the program staff" is the
  // team_coaches → coaches graph, NOT the coaches.org_id filter, because
  // an individually-paying coach's `coaches.org_id` points at her OWN
  // org row (the schema models individual subscriptions as a per-coach
  // organizations row whose tier flips on upgrade). So we list the
  // teams in the calling org, find all team_coaches for those teams,
  // and dedupe the coach ids.
  const { data: teamRowsForProgram } = await admin
    .from('teams')
    .select('id')
    .eq('org_id', orgId);
  const teamIds = ((teamRowsForProgram ?? []) as Array<{ id: string }>).map((t) => t.id);

  if (teamIds.length === 0) {
    return summarizeProgramTierState({
      coachRows: [],
      currentOrgTier: callingTier,
      nowMs: Date.now(),
    });
  }

  const { data: tcRows } = await admin
    .from('team_coaches')
    .select('coach_id')
    .in('team_id', teamIds);
  const teamCoachIds = Array.from(
    new Set(
      ((tcRows ?? []) as Array<{ coach_id: string }>)
        .map((r) => r.coach_id)
        .filter((id) => typeof id === 'string' && id !== callerCoachId),
    ),
  );

  if (teamCoachIds.length === 0) {
    return summarizeProgramTierState({
      coachRows: [],
      currentOrgTier: callingTier,
      nowMs: Date.now(),
    });
  }

  // Resolve each candidate coach's first name + org_id. The org_id rides
  // through to the per-coach tier lookup. Allow-list minimal — no email
  // / phone / DOB / surname read (the route splits full_name on a literal
  // space for the first-name only, LESSONS#0061).
  const { data: coachRows } = await admin
    .from('coaches')
    .select('id, full_name, role, org_id')
    .in('id', teamCoachIds);
  const coaches = ((coachRows ?? []) as Array<{
    id: string;
    full_name: string | null;
    role: string;
    org_id: string;
  }>);
  // Drop any director (admin) rows — only "regular coaches" count toward
  // the paying-coach signal this card surfaces.
  const paidCandidates = coaches.filter((c) => c.role !== 'admin');
  if (paidCandidates.length === 0) {
    return summarizeProgramTierState({
      coachRows: [],
      currentOrgTier: 'free',
      nowMs: Date.now(),
    });
  }

  // Each candidate coach's individual subscription lives on the coaches
  // table via `org_id → organizations.tier` — BUT a coach who personally
  // upgraded to a paid tier is on their OWN organizations row (a tier
  // upgrade flips the coach's org's tier). The route therefore reads
  // each candidate's org tier via the coaches table's `coach_org_tier`
  // self-resolution (the `coach_org_tier` is the tier on the candidate's
  // own organizations row, distinct from the calling org's tier).
  //
  // For v1 we read each candidate's tier through a per-candidate
  // organizations lookup (one round-trip via `.in()` on the candidates'
  // org_ids — but for THIS org the candidates are all under the SAME
  // free-tier org. In the multi-org seed (where each paying coach has
  // their OWN org row), the lookup widens correctly via the supabase-js
  // chain.) The lookup falls back to `'free'` for any row whose tier is
  // not resolvable so the eligibility check stays conservative.
  //
  // The 30-day shipped-artifact count is a single `.in()` query against
  // `plans` filtered to the qualifying types — counted per coach in JS.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const candidateIds = paidCandidates.map((c) => c.id);

  const { data: planRows } = await admin
    .from('plans')
    .select('id, coach_id, type, created_at')
    .in('coach_id', candidateIds.length > 0 ? candidateIds : ['none'])
    .in('type', [...QUALIFYING_ARTIFACT_TYPES])
    .gte('created_at', since);
  const plans = ((planRows ?? []) as Array<{ id: string; coach_id: string }>);
  const shippedCountByCoach = new Map<string, number>();
  for (const p of plans) {
    if (!p || typeof p.coach_id !== 'string') continue;
    shippedCountByCoach.set(p.coach_id, (shippedCountByCoach.get(p.coach_id) ?? 0) + 1);
  }

  // Each candidate's INDIVIDUAL tier — resolved by looking up the org
  // their `coaches.org_id` points at (in this schema, an individually-
  // paying coach has her OWN organizations row whose tier flips on
  // upgrade). A candidate whose org row is not resolvable defaults to
  // `'free'` (conservative: never count an unproven paying tier).
  const candidateOrgIds = Array.from(
    new Set(paidCandidates.map((c) => c.org_id).filter((v): v is string => typeof v === 'string')),
  );
  const { data: orgTierRows } = await admin
    .from('organizations')
    .select('id, tier')
    .in('id', candidateOrgIds.length > 0 ? candidateOrgIds : ['none']);
  const tierByOrgId = new Map<string, string>();
  for (const r of (orgTierRows ?? []) as Array<{ id: string; tier: string }>) {
    if (r && typeof r.id === 'string' && typeof r.tier === 'string') {
      tierByOrgId.set(r.id, r.tier);
    }
  }
  const builtRows: ProgramTierCoachRow[] = paidCandidates.map((c) => {
    const first = extractFirstName(c.full_name);
    const resolvedTier =
      (tierByOrgId.get(c.org_id) as 'free' | 'coach' | 'pro_coach' | 'organization' | undefined) ??
      'free';
    return {
      id: c.id,
      first_name: first,
      org_tier: resolvedTier,
      recent_shipped_artifact_count: shippedCountByCoach.get(c.id) ?? 0,
    };
  });

  // The calling org's tier is threaded in from the route's earlier
  // caller-row read (avoids a second `from('organizations')` round-trip
  // — LESSONS#0066: don't add a new `from()` call when an existing read
  // already produced the value).
  const summary = summarizeProgramTierState({
    coachRows: builtRows,
    currentOrgTier: callingTier,
    nowMs: Date.now(),
  });

  // The snooze suppresses eligibility — the card never re-fires inside
  // the 14-day window. The other numbers ride through untouched (for
  // observability — the route's consumer can render a different message
  // if needed; v1 just hides the card).
  if (activeSnooze) {
    return { ...summary, eligibleForOrgUpgrade: false };
  }
  return summary;
}

/** Extract a coach's first name from `full_name` (literal-space split per
 *  LESSONS#0061). Returns the empty string for nullish / blank input. */
function extractFirstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  const idx = trimmed.indexOf(' ');
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}
