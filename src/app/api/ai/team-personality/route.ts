import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { teamPersonalitySchema, type TeamPersonality } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  buildCategoryBreakdown,
  getTopStrengths,
  getTopChallenges,
  calculateHealthScore,
  calculateEffortRatio,
  calculateTeamworkRatio,
  calculateSessionQualityAvg,
  hasEnoughDataForPersonality,
  formatCoachingPatternLabel,
  selectSampleObservations,
} from '@/lib/team-personality-utils';

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

    // Fetch all sessions for the team
    const { data: sessionsData } = await admin
      .from('sessions')
      .select('id, type, date, quality_rating')
      .eq('team_id', teamId)
      .order('date', { ascending: false });
    const sessions = sessionsData || [];

    // Fetch all observations
    const { data: obsData } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, created_at, players:player_id(name)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(500);
    const allObs = obsData || [];

    if (!hasEnoughDataForPersonality(allObs as any, sessions as any)) {
      return NextResponse.json(
        { error: 'At least 5 sessions and 20 observations are needed to generate a team personality profile.' },
        { status: 400 }
      );
    }

    const context = await buildAIContext(teamId, admin);

    const breakdown = buildCategoryBreakdown(allObs as any);
    const topStrengths = getTopStrengths(breakdown);
    const topChallenges = getTopChallenges(breakdown);
    const healthScore = calculateHealthScore(allObs as any);
    const effortRatio = calculateEffortRatio(allObs as any);
    const teamworkRatio = calculateTeamworkRatio(allObs as any);
    const sessionQualityAvg = calculateSessionQualityAvg(sessions as any);

    const coachingPatternLabel = formatCoachingPatternLabel(
      breakdown.length,
      breakdown[0]?.category || 'general'
    );

    // Build sample observations with player names
    const obsWithNames = (allObs as any[]).map((o: any) => ({
      ...o,
      playerName: (o.players as any)?.name || 'Player',
    }));
    const sampleObservations = selectSampleObservations(obsWithNames);

    // Count unique observed players
    const uniquePlayers = new Set((allObs as any[]).map((o: any) => o.player_id).filter(Boolean)).size;

    const prompt = PROMPT_REGISTRY.teamPersonality({
      ...context,
      totalObservations: allObs.length,
      totalSessions: sessions.length,
      totalPlayers: uniquePlayers,
      healthScore,
      categoryBreakdown: breakdown.slice(0, 8),
      topStrengths,
      topChallenges,
      sessionQualityAvg,
      effortObsRatio: effortRatio,
      teamworkObsRatio: teamworkRatio,
      coachingPatternLabel,
      sampleObservations,
    });

    const result = await callAIWithJSON<TeamPersonality>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 1000,
        temperature: 0.7,
      },
      admin
    );

    let validated: TeamPersonality;
    try {
      validated = teamPersonalitySchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Team personality Zod validation relaxed:', zodError);
      validated = result.parsed as TeamPersonality;
    }

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type: 'team_personality',
      title: `${validated.type_emoji} ${validated.team_type}`,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
    }).select().single();

    return NextResponse.json({
      plan,
      personality: validated,
      interactionId: result.interactionId,
      stats: {
        observationsAnalyzed: allObs.length,
        sessionsIncluded: sessions.length,
        playersObserved: uniquePlayers,
        healthScore,
      },
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Team personality generation');
  }
}
