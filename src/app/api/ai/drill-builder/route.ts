import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { drillBuilderSchema, type DrillBuilderResult } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { requireAIAccess } from '@/lib/ai/guard';

export async function POST(request: Request) {
  const _guard = await requireAIAccess('plans');
  if ('response' in _guard) return _guard.response;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const body = await request.json();
  const { teamId, description, preferredCategory, preferredAgeGroup, preferredDuration } = body;

  if (!teamId || !description?.trim()) {
    return NextResponse.json({ error: 'teamId and description are required' }, { status: 400 });
  }

  try {
    const [context, coachResult] = await Promise.all([
      buildAIContext(teamId, admin),
      admin.from('coaches').select('org_id').eq('id', user.id).single(),
    ]);

    // Resolve sport_id for the team
    const { data: team } = await admin
      .from('teams')
      .select('sport_id')
      .eq('id', teamId)
      .single();

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const prompt = PROMPT_REGISTRY.drillBuilder({
      ...context,
      description: description.trim(),
      preferredCategory,
      preferredAgeGroup,
      preferredDuration,
    });

    const result = await callAIWithJSON<DrillBuilderResult>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coachResult.data?.org_id || '',
      },
      admin
    );

    let validated: DrillBuilderResult;
    try {
      validated = drillBuilderSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Drill builder Zod relaxed:', zodError);
      validated = result.parsed as DrillBuilderResult;
    }

    // Save the drill to the drills table
    const { data: drill, error: drillError } = await admin
      .from('drills')
      .insert({
        sport_id: team.sport_id,
        org_id: coachResult.data?.org_id || null,
        coach_id: user.id,
        name: validated.name,
        description: validated.description,
        category: validated.category,
        age_groups: validated.age_groups,
        duration_minutes: validated.duration_minutes,
        player_count_min: validated.player_count_min,
        player_count_max: validated.player_count_max ?? null,
        equipment: validated.equipment ?? [],
        setup_instructions: validated.setup_instructions,
        teaching_cues: validated.teaching_cues,
        source: 'ai',
      })
      .select()
      .single();

    if (drillError) {
      console.error('Drill insert error:', drillError);
      return NextResponse.json({ error: drillError.message }, { status: 500 });
    }

    return NextResponse.json({ drill, content: validated });
  } catch (error: unknown) {
    return handleAIError(error, 'Drill builder');
  }
}
