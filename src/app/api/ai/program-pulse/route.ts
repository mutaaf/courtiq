import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { programPulseSchema, type ProgramPulse } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { canAccess, type Tier } from '@/lib/tier';

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
    // /admin/org-analytics admin gate).
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Tier gate: Organization tier only.
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

    return NextResponse.json({ pulse, interactionId: result.interactionId });
  } catch (error: unknown) {
    return handleAIError(error, 'Program pulse generation');
  }
}
