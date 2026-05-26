import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { practiceArcSchema, type PracticeArc } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import {
  isValidSessionCount,
  isValidSessionDuration,
  buildArcTitle,
} from '@/lib/practice-arc-utils';
import { readProgramFocus } from '@/lib/ai/program-focus';
import {
  buildCoachingSignature,
  type CoachPlanRow,
  type CoachingSignature,
} from '@/lib/coaching-signature-utils';

/**
 * Ticket 0037 — fetch the requesting coach's OWN recent plans (all their teams,
 * scoped `eq('coach_id', coachId)`) and derive a coaching signature. Ticket
 * 0039 added the second argument: the coach's `coach_drill_signals` rows (their
 * thumbs-up / thumbs-down on individual drills) re-rank the signature's
 * recurring drills. Best-effort: any read failure or a cold-start coach resolves
 * to null, leaving the arc unchanged. Reads only plan-derived fields and the
 * coach-private drill signals — no minor data (COPPA).
 */
async function fetchCoachingSignature(
  coachId: string,
  admin: Awaited<ReturnType<typeof createServiceSupabase>>,
): Promise<CoachingSignature | null> {
  try {
    const [plansRes, signalsRes] = await Promise.all([
      admin
        .from('plans')
        .select('type, skills_targeted, content_structured')
        .eq('coach_id', coachId)
        .in('type', ['practice', 'practice_arc'])
        .order('created_at', { ascending: false })
        .limit(40),
      admin
        .from('coach_drill_signals')
        .select('drill_id, rating, run_count')
        .eq('coach_id', coachId),
    ]);

    const plans = (plansRes.data ?? []) as CoachPlanRow[];
    const signals = (signalsRes.data ?? []) as Array<{
      drill_id: string;
      rating: 'up' | 'down';
      run_count: number;
    }>;

    let drillIdByName: Record<string, string> | undefined = undefined;
    if (signals.length > 0) {
      const { data: drills } = await admin
        .from('drills')
        .select('id, name')
        .in(
          'id',
          signals.map((s) => s.drill_id),
        );
      const rows = (drills ?? []) as Array<{ id: string; name: string }>;
      if (rows.length > 0) {
        drillIdByName = {};
        for (const r of rows) drillIdByName[r.name] = r.id;
      }
    }

    return buildCoachingSignature(plans, {
      drillSignals: signals.length > 0 ? signals : undefined,
      drill_id_by_name: drillIdByName,
    });
  } catch {
    return null;
  }
}

/** Fetch top needs-work and strength categories from recent observations */
async function fetchObsSummary(
  teamId: string,
  admin: Awaited<ReturnType<typeof createServiceSupabase>>,
): Promise<{ topNeedsWork: string[]; topStrengths: string[]; totalObs: number; recentSessions: number }> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: obsRows }, { data: sessionRows }] = await Promise.all([
    admin
      .from('observations')
      .select('category, sentiment')
      .eq('team_id', teamId)
      .gte('created_at', cutoff)
      .limit(500),
    admin
      .from('sessions')
      .select('id')
      .eq('team_id', teamId)
      .gte('date', cutoff.slice(0, 10))
      .limit(50),
  ]);

  const obs = obsRows || [];
  const needsWork: Record<string, number> = {};
  const strengths: Record<string, number> = {};

  for (const o of obs) {
    if (!o.category) continue;
    if (o.sentiment === 'needs-work') {
      needsWork[o.category] = (needsWork[o.category] ?? 0) + 1;
    } else if (o.sentiment === 'positive') {
      strengths[o.category] = (strengths[o.category] ?? 0) + 1;
    }
  }

  const sortByCount = (rec: Record<string, number>) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

  return {
    topNeedsWork: sortByCount(needsWork),
    topStrengths: sortByCount(strengths),
    totalObs: obs.length,
    recentSessions: (sessionRows || []).length,
  };
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, numSessions, sessionDuration, upcomingEvent, focusArea } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  const parsedSessions: number = parseInt(String(numSessions), 10);
  const parsedDuration: number = parseInt(String(sessionDuration), 10);

  if (!isValidSessionCount(parsedSessions)) {
    return NextResponse.json({ error: 'numSessions must be 2 or 3' }, { status: 400 });
  }
  if (!isValidSessionDuration(parsedDuration)) {
    return NextResponse.json({ error: 'sessionDuration must be 30, 45, 60, 75, or 90' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id, name')
      .eq('id', user.id)
      .single();

    const [context, obsSummary, programFocus, coachingSignature] = await Promise.all([
      buildAIContext(teamId, admin),
      fetchObsSummary(teamId, admin),
      // Ticket 0031 — best-effort program weekly focus, threaded as a soft hint;
      // null off the Organization tier or when unset, never blocks generation.
      readProgramFocus(teamId, admin),
      // Ticket 0037 — best-effort coach-scoped coaching signature, threaded as a
      // soft preference; null for a cold-start coach, never blocks generation.
      fetchCoachingSignature(user.id, admin),
    ]);

    const effectiveFocus = focusArea?.trim()
      ? [focusArea.trim()]
      : obsSummary.topNeedsWork.slice(0, 2);

    const prompt = PROMPT_REGISTRY.practiceArc({
      ...context,
      numSessions: parsedSessions,
      sessionDurationMinutes: parsedDuration,
      upcomingEvent: upcomingEvent?.trim() || undefined,
      focusArea: focusArea?.trim() || undefined,
      topNeedsWork: obsSummary.topNeedsWork,
      topStrengths: obsSummary.topStrengths,
      totalObs: obsSummary.totalObs,
      recentSessions: obsSummary.recentSessions,
      programFocus: programFocus ?? undefined,
      coachingSignature: coachingSignature ?? undefined,
    });

    const result = await callAIWithJSON<PracticeArc>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'generate_practice_plan',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 3000,
        temperature: 0.6,
      },
      admin,
    );

    let validated: PracticeArc;
    try {
      validated = practiceArcSchema.parse(result.parsed);
    } catch (zodError) {
      console.warn('Practice arc Zod validation relaxed:', zodError);
      validated = result.parsed as PracticeArc;
    }

    const arcTitle =
      validated.arc_title || buildArcTitle(parsedSessions, upcomingEvent?.trim(), effectiveFocus);

    const { data: plan } = await admin
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        ai_interaction_id: result.interactionId,
        type: 'practice_arc',
        title: arcTitle,
        content: JSON.stringify(validated),
        content_structured: validated,
      })
      .select()
      .single();

    return NextResponse.json({ plan, arc: validated, interactionId: result.interactionId });
  } catch (error: unknown) {
    return handleAIError(error, 'Practice arc generation');
  }
}
