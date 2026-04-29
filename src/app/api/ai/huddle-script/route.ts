import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { huddleScriptSchema, type HuddleScript } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  hasEnoughDataForHuddle,
  buildObsSummary,
  buildPlayerSpotlightPayload,
  buildHuddleSessionLabel,
} from '@/lib/huddle-script-utils';
import { requireAIAccess } from '@/lib/ai/guard';

export async function POST(request: Request) {
  const _guard = await requireAIAccess('sessions');
  if ('response' in _guard) return _guard.response;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, sessionId, nextSessionHint } = body;

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

    if (!hasEnoughDataForHuddle(allObs.length)) {
      return NextResponse.json(
        { error: 'No observations recorded for this session yet' },
        { status: 400 },
      );
    }

    // Fetch player names for spotlight selection
    const { data: rosterRows } = await admin
      .from('players')
      .select('id, name')
      .eq('team_id', teamId);

    const playerIdToName: Record<string, string> = {};
    for (const p of rosterRows || []) {
      playerIdToName[p.id] = p.name.split(' ')[0]; // first name only
    }

    const context = await buildAIContext(teamId, admin);
    const sessionLabel = buildHuddleSessionLabel(session.type, session.date);
    const obsSummary = buildObsSummary(allObs);
    const playerSpotlight = buildPlayerSpotlightPayload(allObs, playerIdToName);

    const prompt = PROMPT_REGISTRY.huddleScript({
      ...context,
      sessionLabel,
      sessionType: session.type,
      observationSummary: {
        totalObs: obsSummary.total,
        positive: obsSummary.positive,
        needsWork: obsSummary.needsWork,
        topStrengths: obsSummary.topStrengths,
        topChallenges: obsSummary.topChallenges,
      },
      playerSpotlight,
      coachName: coach?.name ?? undefined,
      teamName: context.teamName,
      nextSessionHint: nextSessionHint ?? undefined,
    });

    const result = await callAIWithJSON<HuddleScript>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 400,
        temperature: 0.65,
      },
      admin,
    );

    let validated: HuddleScript;
    try {
      validated = huddleScriptSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Huddle script Zod validation relaxed:', zodError);
      validated = result.parsed as HuddleScript;
    }

    const sessionDateShort = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type: 'huddle_script',
      title: `Huddle Script — ${sessionLabel.split(' — ')[0]} · ${sessionDateShort}`,
      content: JSON.stringify(validated),
      content_structured: validated,
    }).select().single();

    return NextResponse.json({
      plan,
      huddleScript: validated,
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Huddle script generation');
  }
}
