import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { weeklyNewsletterSchema, type WeeklyNewsletter } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const context = await buildAIContext(teamId, admin);

    // Gather the last 7 days of data
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString().split('T')[0];

    const dateRangeLabel = `${sevenDaysAgo.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    // Fetch sessions from the last 7 days
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, date, type')
      .eq('team_id', teamId)
      .gte('date', sevenDaysAgoISO)
      .order('date', { ascending: true });

    const sessionIds = (sessions || []).map((s: any) => s.id);

    // Fetch all observations from those sessions (+ any recent direct observations)
    const { data: observations } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, session_id, created_at, players:player_id(name)')
      .eq('team_id', teamId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const allObs = observations || [];

    // Count observations per session
    const sessionObsCounts = new Map<string, number>();
    allObs.forEach((o: any) => {
      if (o.session_id) {
        sessionObsCounts.set(o.session_id, (sessionObsCounts.get(o.session_id) || 0) + 1);
      }
    });

    const sessionSummaries = (sessions || []).map((s: any) => ({
      date: new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      type: s.type.charAt(0).toUpperCase() + s.type.slice(1),
      observationCount: sessionObsCounts.get(s.id) || 0,
    }));

    // Group observations by player
    const playerObsMap = new Map<string, { name: string; positive: string[]; needsWork: string[]; neutral: string[] }>();
    allObs.forEach((o: any) => {
      if (!o.player_id) return;
      const name = (o.players as any)?.name || 'Unknown';
      if (!playerObsMap.has(o.player_id)) {
        playerObsMap.set(o.player_id, { name, positive: [], needsWork: [], neutral: [] });
      }
      const bucket = playerObsMap.get(o.player_id)!;
      if (o.sentiment === 'positive') bucket.positive.push(o.text);
      else if (o.sentiment === 'needs-work') bucket.needsWork.push(o.text);
      else bucket.neutral.push(o.text);
    });

    // Build player spotlights — include players who had any observations
    const playerSpotlights = Array.from(playerObsMap.values())
      .filter((p) => p.positive.length > 0 || p.needsWork.length > 0)
      .sort((a, b) => (b.positive.length + b.needsWork.length) - (a.positive.length + a.needsWork.length))
      .slice(0, 8)
      .map((p) => ({
        name: p.name,
        positiveHighlights: p.positive,
        needsWorkAreas: p.needsWork,
      }));

    // Category breakdown
    const categoryCounts = new Map<string, { positive: number; needsWork: number }>();
    allObs.forEach((o: any) => {
      if (!o.category) return;
      if (!categoryCounts.has(o.category)) categoryCounts.set(o.category, { positive: 0, needsWork: 0 });
      const c = categoryCounts.get(o.category)!;
      if (o.sentiment === 'positive') c.positive++;
      else if (o.sentiment === 'needs-work') c.needsWork++;
    });

    const topStrengthCategories = [...categoryCounts.entries()]
      .filter(([, c]) => c.positive > 0)
      .sort(([, a], [, b]) => b.positive - a.positive)
      .slice(0, 3)
      .map(([name]) => name);

    const topFocusCategories = [...categoryCounts.entries()]
      .filter(([, c]) => c.needsWork > 0)
      .sort(([, a], [, b]) => b.needsWork - a.needsWork)
      .slice(0, 3)
      .map(([name]) => name);

    const teamPositiveCount = allObs.filter((o: any) => o.sentiment === 'positive').length;
    const teamNeedsWorkCount = allObs.filter((o: any) => o.sentiment === 'needs-work').length;

    // Build prompt
    const prompt = PROMPT_REGISTRY.weeklyNewsletter({
      ...context,
      dateRange: dateRangeLabel,
      sessionSummaries,
      playerSpotlights,
      teamPositiveCount,
      teamNeedsWorkCount,
      topStrengthCategories,
      topFocusCategories,
    });

    const result = await callAIWithJSON<WeeklyNewsletter>(
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

    let validated: WeeklyNewsletter;
    try {
      validated = weeklyNewsletterSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Newsletter Zod validation relaxed:', zodError);
      validated = result.parsed as WeeklyNewsletter;
    }

    // Save as a plan of type 'newsletter'
    const weekLabel = `Week ${context.seasonWeek}`;
    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type: 'newsletter',
      title: `Parent Newsletter — ${weekLabel} (${dateRangeLabel})`,
      content: JSON.stringify(validated),
      content_structured: validated,
      curriculum_week: context.seasonWeek,
    }).select().single();

    return NextResponse.json({
      plan,
      content: validated,
      interactionId: result.interactionId,
      stats: {
        sessionsIncluded: (sessions || []).length,
        observationsIncluded: allObs.length,
        playerSpotlightsCount: playerSpotlights.length,
        dateRange: dateRangeLabel,
      },
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Newsletter generation');
  }
}
