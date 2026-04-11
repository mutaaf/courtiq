import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { skillChallengeSchema, type SkillChallenge } from '@/lib/ai/schemas';

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
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const [context, playerResult, observationsResult] = await Promise.all([
      buildAIContext(teamId, admin),
      admin.from('players').select('*').eq('id', playerId).single(),
      admin
        .from('observations')
        .select('category, sentiment, text, created_at')
        .eq('player_id', playerId)
        .eq('sentiment', 'needs-work')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const player = playerResult.data;
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const needsWorkObs = observationsResult.data || [];

    // Compute growth areas from needs-work category counts
    const categoryCounts: Record<string, number> = {};
    for (const obs of needsWorkObs) {
      if (obs.category) categoryCounts[obs.category] = (categoryCounts[obs.category] ?? 0) + 1;
    }
    const growthAreas = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([cat]) => cat);

    const recentNeedsWorkObs = needsWorkObs
      .slice(0, 10)
      .map((o) => o.text)
      .filter(Boolean) as string[];

    // Week label: e.g. "Week of Apr 7, 2026"
    const weekLabel = `Week of ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const prompt = PROMPT_REGISTRY.skillChallenge({
      ...context,
      playerName: player.name,
      ageGroup: context.ageGroup,
      growthAreas,
      recentNeedsWorkObs,
      weekLabel,
    });

    const result = await callAIWithJSON<SkillChallenge>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'generate_development_card',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
      },
      admin
    );

    let validated: SkillChallenge;
    try {
      validated = skillChallengeSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Skill challenge Zod relaxed:', zodError);
      validated = result.parsed as SkillChallenge;
    }

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      player_id: playerId,
      ai_interaction_id: result.interactionId,
      type: 'skill_challenge',
      title: `Skill Challenges — ${player.name} (${weekLabel})`,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
      skills_targeted: growthAreas,
    }).select().single();

    return NextResponse.json({ plan, content: validated });
  } catch (error: unknown) {
    console.error('Skill challenge error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
