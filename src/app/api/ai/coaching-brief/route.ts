import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { coachingBriefSchema, type CoachingBrief } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { requireAIAccess } from '@/lib/ai/guard';

// ─── POST /api/ai/coaching-brief ──────────────────────────────────────────────
// Analyses a player's recent observations and generates a 60-second coaching
// brief — status, acknowledge, focus, and a verbatim script — to help volunteer
// coaches know exactly what to say to a player before or during practice.
// Does NOT save to plans; result is ephemeral and displayed inline.

export async function POST(request: Request) {
  const _guard = await requireAIAccess('plans');
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
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // Verify player belongs to this team
    const { data: player } = await admin
      .from('players')
      .select('id, name')
      .eq('id', playerId)
      .eq('team_id', teamId)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Fetch last 20 observations for this player (30-day window)
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: obsRows } = await admin
      .from('observations')
      .select('category, sentiment, text, created_at')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .neq('sentiment', 'neutral')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    const obs = obsRows ?? [];

    // Fetch active goals for context
    const { data: goalsRows } = await admin
      .from('player_goals')
      .select('goal_text, skill_category')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .limit(3);

    const activeGoals = (goalsRows ?? []).map((g: any) => ({
      text: g.goal_text as string,
      skill: (g.skill_category ?? 'general') as string,
    }));

    // Build observation summaries
    const positiveObs = obs
      .filter((o: any) => o.sentiment === 'positive')
      .map((o: any) => ({ category: (o.category ?? 'general') as string, text: o.text as string }));

    const needsWorkObs = obs
      .filter((o: any) => o.sentiment === 'needs-work')
      .map((o: any) => ({ category: (o.category ?? 'general') as string, text: o.text as string }));

    // Compute top skills by frequency
    function topSkill(items: Array<{ category: string }>): string {
      const counts: Record<string, number> = {};
      for (const { category } of items) counts[category] = (counts[category] ?? 0) + 1;
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    }

    const topStrengthSkill = topSkill(positiveObs);
    const topNeedsWorkSkill = topSkill(needsWorkObs);
    const recentPositiveRatio = obs.length > 0 ? positiveObs.length / obs.length : 0.5;

    const context = await buildAIContext(teamId, admin);
    const firstName = player.name.split(' ')[0];

    const prompt = PROMPT_REGISTRY.playerCoachingBrief({
      ...context,
      playerName: player.name,
      firstName,
      positiveObservations: positiveObs,
      needsWorkObservations: needsWorkObs,
      topStrengthSkill,
      topNeedsWorkSkill,
      totalObs: obs.length,
      recentPositiveRatio,
      activeGoals,
    });

    const result = await callAIWithJSON<CoachingBrief>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 350,
        temperature: 0.6,
      },
      admin
    );

    let validated: CoachingBrief;
    try {
      validated = coachingBriefSchema.parse(result.parsed);
    } catch {
      validated = result.parsed as CoachingBrief;
    }

    return NextResponse.json({ brief: validated });
  } catch (error: unknown) {
    return handleAIError(error, 'Coaching brief generation');
  }
}
