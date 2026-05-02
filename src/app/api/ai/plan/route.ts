import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { practicePlanSchema, gamedaySheetSchema } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { requireAIAccess } from '@/lib/ai/guard';

export interface TrendEntry {
  category: string;
  recentCount: number;
  priorCount: number;
}

export interface TrendData {
  /** Skills with more needs-work observations recently than prior — highest priority */
  declining: TrendEntry[];
  /** Skills with fewer needs-work observations recently than prior — reinforce */
  improving: TrendEntry[];
  /** Skills consistently high in needs-work across both windows */
  persistent: string[];
  totalRecentObs: number;
  totalPriorObs: number;
}

export interface ObservationInsights {
  totalObs: number;
  daysOfData: number;
  topNeedsWork: Array<{ category: string; count: number }>;
  topStrengths: Array<{ category: string; count: number }>;
  /** Trend analysis comparing last 7 days vs prior 7 days */
  trendData?: TrendData;
}

type AdminClient = Awaited<ReturnType<typeof createServiceSupabase>>;

/** Fetch recent observations and compute team performance insights with trend analysis */
async function fetchObservationInsights(
  teamId: string,
  admin: AdminClient
): Promise<ObservationInsights> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  // Fetch last 14 days; split into two 7-day windows for trend comparison
  const priorCutoff = new Date(now - 14 * day).toISOString();
  const recentCutoff = new Date(now - 7 * day).toISOString();

  const { data: allObs } = await admin
    .from('observations')
    .select('category, sentiment, created_at')
    .eq('team_id', teamId)
    .gte('created_at', priorCutoff)
    .limit(500);

  if (!allObs || allObs.length === 0) {
    return { totalObs: 0, daysOfData: 14, topNeedsWork: [], topStrengths: [] };
  }

  const recentObs = allObs.filter((o) => o.created_at >= recentCutoff);
  const priorObs = allObs.filter((o) => o.created_at < recentCutoff);

  // Tally needs-work and positive counts per window
  const recentNeedsWork: Record<string, number> = {};
  const priorNeedsWork: Record<string, number> = {};
  const positiveCounts: Record<string, number> = {};

  for (const obs of recentObs) {
    if (obs.sentiment === 'needs-work' && obs.category) {
      recentNeedsWork[obs.category] = (recentNeedsWork[obs.category] ?? 0) + 1;
    } else if (obs.sentiment === 'positive' && obs.category) {
      positiveCounts[obs.category] = (positiveCounts[obs.category] ?? 0) + 1;
    }
  }
  for (const obs of priorObs) {
    if (obs.sentiment === 'needs-work' && obs.category) {
      priorNeedsWork[obs.category] = (priorNeedsWork[obs.category] ?? 0) + 1;
    }
  }

  // Combine for overall topNeedsWork ranking
  const totalNeedsWork: Record<string, number> = {};
  for (const [cat, n] of Object.entries(recentNeedsWork)) {
    totalNeedsWork[cat] = (totalNeedsWork[cat] ?? 0) + n;
  }
  for (const [cat, n] of Object.entries(priorNeedsWork)) {
    totalNeedsWork[cat] = (totalNeedsWork[cat] ?? 0) + n;
  }

  // Classify each category's trend direction
  const allCategories = new Set([
    ...Object.keys(recentNeedsWork),
    ...Object.keys(priorNeedsWork),
  ]);

  const declining: TrendEntry[] = [];
  const improving: TrendEntry[] = [];
  const persistent: string[] = [];

  for (const category of allCategories) {
    const recent = recentNeedsWork[category] ?? 0;
    const prior = priorNeedsWork[category] ?? 0;

    if (recent > 0 && prior > 0) {
      if (recent > prior * 1.25) {
        // 25%+ increase = declining
        declining.push({ category, recentCount: recent, priorCount: prior });
      } else if (prior > recent * 1.25) {
        // 25%+ decrease = improving
        improving.push({ category, recentCount: recent, priorCount: prior });
      } else if (recent >= 2 && prior >= 2) {
        // Consistent struggle in both windows
        persistent.push(category);
      }
    } else if (recent >= 2 && prior === 0) {
      // New problem emerging
      declining.push({ category, recentCount: recent, priorCount: 0 });
    } else if (prior >= 2 && recent === 0) {
      // Problem resolved
      improving.push({ category, recentCount: 0, priorCount: prior });
    }
  }

  const trendData: TrendData = {
    declining: declining.sort((a, b) => b.recentCount - a.recentCount),
    improving: improving.sort((a, b) => b.priorCount - a.priorCount),
    persistent: persistent.sort(
      (a, b) => (totalNeedsWork[b] ?? 0) - (totalNeedsWork[a] ?? 0)
    ),
    totalRecentObs: recentObs.length,
    totalPriorObs: priorObs.length,
  };

  return {
    totalObs: allObs.length,
    daysOfData: 14,
    topNeedsWork: Object.entries(totalNeedsWork)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count })),
    topStrengths: Object.entries(positiveCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count })),
    trendData,
  };
}

export async function POST(request: Request) {
  const _guard = await requireAIAccess('plans');
  if ('response' in _guard) return _guard.response;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const body = await request.json();
  const {
    teamId,
    type = 'practice',
    opponent,
    focusSkills,
    promptText,
    opponentStrengths,
    opponentWeaknesses,
    keyOpponentPlayers,
    gameNotes,
  } = body;

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
            trendData: undefined,
          }))
        : Promise.resolve(null),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prompt: { system: string; user: string }, schema: any, interactionType: string;

    if (type === 'gameday') {
      prompt = PROMPT_REGISTRY.gamedaySheet({
        ...context,
        opponent,
        opponentStrengths: Array.isArray(opponentStrengths) ? opponentStrengths : undefined,
        opponentWeaknesses: Array.isArray(opponentWeaknesses) ? opponentWeaknesses : undefined,
        keyOpponentPlayers: Array.isArray(keyOpponentPlayers) ? keyOpponentPlayers : undefined,
        gameNotes: typeof gameNotes === 'string' ? gameNotes : undefined,
      });
      schema = gamedaySheetSchema;
      interactionType = 'generate_gameday_sheet';
    } else {
      prompt = PROMPT_REGISTRY.practicePlan({
        ...context,
        focusSkills,
        promptText: typeof promptText === 'string' && promptText.trim() ? promptText.trim() : undefined,
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
    return handleAIError(error, 'Plan');
  }
}
