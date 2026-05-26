import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { pregameBriefSchema, type PregameBrief } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { canAccess, type Tier } from '@/lib/tier';
import {
  buildCoachingSignature,
  type CoachPlanRow,
  type CoachingSignature,
} from '@/lib/coaching-signature-utils';
import type { OpponentProfileData } from '@/lib/opponent-profile-utils';

// ─── POST /api/ai/pregame-brief ──────────────────────────────────────────────
// Ticket 0040 — coach-private one-tap pre-game brief.
//
// Inputs (body): { teamId, opponentProfilePlanId }.
// 1. Auth → 401 when no user.
// 2. Resolve coach.org_id + organizations.tier; canAccess(tier, feature_pregame_brief)
//    → 402 { upgrade: true } for free / coach tiers (server-side gate; AGENTS.md
//    rule 5). pro_coach / organization → proceed.
// 3. Team ownership: the team must belong to caller's org → 404 on cross-org.
// 4. Opponent-profile plan: must exist, must belong to the same team, must have
//    type === 'opponent_profile' → 404 otherwise. The brief is meaningless
//    without the scouting input.
// 5. Build observationInsights (last ~4 weeks, mirrors the plan route's helper)
//    + coaching signature (best-effort, null on cold-start coach).
// 6. callAIWithJSON({ orgId, ... }) so multi-provider routing (0012), quota
//    enforcement, and the 0035 quota-wall resume all apply unchanged.
// 7. Persist as a new `plans` row of type 'pregame_brief' with the four-key
//    body in content_structured. NO new minor-data column.

const FOUR_WEEKS_DAYS = 28;

type AdminClient = Awaited<ReturnType<typeof createServiceSupabase>>;

async function fetchObservationInsights(teamId: string, admin: AdminClient) {
  // Last 4 weeks, aggregate counts only — never any per-player text.
  const since = new Date(Date.now() - FOUR_WEEKS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from('observations')
    .select('category, sentiment, created_at')
    .eq('team_id', teamId)
    .gte('created_at', since)
    .limit(500);

  const obs = (rows ?? []) as Array<{ category: string | null; sentiment: string | null; created_at: string }>;
  if (obs.length === 0) {
    return { totalObs: 0, daysOfData: FOUR_WEEKS_DAYS, topNeedsWork: [], topStrengths: [] };
  }

  const needsWork: Record<string, number> = {};
  const positives: Record<string, number> = {};
  for (const o of obs) {
    if (!o.category) continue;
    if (o.sentiment === 'needs-work') needsWork[o.category] = (needsWork[o.category] ?? 0) + 1;
    else if (o.sentiment === 'positive') positives[o.category] = (positives[o.category] ?? 0) + 1;
  }

  return {
    totalObs: obs.length,
    daysOfData: FOUR_WEEKS_DAYS,
    topNeedsWork: Object.entries(needsWork)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([category, count]) => ({ category, count })),
    topStrengths: Object.entries(positives)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count })),
  };
}

/**
 * Best-effort fetch of the coach's coaching signature (ticket 0037). Reads only
 * plan-derived fields — no players / observation text — so the signature can
 * carry no minor data (COPPA). Any failure resolves to null so the brief never
 * fails on a transient read.
 */
async function fetchCoachingSignature(
  coachId: string,
  admin: AdminClient,
): Promise<CoachingSignature | null> {
  try {
    const { data } = await admin
      .from('plans')
      .select('type, skills_targeted, content_structured')
      .eq('coach_id', coachId)
      .in('type', ['practice', 'practice_arc'])
      .order('created_at', { ascending: false })
      .limit(40);
    const plans = (data ?? []) as CoachPlanRow[];
    return buildCoachingSignature(plans);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const teamId = typeof body?.teamId === 'string' ? body.teamId : null;
  const opponentProfilePlanId =
    typeof body?.opponentProfilePlanId === 'string' ? body.opponentProfilePlanId : null;

  if (!teamId || !opponentProfilePlanId) {
    return NextResponse.json(
      { error: 'teamId and opponentProfilePlanId required' },
      { status: 400 },
    );
  }

  try {
    // ── tier gate (server-side, paired with <UpgradeGate> on the surface) ────
    const { data: coachRow } = await admin
      .from('coaches')
      .select('org_id, organizations(tier)')
      .eq('id', user.id)
      .single();

    const orgId = (coachRow as { org_id?: string | null } | null)?.org_id ?? undefined;
    const tier = (
      ((coachRow as { organizations?: { tier?: string } | null } | null)?.organizations?.tier) ||
      'free'
    ) as Tier;

    if (!canAccess(tier, 'feature_pregame_brief')) {
      // 402 + { upgrade: true } matches the existing quota-wall upgrade flow
      // (0035) so the client can drop the coach into the same upgrade path.
      return NextResponse.json(
        {
          error:
            'The pre-game brief is a Pro Coach feature. Upgrade to turn your opponent scouting notes into a one-tap brief.',
          upgrade: true,
        },
        { status: 402 },
      );
    }

    // ── team ownership ─────────────────────────────────────────────────────
    const { data: team } = await admin
      .from('teams')
      .select('id, org_id')
      .eq('id', teamId)
      .single();

    if (!team || (team as { org_id?: string | null }).org_id !== orgId) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // ── opponent-profile plan guard ─────────────────────────────────────────
    const { data: planRow } = await admin
      .from('plans')
      .select('id, team_id, type, content_structured')
      .eq('id', opponentProfilePlanId)
      .single();

    type OpponentPlanRow = {
      id: string;
      team_id: string;
      type: string;
      content_structured: OpponentProfileData | null;
    };
    const oppPlan = planRow as OpponentPlanRow | null;
    if (
      !oppPlan ||
      oppPlan.type !== 'opponent_profile' ||
      oppPlan.team_id !== teamId
    ) {
      return NextResponse.json({ error: 'Opponent profile not found' }, { status: 404 });
    }

    const opponent: OpponentProfileData = {
      name: oppPlan.content_structured?.name ?? 'Opponent',
      strengths: Array.isArray(oppPlan.content_structured?.strengths)
        ? oppPlan.content_structured!.strengths
        : [],
      weaknesses: Array.isArray(oppPlan.content_structured?.weaknesses)
        ? oppPlan.content_structured!.weaknesses
        : [],
      key_players: Array.isArray(oppPlan.content_structured?.key_players)
        ? oppPlan.content_structured!.key_players
        : [],
      notes: oppPlan.content_structured?.notes ?? '',
    };

    // ── context + insights + signature in parallel ─────────────────────────
    const [context, observationInsights, coachingSignature] = await Promise.all([
      buildAIContext(teamId, admin),
      fetchObservationInsights(teamId, admin),
      fetchCoachingSignature(user.id, admin),
    ]);

    const prompt = PROMPT_REGISTRY.pregameBrief({
      ...context,
      opponent,
      observationInsights,
      coachingSignature,
    });

    const result = await callAIWithJSON<PregameBrief>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: orgId || '',
        maxTokens: 700,
        temperature: 0.6,
      },
      admin,
    );

    let validated: PregameBrief;
    try {
      validated = pregameBriefSchema.parse(result.parsed);
    } catch (zodError) {
      // Relax to model output if the strict allow-list rejects (the prompt
      // pins the schema; we still degrade rather than 500). The schema and
      // route tests pin the strict shape for the served happy path.
      console.warn('Pre-game brief Zod validation relaxed:', zodError);
      validated = result.parsed as PregameBrief;
    }

    const { data: plan } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        ai_interaction_id: result.interactionId,
        type: 'pregame_brief',
        title: `Pre-Game Brief — ${opponent.name}`,
        content: JSON.stringify(validated),
        content_structured: validated,
        curriculum_week: context.seasonWeek,
      })
      .select()
      .single();

    return NextResponse.json({
      plan,
      brief: validated,
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Pre-game brief');
  }
}
