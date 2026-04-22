import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { seasonAwardsSchema, type SeasonAwards } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  getPlayerObsMap,
  buildAwardsPayload,
  hasEnoughDataForAwards,
  countPlayersWithObs,
  buildAwardsSummaryLabel,
  type AwardObservation,
  type AwardPlayer,
} from '@/lib/season-awards-utils';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, startDate, endDate } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // Fetch active players for the team
    const { data: playersData } = await admin
      .from('players')
      .select('id, name')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('name');
    const players: AwardPlayer[] = playersData ?? [];

    if (players.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 players are required to generate season awards.' },
        { status: 400 },
      );
    }

    // Fetch all observations in the date range
    let obsQuery = admin
      .from('observations')
      .select('player_id, category, sentiment, text, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });
    if (startDate) obsQuery = obsQuery.gte('created_at', `${startDate}T00:00:00`);
    if (endDate)   obsQuery = obsQuery.lte('created_at', `${endDate}T23:59:59`);
    const { data: obsData } = await obsQuery;
    const allObs: AwardObservation[] = (obsData ?? []) as AwardObservation[];

    const obsMap = getPlayerObsMap(allObs);

    if (!hasEnoughDataForAwards(players, obsMap)) {
      return NextResponse.json(
        { error: 'Not enough observation data. Record observations for at least 2 players before generating awards.' },
        { status: 400 },
      );
    }

    const context = await buildAIContext(teamId, admin);
    const awardsPayload = buildAwardsPayload(players, obsMap);

    // Build a season label from date range or observation dates
    let seasonLabel = 'Season Awards';
    if (startDate && endDate) {
      const start = new Date(startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const end   = new Date(endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      seasonLabel = `${start} – ${end} Season Awards`;
    } else if (allObs.length > 0) {
      const firstObs = allObs[0].created_at.slice(0, 10);
      const lastObs  = allObs[allObs.length - 1].created_at.slice(0, 10);
      const start = new Date(firstObs).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const end   = new Date(lastObs).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      seasonLabel = start === end ? `${start} Season Awards` : `${start} – ${end} Season Awards`;
    }

    const prompt = PROMPT_REGISTRY.seasonAwards({
      ...context,
      orgId: coach?.org_id || '',
      seasonLabel,
      totalPlayers: awardsPayload.length,
      totalObservations: allObs.length,
      players: awardsPayload,
    });

    const result = await callAIWithJSON<SeasonAwards>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 2400,
        temperature: 0.7,
      },
      admin,
    );

    let structured: SeasonAwards;
    try {
      structured = seasonAwardsSchema.parse(result.parsed);
    } catch {
      structured = result.parsed as SeasonAwards;
    }

    // Save as plan
    const title = structured.season_label || seasonLabel;
    const { data: plan, error: planErr } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        ai_interaction_id: result.interactionId,
        title,
        content: JSON.stringify(structured),
        content_structured: structured as any,
        type: 'season_awards' as any,
      })
      .select('id, title')
      .single();

    if (planErr) {
      return NextResponse.json({ error: 'Failed to save plan' }, { status: 500 });
    }

    const stats = {
      playersAwarded: countPlayersWithObs(players, obsMap),
      totalObservations: allObs.length,
      summaryLabel: buildAwardsSummaryLabel(structured),
    };

    return NextResponse.json({ plan, structured, stats });
  } catch (error: unknown) {
    return handleAIError(error, 'Season awards generation');
  }
}
