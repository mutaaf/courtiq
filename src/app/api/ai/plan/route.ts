import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { practicePlanSchema, gamedaySheetSchema } from '@/lib/ai/schemas';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const body = await request.json();
  const { teamId, type = 'practice', opponent, focusSkills } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    // Get coach org_id for AI provider resolution
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const context = await buildAIContext(teamId, admin);
    let prompt, schema, interactionType: any;

    if (type === 'gameday') {
      prompt = PROMPT_REGISTRY.gamedaySheet({ ...context, opponent });
      schema = gamedaySheetSchema;
      interactionType = 'generate_gameday_sheet';
    } else {
      prompt = PROMPT_REGISTRY.practicePlan({ ...context, focusSkills });
      schema = practicePlanSchema;
      interactionType = 'generate_practice_plan';
    }

    const result = await callAIWithJSON(
      {
        coachId: user.id,
        teamId,
        interactionType,
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
      },
      admin
    );

    let validated;
    try {
      validated = schema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Zod validation relaxed:', zodError);
      validated = result.parsed;
    }

    // Save the plan
    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type,
      title: (validated as any).title,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
      skills_targeted: focusSkills || [],
    }).select().single();

    return NextResponse.json({ plan, content: validated });
  } catch (error: any) {
    console.error('Plan error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
