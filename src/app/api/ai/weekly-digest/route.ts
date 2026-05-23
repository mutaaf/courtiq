import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { weeklyDigestSchema, type WeeklyDigest } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { canAccess, type Tier } from '@/lib/tier';
import {
  groupObsByPlayer,
  countPositiveObs,
  rankPlayersByScore,
  type SpotlightObs,
} from '@/lib/player-spotlight-utils';

// ─── POST /api/ai/weekly-digest ───────────────────────────────────────────────
// Ticket 0023 — the coach-private "your week in coaching" recap.
//
// Summarizes the last 7 days of a team's observations into a structured digest
// (week_summary / top_players / next_action) via callAIWithJSON(). Gated behind
// the `feature_weekly_digest` tier key (Coach+) server-side. Generated on demand
// for the home card — nothing is persisted (no new plans.type, no migration).
//
// Best-effort by design: the home card never blocks on this read. Below a small
// observation threshold the route returns { digest: null } WITHOUT calling AI.

// Below this many observations in the last 7 days, there is nothing worth
// summarizing — return a null digest and make NO AI call (matches the AC:
// "a team with 0–2 weekly observations short-circuits before callAIWithJSON").
const MIN_WEEKLY_OBSERVATIONS = 3;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    // Resolve the caller's org + tier, and gate server-side (AGENTS.md rule 5).
    const { data: coachRow } = await admin
      .from('coaches')
      .select('org_id, organizations(tier)')
      .eq('id', user.id)
      .single();

    const orgId = (coachRow as any)?.org_id as string | undefined;
    const tier = (((coachRow as any)?.organizations?.tier) || 'free') as Tier;

    if (!canAccess(tier, 'feature_weekly_digest')) {
      return NextResponse.json(
        { error: 'The weekly coaching digest is a Coach plan feature. Upgrade to see your week in coaching.' },
        { status: 403 }
      );
    }

    // Verify the team belongs to the caller's org BEFORE reading its data. An
    // unowned team is treated as not-found so we never leak its existence and
    // never read its observations (AC: cross-org teamId → 404, no obs read).
    const { data: team } = await admin
      .from('teams')
      .select('id, org_id')
      .eq('id', teamId)
      .single();

    if (!team || (team as any).org_id !== orgId) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Fetch the last 7 days of observations for the team (mirrors weekly-star).
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: obsRows } = await admin
      .from('observations')
      .select('id, player_id, category, sentiment, text, created_at, players:player_id(name)')
      .eq('team_id', teamId)
      .gte('created_at', since)
      .not('player_id', 'is', null)
      .order('created_at', { ascending: true });

    const allObs: SpotlightObs[] = (obsRows ?? []).map((o: any) => ({
      player_id: o.player_id as string,
      player_name: (o.players as any)?.name ?? 'Unknown',
      sentiment: o.sentiment as 'positive' | 'needs-work' | 'neutral',
      category: o.category as string,
      text: o.text as string,
      created_at: o.created_at as string,
    }));

    // Quiet week → null digest, no AI call (best-effort, no nag).
    if (allObs.length < MIN_WEEKLY_OBSERVATIONS) {
      return NextResponse.json({ digest: null });
    }

    // Group + rank players by how much they showed up in the coach's notes.
    const grouped = groupObsByPlayer(allObs);
    const ranked = rankPlayersByScore(grouped).slice(0, 3);

    const playerSummaries = ranked.map((p) => {
      const positiveCount = countPositiveObs(p.obs);
      const needsWorkCount = p.obs.filter((o) => o.sentiment === 'needs-work').length;
      const topCategory = mostCommonCategory(p.obs);
      // Prefer a positive observation as the representative sample.
      const sample = p.obs.find((o) => o.sentiment === 'positive') ?? p.obs[0];
      return {
        player_name: (p.player_name || 'Player').split(' ')[0], // first name only (COPPA)
        positiveCount,
        needsWorkCount,
        topCategory,
        sampleObservation: sample?.text ?? '',
      };
    });

    // Candidate next actions the digest can choose from. The kinds are the closed
    // enum the home card maps to existing routes; the digest deep-links into
    // surfaces that already exist (parent report / weekly star / plan / capture).
    const sessionCount = countDistinctDays(allObs);
    const candidateActions = [
      {
        kind: 'parent_report',
        label: `Send ${playerSummaries[0]?.player_name ?? 'a player'}'s parents an update`,
        reason: 'Parents have not had an update on their player recently.',
      },
      {
        kind: 'weekly_star',
        label: 'Pick this week’s Weekly Star',
        reason: 'There were standout moments worth celebrating with the team.',
      },
      {
        kind: 'practice_plan',
        label: 'Plan the next practice',
        reason: 'Turn this week’s needs-work notes into the next session.',
      },
      {
        kind: 'capture',
        label: 'Capture your next session',
        reason: 'Keep the week’s momentum going at the next practice.',
      },
    ];

    const context = await buildAIContext(teamId, admin);

    const prompt = PROMPT_REGISTRY.weeklyDigest({
      ...context,
      totalObservations: allObs.length,
      sessionCount,
      players: playerSummaries,
      candidateActions,
    });

    const result = await callAIWithJSON<WeeklyDigest>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: orgId || '',
        maxTokens: 600,
        temperature: 0.6,
      },
      admin
    );

    let digest: WeeklyDigest;
    try {
      digest = weeklyDigestSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Weekly digest Zod validation relaxed:', zodError);
      digest = result.parsed as WeeklyDigest;
    }

    return NextResponse.json({ digest, interactionId: result.interactionId });
  } catch (error: unknown) {
    return handleAIError(error, 'Weekly digest generation');
  }
}

/** Most common observation category for a player (ties broken by first seen). */
function mostCommonCategory(obs: SpotlightObs[]): string {
  const counts: Record<string, number> = {};
  let best = obs[0]?.category ?? 'Effort';
  let bestN = 0;
  for (const o of obs) {
    counts[o.category] = (counts[o.category] ?? 0) + 1;
    if (counts[o.category] > bestN) {
      bestN = counts[o.category];
      best = o.category;
    }
  }
  return best;
}

/** Count distinct calendar days the observations span — a proxy for sessions. */
function countDistinctDays(obs: SpotlightObs[]): number {
  return new Set(obs.map((o) => o.created_at.slice(0, 10))).size;
}
