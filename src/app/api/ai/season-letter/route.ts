import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { seasonLetterSchema, type SeasonLetter } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  buildLetterPayload,
  hasEnoughDataForLetter,
  buildLetterSummaryLabel,
  type LetterObservation,
  type LetterAchievement,
} from '@/lib/season-letter-utils';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, playerId } = body;

  if (!teamId || !playerId) {
    return NextResponse.json({ error: 'teamId and playerId are required' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id, full_name')
      .eq('id', user.id)
      .single();

    // Fetch the player
    const { data: player, error: playerErr } = await admin
      .from('players')
      .select('id, name, jersey_number')
      .eq('id', playerId)
      .eq('team_id', teamId)
      .single();

    if (playerErr || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Fetch all observations for this player (last 365 days to capture a full season)
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const { data: obsData } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, created_at')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: true });
    const observations: LetterObservation[] = (obsData ?? []) as LetterObservation[];

    if (!hasEnoughDataForLetter(observations)) {
      return NextResponse.json(
        { error: 'Not enough positive observations for this player. Record at least 3 positive observations before generating a season letter.' },
        { status: 400 },
      );
    }

    // Fetch session count for the team (gives seasonal context)
    const { count: sessionCount } = await admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .gte('date', cutoff.toISOString().slice(0, 10));

    // Fetch player achievements
    const { data: achievementsData } = await admin
      .from('player_achievements')
      .select('badge_type, awarded_at, note')
      .eq('player_id', playerId)
      .order('awarded_at', { ascending: false });
    const achievements: LetterAchievement[] = (achievementsData ?? []) as LetterAchievement[];

    const context = await buildAIContext(teamId, admin);

    // Build season label from observation date range
    let seasonLabel = 'Spring Season';
    if (observations.length > 0) {
      const first = observations[0].created_at.slice(0, 10);
      const last = observations[observations.length - 1].created_at.slice(0, 10);
      const startMonth = new Date(first).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const endMonth = new Date(last).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      seasonLabel = startMonth === endMonth ? `${startMonth} Season` : `${startMonth} – ${endMonth} Season`;
    }

    const coachName = coach?.full_name || 'Coach';
    const payload = buildLetterPayload(
      player,
      observations,
      sessionCount ?? 0,
      achievements,
      coachName,
      context.teamName || 'the team',
      context.sportName || 'basketball',
      seasonLabel,
    );

    const prompt = PROMPT_REGISTRY.seasonLetter({
      ...context,
      orgId: coach?.org_id || '',
      ...payload,
    });

    const result = await callAIWithJSON<SeasonLetter>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 1200,
        temperature: 0.8,
      },
      admin,
    );

    let structured: SeasonLetter;
    try {
      structured = seasonLetterSchema.parse(result.parsed);
    } catch {
      structured = result.parsed as SeasonLetter;
    }

    // Ensure coach_name is populated
    if (!structured.coach_name) {
      structured = { ...structured, coach_name: coachName };
    }

    const title = `Season Letter — ${player.name}`;

    const { data: plan, error: planErr } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        ai_interaction_id: result.interactionId,
        title,
        content: JSON.stringify(structured),
        content_structured: structured as any,
        type: 'season_letter' as any,
      })
      .select('id, title')
      .single();

    if (planErr) {
      return NextResponse.json({ error: 'Failed to save plan' }, { status: 500 });
    }

    const stats = {
      playerName: player.name,
      totalObservations: observations.length,
      summaryLabel: buildLetterSummaryLabel(observations.length, sessionCount ?? 0),
    };

    return NextResponse.json({ plan, structured, stats });
  } catch (error: unknown) {
    return handleAIError(error, 'Season letter generation');
  }
}
