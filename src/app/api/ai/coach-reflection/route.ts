import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { coachReflectionSchema, type CoachReflection } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { requireAIAccess } from '@/lib/ai/guard';

export interface CoachReflectionResult extends CoachReflection {
  sessionId: string;
}

export async function POST(request: Request) {
  const _guard = await requireAIAccess('sessions');
  if ('response' in _guard) return _guard.response;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, sessionId } = body;

  if (!teamId || !sessionId) {
    return NextResponse.json({ error: 'teamId and sessionId required' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // Fetch session details
    const { data: session } = await admin
      .from('sessions')
      .select('id, type, date')
      .eq('id', sessionId)
      .eq('team_id', teamId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch all observations for this session
    const { data: obsRows } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, players:player_id(name)')
      .eq('session_id', sessionId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });

    const allObs = obsRows || [];

    // Fetch roster for this team
    const { data: rosterRows } = await admin
      .from('players')
      .select('id, name')
      .eq('team_id', teamId)
      .eq('is_active', true);

    const roster = rosterRows || [];

    // Fetch active goals count
    const { count: activeGoalCount } = await admin
      .from('player_goals')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'active');

    // Fetch prior session health score (most recent session before this one)
    const { data: priorSessions } = await admin
      .from('sessions')
      .select('id, date')
      .eq('team_id', teamId)
      .lt('date', session.date)
      .order('date', { ascending: false })
      .limit(1);

    let priorSessionHealthScore: number | null = null;
    if (priorSessions && priorSessions.length > 0) {
      const { data: priorObs } = await admin
        .from('observations')
        .select('sentiment')
        .eq('session_id', priorSessions[0].id)
        .eq('team_id', teamId);

      if (priorObs && priorObs.length > 0) {
        const priorPositive = priorObs.filter((o: any) => o.sentiment === 'positive').length;
        priorSessionHealthScore = Math.round((priorPositive / priorObs.length) * 100);
      }
    }

    // Compute observation stats
    const playerObs = allObs.filter((o: any) => o.player_id);
    const positiveCount = allObs.filter((o: any) => o.sentiment === 'positive').length;
    const needsWorkCount = allObs.filter((o: any) => o.sentiment === 'needs-work').length;

    // Track which players were observed
    const observedPlayerIds = new Set(playerObs.map((o: any) => o.player_id));
    const observedPlayerCount = observedPlayerIds.size;
    const underobservedPlayers = roster
      .filter((p: any) => !observedPlayerIds.has(p.id))
      .map((p: any) => p.name)
      .slice(0, 5); // cap at 5 to keep prompt concise

    // Compute top categories
    const categoryCounts = new Map<string, { positive: number; total: number }>();
    for (const o of allObs) {
      const cat = (o as any).category || 'General';
      const existing = categoryCounts.get(cat) || { positive: 0, total: 0 };
      existing.total += 1;
      if ((o as any).sentiment === 'positive') existing.positive += 1;
      categoryCounts.set(cat, existing);
    }

    const topCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([category, counts]) => ({
        category,
        count: counts.total,
        dominant: counts.positive / counts.total >= 0.5 ? 'positive' : 'needs-work',
      }));

    // Pick standout moments (mix of positive + needs-work, with player names)
    const standoutMoments = playerObs
      .filter((o: any) => o.sentiment !== 'neutral')
      .slice(0, 10)
      .map((o: any) => ({
        playerName: (o.players as any)?.name || 'Unknown',
        category: o.category,
        sentiment: o.sentiment,
        text: o.text,
      }));

    const context = await buildAIContext(teamId, admin);

    const sessionDate = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const sessionTypeLabel: Record<string, string> = {
      practice: 'Practice',
      game: 'Game',
      scrimmage: 'Scrimmage',
      tournament: 'Tournament',
      training: 'Training session',
    };

    const prompt = PROMPT_REGISTRY.coachReflection({
      ...context,
      sessionDate,
      sessionType: sessionTypeLabel[session.type] || session.type,
      totalObservations: allObs.length,
      positiveCount,
      needsWorkCount,
      observedPlayerCount,
      totalPlayers: roster.length,
      underobservedPlayers,
      topCategories,
      standoutMoments,
      priorSessionHealthScore,
      activeGoalCount: activeGoalCount || 0,
    });

    const result = await callAIWithJSON<CoachReflection>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 900,
        temperature: 0.7,
      },
      admin
    );

    let validated: CoachReflection;
    try {
      validated = coachReflectionSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Coach reflection Zod validation relaxed:', zodError);
      validated = result.parsed as CoachReflection;
    }

    const sessionDateShort = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const typeLabel = sessionTypeLabel[session.type] || 'Session';

    // Assign sequential IDs if AI didn't (safety net)
    validated.questions = validated.questions.map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
    }));

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type: 'coach_reflection',
      title: `${typeLabel} Reflection — ${sessionDateShort}`,
      content: JSON.stringify({ ...validated, sessionId, answers: {} }),
      content_structured: { ...validated, sessionId, answers: {} },
      curriculum_week: context.seasonWeek,
    }).select().single();

    return NextResponse.json({
      plan,
      reflection: validated,
      interactionId: result.interactionId,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Coach reflection generation');
  }
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { planId, answers } = body;

  if (!planId || !answers) {
    return NextResponse.json({ error: 'planId and answers required' }, { status: 400 });
  }

  try {
    // Fetch the plan to verify ownership and get current content
    const { data: plan } = await admin
      .from('plans')
      .select('id, coach_id, content_structured')
      .eq('id', planId)
      .eq('coach_id', user.id)
      .single();

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const updated = {
      ...(plan.content_structured as object),
      answers,
    };

    const { data: savedPlan } = await admin
      .from('plans')
      .update({
        content: JSON.stringify(updated),
        content_structured: updated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .select()
      .single();

    return NextResponse.json({ plan: savedPlan });
  } catch (error: unknown) {
    const e = error as any;
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('Coach reflection save error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
