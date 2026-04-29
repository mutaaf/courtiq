import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { parentReportSchema, type ParentReport } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { requireAIAccess } from '@/lib/ai/guard';

export async function POST(request: Request) {
  const _guard = await requireAIAccess('parent_sharing');
  if ('response' in _guard) return _guard.response;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const body = await request.json();
  const { teamId, playerId } = body;

  if (!teamId || !playerId) {
    return NextResponse.json({ error: 'teamId and playerId required' }, { status: 400 });
  }

  try {
    // Get coach org_id for AI provider resolution
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const context = await buildAIContext(teamId, admin);

    // Get player info
    const { data: player } = await admin
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Get recent observations
    const { data: observations } = await admin
      .from('observations')
      .select('category, sentiment, text, skill_id, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(30);

    // Get proficiency data
    const { data: proficiency } = await admin
      .from('player_skill_proficiency')
      .select('skill_id, proficiency_level, success_rate, trend')
      .eq('player_id', playerId);

    const reportData = {
      observations: observations || [],
      proficiency: proficiency || [],
      seasonWeek: context.seasonWeek,
    };

    const prompt = PROMPT_REGISTRY.parentReport({
      ...context,
      playerName: player.name,
      reportData,
    });

    const result = await callAIWithJSON<ParentReport>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'generate_parent_report',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
      },
      admin
    );

    let validated;
    try {
      validated = parentReportSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Zod validation relaxed:', zodError);
      validated = result.parsed as ParentReport;
    }

    // Save as a plan
    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      player_id: playerId,
      ai_interaction_id: result.interactionId,
      type: 'parent_report',
      title: `Parent Report - ${player.name}`,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
    }).select().single();

    return NextResponse.json({ plan, content: validated, interactionId: result.interactionId });
  } catch (error: unknown) {
    return handleAIError(error, 'Parent report');
  }
}
