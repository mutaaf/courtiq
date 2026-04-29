import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { seasonStorylineSchema, type SeasonStoryline } from '@/lib/ai/schemas';
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
        .select('category, sentiment, text, created_at, session_id')
        .eq('player_id', playerId)
        .order('created_at', { ascending: true }),
    ]);

    const player = playerResult.data;
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const allObs = observationsResult.data || [];

    if (allObs.length === 0) {
      return NextResponse.json(
        { error: 'No observations found for this player. Start capturing observations to generate a season storyline.' },
        { status: 400 }
      );
    }

    // Build week-by-week breakdown
    // Group observations by curriculum week (approximate from created_at vs season start)
    // Use weeks relative to first observation
    const firstObsDate = new Date(allObs[0].created_at);
    const latestObsDate = new Date(allObs[allObs.length - 1].created_at);

    const weekMap = new Map<number, {
      positiveCount: number;
      needsWorkCount: number;
      categories: Set<string>;
      highlights: string[];
    }>();

    for (const obs of allObs) {
      const obsDate = new Date(obs.created_at);
      const msSinceFirst = obsDate.getTime() - firstObsDate.getTime();
      const week = Math.floor(msSinceFirst / (7 * 24 * 60 * 60 * 1000)) + 1;

      if (!weekMap.has(week)) {
        weekMap.set(week, { positiveCount: 0, needsWorkCount: 0, categories: new Set(), highlights: [] });
      }
      const entry = weekMap.get(week)!;

      if (obs.sentiment === 'positive') {
        entry.positiveCount++;
        if (obs.text && entry.highlights.length < 3) entry.highlights.push(obs.text);
      } else if (obs.sentiment === 'needs-work') {
        entry.needsWorkCount++;
      }
      if (obs.category) entry.categories.add(obs.category);
    }

    const weeklyBreakdown = Array.from(weekMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([week, data]) => ({
        week,
        positiveCount: data.positiveCount,
        needsWorkCount: data.needsWorkCount,
        categories: Array.from(data.categories),
        highlights: data.highlights,
      }));

    // Compute overall strengths and growth areas from category counts
    const strengthCounts: Record<string, number> = {};
    const growthCounts: Record<string, number> = {};
    for (const obs of allObs) {
      if (!obs.category) continue;
      if (obs.sentiment === 'positive') {
        strengthCounts[obs.category] = (strengthCounts[obs.category] ?? 0) + 1;
      } else if (obs.sentiment === 'needs-work') {
        growthCounts[obs.category] = (growthCounts[obs.category] ?? 0) + 1;
      }
    }
    const overallStrengths = Object.entries(strengthCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat]) => cat);
    const overallGrowthAreas = Object.entries(growthCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat]) => cat);

    const seasonLabel = context.seasonWeek
      ? `Season Week ${context.seasonWeek}`
      : new Date().getFullYear().toString();

    const prompt = PROMPT_REGISTRY.seasonStoryline({
      ...context,
      playerName: player.name,
      seasonLabel,
      totalObservations: allObs.length,
      weeklyBreakdown,
      overallStrengths,
      overallGrowthAreas,
      firstObservationDate: firstObsDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      latestObservationDate: latestObsDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    });

    const result = await callAIWithJSON<SeasonStoryline>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'generate_season_storyline',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
      },
      admin
    );

    let validated: SeasonStoryline;
    try {
      validated = seasonStorylineSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Season storyline Zod relaxed:', zodError);
      validated = result.parsed as SeasonStoryline;
    }

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      player_id: playerId,
      ai_interaction_id: result.interactionId,
      type: 'season_storyline',
      title: `Season Storyline — ${player.name} (${seasonLabel})`,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
      skills_targeted: [...overallStrengths, ...overallGrowthAreas].slice(0, 6),
    }).select().single();

    return NextResponse.json({
      plan,
      content: validated,
      stats: {
        totalObservations: allObs.length,
        weeksOfData: weeklyBreakdown.length,
        firstObservationDate: firstObsDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        latestObservationDate: latestObsDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      },
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Season storyline');
  }
}
