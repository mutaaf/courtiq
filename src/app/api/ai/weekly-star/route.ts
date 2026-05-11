import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { weeklyStarSchema, type WeeklyStar } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  groupObsByPlayer,
  selectWeeklyStarCandidate,
  filterPositiveObs,
  getWeekLabel,
} from '@/lib/player-spotlight-utils';

// ─── POST /api/ai/weekly-star ─────────────────────────────────────────────────
// Analyzes the last 7 days of observations for the team, picks the standout
// player by score (positive obs density × category breadth × consistency), then
// calls AI to write a celebratory spotlight.  Saves as plan type `weekly_star`.

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
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // Fetch last 7 days of observations with player name
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: obsRows } = await admin
      .from('observations')
      .select('id, player_id, category, sentiment, text, created_at, players:player_id(name)')
      .eq('team_id', teamId)
      .gte('created_at', since)
      .not('player_id', 'is', null)
      .order('created_at', { ascending: true });

    const allObs = (obsRows ?? []).map((o: any) => ({
      player_id: o.player_id as string,
      player_name: (o.players as any)?.name ?? 'Unknown',
      sentiment: o.sentiment as 'positive' | 'needs-work' | 'neutral',
      category: o.category as string,
      text: o.text as string,
      created_at: o.created_at as string,
    }));

    if (allObs.length < 4) {
      return NextResponse.json(
        { error: 'Not enough observations this week to pick a standout player. Record a few more sessions first!' },
        { status: 422 }
      );
    }

    const grouped = groupObsByPlayer(allObs);
    const candidate = selectWeeklyStarCandidate(grouped);

    if (!candidate) {
      return NextResponse.json(
        { error: 'No player has enough observations this week. Keep recording and try again!' },
        { status: 422 }
      );
    }

    const positiveObs = filterPositiveObs(candidate.obs);
    if (positiveObs.length === 0) {
      return NextResponse.json(
        { error: 'The top candidate has no positive observations this week. Add some encouraging notes first!' },
        { status: 422 }
      );
    }

    const context = await buildAIContext(teamId, admin);
    const weekLabel = getWeekLabel();

    const prompt = PROMPT_REGISTRY.playerWeeklyStar({
      ...context,
      playerName: candidate.player_name,
      weekLabel,
      positiveObservations: positiveObs.map((o) => ({ category: o.category, text: o.text })),
      totalObsCount: candidate.obs.length,
    });

    const result = await callAIWithJSON<WeeklyStar>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 600,
        temperature: 0.7,
      },
      admin
    );

    let validated: WeeklyStar;
    try {
      validated = weeklyStarSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Weekly star Zod validation relaxed:', zodError);
      validated = result.parsed as WeeklyStar;
    }

    // Ensure week_label matches server-computed value
    validated.week_label = weekLabel;

    const { data: plan } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        ai_interaction_id: result.interactionId,
        type: 'weekly_star',
        title: `Weekly Star — ${candidate.player_name} (${weekLabel})`,
        content: JSON.stringify(validated),
        content_structured: validated,
        curriculum_week: context.seasonWeek,
      })
      .select()
      .single();

    return NextResponse.json({
      plan,
      star: validated,
      candidate: {
        player_id: candidate.player_id,
        player_name: candidate.player_name,
        score: candidate.score,
        obs_count: candidate.obs.length,
        positive_count: positiveObs.length,
      },
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Weekly star generation');
  }
}
