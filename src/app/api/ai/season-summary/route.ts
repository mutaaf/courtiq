import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { seasonSummarySchema, type SeasonSummary } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  getSeasonDateRange,
  countObsBySentiment,
  calculateSeasonHealthScore,
  groupByCategory,
  getTopCategories,
  countObservedPlayers,
  countWeeksOfData,
  countSessionsByType,
} from '@/lib/season-summary-utils';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, startDate, endDate } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // Fetch all sessions for the team (filtered by date range if provided)
    let sessionQuery = admin
      .from('sessions')
      .select('id, type, date')
      .eq('team_id', teamId)
      .order('date', { ascending: true });
    if (startDate) sessionQuery = sessionQuery.gte('date', startDate);
    if (endDate) sessionQuery = sessionQuery.lte('date', endDate);
    const { data: sessionsData } = await sessionQuery;
    const sessions = sessionsData || [];

    if (sessions.length < 3) {
      return NextResponse.json(
        { error: 'At least 3 sessions are required to generate a season summary.' },
        { status: 400 }
      );
    }

    // Fetch all observations in the date range
    let obsQuery = admin
      .from('observations')
      .select('player_id, category, sentiment, text, created_at, players:player_id(name)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });
    if (startDate) obsQuery = obsQuery.gte('created_at', startDate + 'T00:00:00');
    if (endDate) obsQuery = obsQuery.lte('created_at', endDate + 'T23:59:59');
    const { data: obsData } = await obsQuery;
    const allObs = obsData || [];

    if (allObs.length < 10) {
      return NextResponse.json(
        { error: 'At least 10 observations are required to generate a season summary.' },
        { status: 400 }
      );
    }

    const context = await buildAIContext(teamId, admin);

    // Build analytics inputs
    const dateRange = getSeasonDateRange(allObs as any);
    const { positive, needsWork } = countObsBySentiment(allObs as any);
    const healthScore = calculateSeasonHealthScore(allObs as any);
    const topCategories = getTopCategories(allObs as any, 6);
    const observedPlayers = countObservedPlayers(allObs as any);
    const weeksOfData = countWeeksOfData(allObs as any);
    const sessionBreakdown = countSessionsByType(sessions as any);

    // Category breakdown
    const catCounts = groupByCategory(allObs as any);
    const categoryBreakdown = Object.entries(catCounts)
      .map(([category, total]) => {
        const catObs = (allObs as any[]).filter((o: any) => o.category === category);
        const catPositive = catObs.filter((o: any) => o.sentiment === 'positive').length;
        const catNeedsWork = catObs.filter((o: any) => o.sentiment === 'needs-work').length;
        return { category, total, positive: catPositive, needsWork: catNeedsWork };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // Per-player observation counts
    const playerObsCounts: Record<string, { count: number; positive: number; name: string }> = {};
    for (const obs of allObs as any[]) {
      if (!obs.player_id) continue;
      const name = (obs.players as any)?.name || 'Unknown';
      if (!playerObsCounts[obs.player_id]) {
        playerObsCounts[obs.player_id] = { count: 0, positive: 0, name };
      }
      playerObsCounts[obs.player_id].count++;
      if (obs.sentiment === 'positive') playerObsCounts[obs.player_id].positive++;
    }
    const playerObservationCounts = Object.values(playerObsCounts)
      .map((p) => ({ name: p.name, count: p.count, positiveRatio: p.count > 0 ? p.positive / p.count : 0 }))
      .sort((a, b) => b.count - a.count);

    // Sample observations — pick diverse ones (mix of sentiments/categories)
    const positiveObs = (allObs as any[]).filter((o: any) => o.sentiment === 'positive' && o.player_id);
    const needsWorkObs = (allObs as any[]).filter((o: any) => o.sentiment === 'needs-work' && o.player_id);
    const sampleObs = [
      ...positiveObs.slice(0, 10),
      ...needsWorkObs.slice(0, 10),
    ].map((o: any) => ({
      playerName: (o.players as any)?.name || 'Team',
      category: o.category || 'General',
      sentiment: o.sentiment,
      text: o.text,
    }));

    // Build season period label
    const periodLabel = dateRange.label !== 'No data'
      ? dateRange.label
      : new Date().getFullYear().toString();

    const prompt = PROMPT_REGISTRY.seasonSummary({
      ...context,
      seasonPeriod: periodLabel,
      totalObservations: allObs.length,
      totalSessions: sessions.length,
      totalPlayers: observedPlayers,
      weeksOfData,
      healthScore,
      topCategories,
      sessionBreakdown,
      playerObservationCounts,
      categoryBreakdown,
      sampleObservations: sampleObs,
    });

    const result = await callAIWithJSON<SeasonSummary>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 1800,
        temperature: 0.65,
      },
      admin
    );

    let validated: SeasonSummary;
    try {
      validated = seasonSummarySchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Season summary Zod validation relaxed:', zodError);
      validated = result.parsed as SeasonSummary;
    }

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type: 'season_summary',
      title: `Season Summary — ${periodLabel}`,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
    }).select().single();

    return NextResponse.json({
      plan,
      summary: validated,
      interactionId: result.interactionId,
      stats: {
        observationsAnalyzed: allObs.length,
        sessionsIncluded: sessions.length,
        playersObserved: observedPlayers,
        weeksOfData,
        healthScore,
        positive,
        needsWork,
        dateRange: dateRange.label,
      },
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Season summary generation');
  }
}
