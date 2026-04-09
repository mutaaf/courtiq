import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { reportCardSchema, type ReportCard } from '@/lib/ai/schemas';

export async function POST(request: Request) {
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

    // Get proficiency data
    const { data: proficiency } = await admin
      .from('player_skill_proficiency')
      .select('skill_id, proficiency_level, success_rate, trend, reps_evaluated')
      .eq('player_id', playerId);

    // Get recent observations
    const { data: recentObservations } = await admin
      .from('observations')
      .select('category, sentiment, text, skill_id, result, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(40);

    const prompt = PROMPT_REGISTRY.reportCard({
      ...context,
      playerName: player.name,
      proficiency: proficiency || [],
      recentObservations: recentObservations || [],
    });

    const result = await callAIWithJSON<ReportCard>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'generate_report_card',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
      },
      admin
    );

    const validated = reportCardSchema.parse(result.parsed);

    // Save as a plan
    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      player_id: playerId,
      ai_interaction_id: result.interactionId,
      type: 'report_card',
      title: `Report Card - ${player.name}`,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
    }).select().single();

    return NextResponse.json({ plan, content: validated, interactionId: result.interactionId });
  } catch (error: any) {
    console.error('Report card error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
