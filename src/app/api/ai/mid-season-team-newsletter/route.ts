import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import {
  midSeasonTeamNewsletterSchema,
  type MidSeasonTeamNewsletter,
} from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { canAccess, type Tier } from '@/lib/tier';
import {
  buildCoachingSignature,
  type CoachPlanRow,
  type CoachingSignature,
} from '@/lib/coaching-signature-utils';

// ─── POST /api/ai/mid-season-team-newsletter ─────────────────────────────────
// Ticket 0043 — TEAM-WIDE mid-season parent newsletter (five short blocks).
//
// Inputs (body): { teamId }.
// 1. Auth → 401 when no user.
// 2. Resolve coach.org_id + organizations.tier; canAccess(tier, 'parent_sharing')
//    → 402 { upgrade: true, feature: 'parent_sharing' } for free tier
//    (server-side gate; AGENTS.md rule 5). Coach / Pro / Org → proceed.
//    Re-uses the EXISTING `parent_sharing` tier-key (no new entry in
//    FEATURE_CONFIG / no new tier-limit constant — the surface gate also
//    uses the same key verbatim, LESSONS#0023).
// 3. Team ownership: the team must belong to the caller's org → 404 on
//    cross-org.
// 4. Below-threshold short-circuit: fewer than 6 observations across the
//    last 6 weeks → 200 { newsletter: null } and the AI is NEVER called
//    (mirrors the 0023 below-threshold philosophy — a coach with no notes
//    cannot produce an honest team newsletter, and the worst outcome is
//    inventing one).
// 5. Build inputs (last 6 weeks of observations, the cross-team coaching
//    signature) and call callAIWithJSON({ orgId, ... }) so multi-provider
//    routing (0012), quota enforcement, and the 0035 quota-wall resume all
//    apply unchanged.
// 6. Persist as a new `plans` row of type 'mid_season_team_newsletter' with
//    the five-key body in content_structured. NO new minor-data column.

const SIX_WEEKS_DAYS = 42;
// The minimum number of observations across the 6-week window before the
// route is willing to ask the model to write a team arc. Under this floor
// the route returns 200 { newsletter: null } and never calls the AI —
// keeping the artifact honest (the prompt says "ground the arc in the
// team's real notes" and there is no honest grounding under the floor).
const MIN_OBS_FOR_NEWSLETTER = 6;

type AdminClient = Awaited<ReturnType<typeof createServiceSupabase>>;

interface RawObservation {
  category: string | null;
  sentiment: string | null;
  created_at: string;
}

async function fetchObservationInsights(teamId: string, admin: AdminClient) {
  // Last 6 weeks, aggregate counts only — never any per-player text.
  const since = new Date(Date.now() - SIX_WEEKS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from('observations')
    .select('category, sentiment, created_at')
    .eq('team_id', teamId)
    .gte('created_at', since)
    .limit(500);

  const obs = (rows ?? []) as RawObservation[];
  if (obs.length === 0) {
    return { totalObs: 0, daysOfData: SIX_WEEKS_DAYS, topNeedsWork: [], topStrengths: [] };
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
    daysOfData: SIX_WEEKS_DAYS,
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
 * Best-effort fetch of the coach's cross-team coaching signature (0037). Plan-
 * derived fields only — no players / observation text — so the signature can
 * carry no minor data (COPPA). Any failure resolves to null so the newsletter
 * never fails on a transient read.
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

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    // ── tier gate (server-side, paired with <UpgradeGate feature="parent_sharing">) ──
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

    if (!canAccess(tier, 'parent_sharing')) {
      // 402 + { upgrade: true, feature: 'parent_sharing' } so the client can
      // map the response to the exact same UpgradeGate copy the surface
      // already uses (the feature string is the tier-key verbatim per
      // LESSONS#0023). 0035 quota-wall path returns the same shape.
      return NextResponse.json(
        {
          error:
            'The mid-season team newsletter is a paid feature. Upgrade to share team updates with every parent at once.',
          upgrade: true,
          feature: 'parent_sharing',
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

    // ── below-threshold short-circuit ──────────────────────────────────────
    const observationInsights = await fetchObservationInsights(teamId, admin);
    if (observationInsights.totalObs < MIN_OBS_FOR_NEWSLETTER) {
      // The route returns 200 + { newsletter: null } (NOT 404 or 422) so the
      // client surface can render a quiet "not enough notes yet" empty state
      // rather than an error. No AI call → no quota burn on a team with not
      // enough material to write an honest team arc.
      return NextResponse.json({ newsletter: null });
    }

    // ── context + signature in parallel ────────────────────────────────────
    const [context, coachingSignature] = await Promise.all([
      buildAIContext(teamId, admin),
      fetchCoachingSignature(user.id, admin),
    ]);

    const prompt = PROMPT_REGISTRY.midSeasonTeamNewsletter({
      ...context,
      team: { id: teamId, name: context.teamName },
      observationInsights,
      coachingSignature,
    });

    const result = await callAIWithJSON<MidSeasonTeamNewsletter>(
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

    let validated: MidSeasonTeamNewsletter;
    try {
      validated = midSeasonTeamNewsletterSchema.parse(result.parsed);
    } catch (zodError) {
      // Relax to model output if the strict allow-list rejects (the prompt
      // pins the schema; we still degrade to a 200 with the model's body
      // rather than 500 the request). The contract test pins the strict
      // shape for the served happy path.
      console.warn('Mid-season newsletter Zod validation relaxed:', zodError);
      validated = result.parsed as MidSeasonTeamNewsletter;
    }

    const { data: plan } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        ai_interaction_id: result.interactionId,
        type: 'mid_season_team_newsletter',
        title: `Mid-Season Newsletter — ${context.teamName || 'Team'}`,
        content: JSON.stringify(validated),
        content_structured: validated,
        curriculum_week: context.seasonWeek,
      })
      .select()
      .single();

    return NextResponse.json({
      planId: (plan as { id?: string } | null)?.id ?? null,
      plan,
      newsletter: validated,
      content_structured: validated,
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Mid-season team newsletter');
  }
}
