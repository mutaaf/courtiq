import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { playerSessionMessagesSchema, type PlayerSessionMessages } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { buildSessionLabel, buildPlayerObsPayload, hasEnoughDataForMessages } from '@/lib/player-session-messages-utils';
import { requireAIAccess } from '@/lib/ai/guard';

export async function POST(request: Request) {
  const _guard = await requireAIAccess('parent_sharing');
  if ('response' in _guard) return _guard.response;
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
      .select('id, type, date, opponent')
      .eq('id', sessionId)
      .eq('team_id', teamId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch all observations for this session with player names
    const { data: obsRows } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, players:player_id(name)')
      .eq('session_id', sessionId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });

    const allObs = (obsRows || []) as any[];

    if (!hasEnoughDataForMessages(allObs)) {
      return NextResponse.json(
        { error: 'No player observations recorded for this session yet' },
        { status: 400 }
      );
    }

    const context = await buildAIContext(teamId, admin);
    const sessionLabel = buildSessionLabel(session.type, session.date, session.opponent);
    const playerObservations = buildPlayerObsPayload(allObs);

    const prompt = PROMPT_REGISTRY.playerSessionMessages({
      ...context,
      sessionLabel,
      sessionType: session.type,
      playerObservations,
    });

    const result = await callAIWithJSON<PlayerSessionMessages>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 1200,
        temperature: 0.6,
      },
      admin
    );

    let validated: PlayerSessionMessages;
    try {
      validated = playerSessionMessagesSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Player session messages Zod validation relaxed:', zodError);
      validated = result.parsed as PlayerSessionMessages;
    }

    // Save as a plan so it appears in the Plans page history
    const sessionDateShort = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type: 'player_messages',
      title: `Player Messages — ${sessionLabel.split(' — ')[0]} · ${sessionDateShort}`,
      content: JSON.stringify(validated),
      content_structured: validated,
    }).select().single();

    return NextResponse.json({
      plan,
      messages: validated,
      interactionId: result.interactionId,
      stats: {
        playersMessaged: validated.messages.length,
        observationsUsed: allObs.filter((o: any) => o.player_id).length,
      },
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Player session messages generation');
  }
}
