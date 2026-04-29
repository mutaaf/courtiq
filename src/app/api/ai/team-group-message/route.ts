import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { teamGroupMessageSchema, type TeamGroupMessage } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  buildSessionLabel,
  extractFocusAreas,
  getPositiveObsCount,
  getNeedsWorkObsCount,
  hasEnoughDataForGroupMessage,
} from '@/lib/team-group-message-utils';
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
      .select('org_id, name')
      .eq('id', user.id)
      .single();

    const { data: session } = await admin
      .from('sessions')
      .select('id, type, date, opponent')
      .eq('id', sessionId)
      .eq('team_id', teamId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data: obsRows } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text')
      .eq('session_id', sessionId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });

    const allObs = (obsRows || []) as { player_id: string; category: string; sentiment: string; text: string }[];

    if (!hasEnoughDataForGroupMessage(allObs.length)) {
      return NextResponse.json(
        { error: 'No observations recorded for this session yet' },
        { status: 400 }
      );
    }

    const context = await buildAIContext(teamId, admin);
    const sessionLabel = buildSessionLabel(session.type, session.date, session.opponent);

    const topCategories = extractFocusAreas(allObs);
    const positiveObs = allObs.filter((o) => o.sentiment === 'positive');
    const teamHighlightObs = positiveObs[0]?.text;

    const observationSummary = {
      totalObs: allObs.length,
      positiveCount: getPositiveObsCount(allObs),
      needsWorkCount: getNeedsWorkObsCount(allObs),
      topCategories,
      teamHighlightObs,
    };

    const prompt = PROMPT_REGISTRY.teamGroupMessage({
      ...context,
      sessionLabel,
      sessionType: session.type,
      observationSummary,
      coachName: coach?.name ?? undefined,
      teamName: context.teamName,
    });

    const result = await callAIWithJSON<TeamGroupMessage>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 600,
        temperature: 0.6,
      },
      admin
    );

    let validated: TeamGroupMessage;
    try {
      validated = teamGroupMessageSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Team group message Zod validation relaxed:', zodError);
      validated = result.parsed as TeamGroupMessage;
    }

    const sessionDateShort = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type: 'team_group_message',
      title: `Team Message — ${sessionLabel.split(' — ')[0]} · ${sessionDateShort}`,
      content: JSON.stringify(validated),
      content_structured: validated,
    }).select().single();

    return NextResponse.json({
      plan,
      groupMessage: validated,
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Team group message generation');
  }
}
