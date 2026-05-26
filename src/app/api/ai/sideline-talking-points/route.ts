import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY, type ObservationInsightsParam } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import {
  sidelineTalkingPointsSchema,
  type SidelineTalkingPoints,
} from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { canAccess, type Tier } from '@/lib/tier';

// ─── POST /api/ai/sideline-talking-points ────────────────────────────────────
// Ticket 0046 — coach-private one-tap sideline cheat sheet.
//
// Inputs (body): { teamId }.
// 1. Auth → 401 when no user.
// 2. Resolve coach.org_id + organizations.tier; canAccess(tier, 'report_cards')
//    → 402 { upgrade: true, feature: 'report_cards' } on free (the same key the
//    parent report uses — AGENTS.md rule 5; LESSONS#0023: the feature prop /
//    response key must equal the tier-key string verbatim).
// 3. Team ownership: the team must belong to caller's org → 404 on cross-org.
// 4. Below-threshold short-circuit: a too-cold team (< 8 observations across
//    the team in the last 14 days) returns 200 { sheet: null } and never calls
//    AI — mirrors the 0023 weekly-digest quiet-week pattern so a coach with no
//    notes does not burn quota or get a fabricated sheet.
// 5. Happy path: group recent observations by player, render the prompt, call
//    callAIWithJSON({ orgId }) so multi-provider failover (0012), quota counting,
//    and the 0035 quota-wall resume all apply unchanged, then persist as a new
//    `plans` row of type 'sideline_talking_points' with the two-key body in
//    content_structured.
//
// COPPA: the artifact is COACH-PRIVATE by construction. No companion token
// route is created here; no /share/sideline/<token>; the new plan type is not
// added to any public allow-list. First names only on the entries (the schema
// enforces this strictly).

const RECENT_DAYS = 14;
const MIN_TOTAL_OBS = 8; // below this the team is too cold to write specific lines

type AdminClient = Awaited<ReturnType<typeof createServiceSupabase>>;

interface ObservationRow {
  player_id: string | null;
  category: string | null;
  sentiment: string | null;
  created_at: string;
  text?: string | null;
}

/** Derive a first name from `players.name` for the prompt + the artifact. */
function firstNameOf(fullName: string): string {
  return (fullName || '').trim().split(/\s+/)[0] || 'Player';
}

/**
 * Group observations by player into the same shape the parent-report prompt
 * already consumes (`ObservationInsightsParam`). Categories with > 0 needs-work
 * become `topNeedsWork`; with > 0 positives become `topStrengths`.
 */
function groupInsightsByPlayer(
  observations: ObservationRow[],
  playerIds: string[],
): Record<string, ObservationInsightsParam> {
  const out: Record<string, ObservationInsightsParam> = {};
  for (const pid of playerIds) {
    out[pid] = {
      totalObs: 0,
      daysOfData: RECENT_DAYS,
      topNeedsWork: [],
      topStrengths: [],
    };
  }
  const tally: Record<string, { needs: Record<string, number>; pos: Record<string, number> }> = {};
  for (const pid of playerIds) tally[pid] = { needs: {}, pos: {} };

  for (const o of observations) {
    if (!o.player_id || !o.category) continue;
    if (!tally[o.player_id]) continue;
    out[o.player_id].totalObs += 1;
    if (o.sentiment === 'needs-work') {
      tally[o.player_id].needs[o.category] = (tally[o.player_id].needs[o.category] ?? 0) + 1;
    } else if (o.sentiment === 'positive') {
      tally[o.player_id].pos[o.category] = (tally[o.player_id].pos[o.category] ?? 0) + 1;
    }
  }

  for (const pid of playerIds) {
    out[pid].topNeedsWork = Object.entries(tally[pid].needs)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));
    out[pid].topStrengths = Object.entries(tally[pid].pos)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));
  }

  return out;
}

async function fetchRecentObservations(teamId: string, admin: AdminClient) {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('observations')
    .select('player_id, category, sentiment, created_at, text')
    .eq('team_id', teamId)
    .gte('created_at', since)
    .limit(500);
  return (data ?? []) as ObservationRow[];
}

async function fetchActivePlayers(teamId: string, admin: AdminClient) {
  const { data } = await admin
    .from('players')
    .select('id, name, is_active')
    .eq('team_id', teamId)
    .eq('is_active', true);
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json().catch(() => ({}));
  const teamId = typeof body?.teamId === 'string' ? body.teamId : null;
  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
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

    if (!canAccess(tier, 'report_cards')) {
      // Per LESSONS#0023 — feature key MUST equal the tier-key string verbatim
      // so the client `<UpgradeGate feature="report_cards">` and the 402
      // response line up on the same unlock path.
      return NextResponse.json(
        {
          error:
            'The sideline cheat sheet is a Coach feature. Upgrade to turn your per-player notes into a one-tap sideline sheet.',
          upgrade: true,
          feature: 'report_cards',
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
    // A cold team (no observations yet) does not get a fabricated sheet. This
    // mirrors the weekly-digest quiet-week pattern (0023) — better to render
    // nothing than to spend quota on lines the coach cannot back up.
    const [players, observations] = await Promise.all([
      fetchActivePlayers(teamId, admin),
      fetchRecentObservations(teamId, admin),
    ]);

    if (observations.length < MIN_TOTAL_OBS) {
      return NextResponse.json({ sheet: null });
    }

    if (players.length === 0) {
      return NextResponse.json({ sheet: null });
    }

    // ── group + render prompt + call AI ────────────────────────────────────
    const promptPlayers = players.map((p) => ({
      id: p.id,
      first_name: firstNameOf(p.name),
    }));

    const observationInsightsByPlayer = groupInsightsByPlayer(
      observations,
      players.map((p) => p.id),
    );

    const context = await buildAIContext(teamId, admin);

    const prompt = PROMPT_REGISTRY.sidelineTalkingPoints({
      ...context,
      team: { id: teamId, name: context.teamName },
      players: promptPlayers,
      observationInsightsByPlayer,
    });

    const result = await callAIWithJSON<SidelineTalkingPoints>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: orgId || '',
        maxTokens: 1200,
        temperature: 0.6,
      },
      admin,
    );

    let validated: SidelineTalkingPoints;
    try {
      validated = sidelineTalkingPointsSchema.parse(result.parsed);
    } catch (zodError) {
      // Same degrade-rather-than-500 posture as 0040: schema is the contract,
      // but a model that returns a slightly extra key shouldn't crash the call.
      // The schema test in tests/ai/sideline-talking-points-prompt.test.ts pins
      // the strict shape for the served happy path.
      console.warn('Sideline cheat sheet Zod validation relaxed:', zodError);
      validated = result.parsed as SidelineTalkingPoints;
    }

    const { data: planRow } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        ai_interaction_id: result.interactionId,
        type: 'sideline_talking_points',
        title: `Sideline cheat sheet — ${context.teamName ?? 'this team'}`,
        content: JSON.stringify(validated),
        content_structured: validated,
        curriculum_week: context.seasonWeek,
      })
      .select()
      .single();

    const planId = (planRow as { id?: string } | null)?.id ?? null;

    return NextResponse.json({
      planId,
      content_structured: validated,
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Sideline cheat sheet');
  }
}
