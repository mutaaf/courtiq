import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { gameRecapSchema, type GameRecap } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';

export interface GameRecapResult extends GameRecap {
  sessionId: string;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, sessionId } = body;

  if (!teamId || !sessionId) {
    return NextResponse.json({ error: 'teamId and sessionId required' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // Fetch session details
    const { data: session } = await admin
      .from('sessions')
      .select('id, type, date, opponent, result')
      .eq('id', sessionId)
      .eq('team_id', teamId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const gameTypes = ['game', 'scrimmage', 'tournament'];
    if (!gameTypes.includes(session.type)) {
      return NextResponse.json(
        { error: 'Game recaps are only available for game, scrimmage, or tournament sessions' },
        { status: 400 }
      );
    }

    // Fetch all observations for this session
    const { data: obsRows } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, players:player_id(name)')
      .eq('session_id', sessionId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });

    const allObs = obsRows || [];

    // Separate player vs team observations
    const playerObs = allObs
      .filter((o: any) => o.player_id)
      .map((o: any) => ({
        playerName: (o.players as any)?.name || 'Unknown',
        text: o.text,
        sentiment: o.sentiment,
        category: o.category,
      }));

    const teamObs = allObs
      .filter((o: any) => !o.player_id)
      .map((o: any) => o.text);

    const context = await buildAIContext(teamId, admin);

    const sessionDate = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const sessionTypeLabel: Record<string, string> = {
      game: 'Game',
      scrimmage: 'Scrimmage',
      tournament: 'Tournament game',
    };

    const prompt = PROMPT_REGISTRY.gameRecap({
      ...context,
      sessionDate,
      sessionType: sessionTypeLabel[session.type] || session.type,
      opponent: session.opponent,
      result: session.result,
      observations: playerObs,
      teamObservations: teamObs,
    });

    const result = await callAIWithJSON<GameRecap>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 1400,
        temperature: 0.65,
      },
      admin
    );

    let validated: GameRecap;
    try {
      validated = gameRecapSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Game recap Zod validation relaxed:', zodError);
      validated = result.parsed as GameRecap;
    }

    // Build plan title from session info
    const opponentPart = session.opponent ? ` vs ${session.opponent}` : '';
    const datePart = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const typeLabel = sessionTypeLabel[session.type] || 'Game';

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type: 'game_recap',
      title: `${typeLabel} Recap${opponentPart} — ${datePart}`,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
    }).select().single();

    return NextResponse.json({
      plan,
      recap: validated,
      interactionId: result.interactionId,
      stats: {
        observationsUsed: allObs.length,
        playerHighlights: validated.player_highlights.length,
        keyMoments: validated.key_moments.length,
      },
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Game recap generation');
  }
}
