import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { practicePlanSchema, gamedaySheetSchema } from '@/lib/ai/schemas';

export interface ObservationInsights {
  totalObs: number;
  daysOfData: number;
  topNeedsWork: Array<{ category: string; count: number }>;
  topStrengths: Array<{ category: string; count: number }>;
}

type AdminClient = Awaited<ReturnType<typeof createServiceSupabase>>;

/** Fetch recent observations and compute team performance insights */
async function fetchObservationInsights(
  teamId: string,
  admin: AdminClient,
  daysOfData = 14
): Promise<ObservationInsights> {
  const cutoff = new Date(Date.now() - daysOfData * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentObs } = await admin
    .from('observations')
    .select('category, sentiment')
    .eq('team_id', teamId)
    .gte('created_at', cutoff)
    .limit(300);

  if (!recentObs || recentObs.length === 0) {
    return { totalObs: 0, daysOfData, topNeedsWork: [], topStrengths: [] };
  }

  const needsWorkCounts: Record<string, number> = {};
  const positiveCounts: Record<string, number> = {};

  for (const obs of recentObs) {
    if (obs.sentiment === 'needs-work' && obs.category) {
      needsWorkCounts[obs.category] = (needsWorkCounts[obs.category] ?? 0) + 1;
    } else if (obs.sentiment === 'positive' && obs.category) {
      positiveCounts[obs.category] = (positiveCounts[obs.category] ?? 0) + 1;
    }
  }

  return {
    totalObs: recentObs.length,
    daysOfData,
    topNeedsWork: Object.entries(needsWorkCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count })),
    topStrengths: Object.entries(positiveCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count })),
  };
}

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

    // Fetch AI context and observation insights in parallel
    const [context, observationInsights] = await Promise.all([
      buildAIContext(teamId, admin),
      type === 'practice'
        ? fetchObservationInsights(teamId, admin).catch((): ObservationInsights => ({
            totalObs: 0,
            daysOfData: 14,
            topNeedsWork: [],
            topStrengths: [],
          }))
        : Promise.resolve(null),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prompt: { system: string; user: string }, schema: any, interactionType: string;

    if (type === 'gameday') {
      prompt = PROMPT_REGISTRY.gamedaySheet({ ...context, opponent });
      schema = gamedaySheetSchema;
      interactionType = 'generate_gameday_sheet';
    } else {
      prompt = PROMPT_REGISTRY.practicePlan({
        ...context,
        focusSkills,
        observationInsights: observationInsights ?? undefined,
      });
      schema = practicePlanSchema;
      interactionType = 'generate_practice_plan';
    }

    const result = await callAIWithJSON(
      {
        coachId: user.id,
        teamId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interactionType: interactionType as any,
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
      },
      admin
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let validated: any;
    try {
      validated = schema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Zod validation relaxed:', zodError);
      validated = result.parsed;
    }

    // Derive skills_targeted: prefer explicit focusSkills, otherwise use top needs-work categories
    const skillsTargeted: string[] =
      Array.isArray(focusSkills) && focusSkills.length > 0
        ? focusSkills
        : observationInsights?.topNeedsWork.slice(0, 3).map((c) => c.category) ?? [];

    // Save the plan
    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type,
      title: validated.title,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
      skills_targeted: skillsTargeted,
    }).select().single();

    return NextResponse.json({ plan, content: validated, observationInsights });
  } catch (error: unknown) {
    console.error('Plan error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
