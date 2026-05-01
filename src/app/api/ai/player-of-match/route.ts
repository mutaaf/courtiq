import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { playerOfMatchSchema, type PlayerOfMatch } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { requireAIAccess } from '@/lib/ai/guard';
import {
  groupMatchObsByPlayer,
  selectMatchCandidate,
  hasEnoughDataForMatchMVP,
  buildMatchSessionLabel,
  isMatchSessionType,
  type MatchObs,
} from '@/lib/player-of-match-utils';

// ─── POST /api/ai/player-of-match ─────────────────────────────────────────────
// Analyses session observations, picks the standout player, and writes a
// short celebratory "Player of the Match" card to share with parents.
// Only available for game / scrimmage / tournament session types.
// Saves the result as plan type `player_of_match`.

export async function POST(request: Request) {
  const _guard = await requireAIAccess('sessions');
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

    // Verify session belongs to this team and is a game-type session
    const { data: session } = await admin
      .from('sessions')
      .select('id, type, date, opponent')
      .eq('id', sessionId)
      .eq('team_id', teamId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!isMatchSessionType(session.type)) {
      return NextResponse.json(
        { error: 'Player of the Match is only available for game, scrimmage, and tournament sessions.' },
        { status: 422 }
      );
    }

    // Fetch all observations for this session
    const { data: obsRows } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, players:player_id(name)')
      .eq('session_id', sessionId)
      .eq('team_id', teamId)
      .not('player_id', 'is', null)
      .order('created_at', { ascending: true });

    const allObs: MatchObs[] = (obsRows ?? []).map((o: any) => ({
      player_id: o.player_id as string,
      player_name: (o.players as any)?.name ?? 'Unknown',
      sentiment: o.sentiment as 'positive' | 'needs-work' | 'neutral',
      category: (o.category ?? 'general') as string,
      text: (o.text ?? '') as string,
    }));

    if (!hasEnoughDataForMatchMVP(allObs)) {
      return NextResponse.json(
        {
          error:
            'Not enough observations to pick a Player of the Match. Capture observations for at least 2 players during the game and try again!',
        },
        { status: 422 }
      );
    }

    const grouped = groupMatchObsByPlayer(allObs);
    const candidate = selectMatchCandidate(grouped);

    if (!candidate || candidate.positive_count === 0) {
      return NextResponse.json(
        {
          error:
            'The standout player has no positive observations this game. Add some encouraging notes first!',
        },
        { status: 422 }
      );
    }

    const sessionLabel = buildMatchSessionLabel(session.type, session.opponent, session.date);
    const context = await buildAIContext(teamId, admin);

    const prompt = PROMPT_REGISTRY.playerOfMatch({
      ...context,
      playerName: candidate.player_name,
      sessionLabel,
      positiveObservations: candidate.highlight_obs.map((o) => ({
        category: o.category,
        text: o.text,
      })),
      allObsCount: candidate.total_count,
      positiveCount: candidate.positive_count,
      topCategories: candidate.top_categories,
    });

    const result = await callAIWithJSON<PlayerOfMatch>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 500,
        temperature: 0.7,
      },
      admin
    );

    let validated: PlayerOfMatch;
    try {
      validated = playerOfMatchSchema.parse(result.parsed);
    } catch {
      validated = result.parsed as PlayerOfMatch;
    }

    // Ensure session label is consistent
    validated.session_label = sessionLabel;
    validated.player_name = candidate.player_name;

    const { data: plan } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        ai_interaction_id: result.interactionId,
        type: 'player_of_match',
        title: `Player of the Match — ${candidate.player_name} (${sessionLabel})`,
        content: JSON.stringify(validated),
        content_structured: validated,
      })
      .select()
      .single();

    return NextResponse.json({
      plan,
      result: validated,
      candidate: {
        player_id: candidate.player_id,
        player_name: candidate.player_name,
        score: candidate.score,
        obs_count: candidate.total_count,
        positive_count: candidate.positive_count,
      },
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Player of the Match generation');
  }
}
