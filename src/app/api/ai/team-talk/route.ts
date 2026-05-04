import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { buildAIContext } from '@/lib/ai/context-builder';
import { teamTalkSchema, type TeamTalk } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { requireAIAccess } from '@/lib/ai/guard';

const SESSION_TYPE_LABELS: Record<string, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

export async function POST(request: Request) {
  const _guard = await requireAIAccess('sessions');
  if ('response' in _guard) return _guard.response;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId, sessionId, weeklyFocusLabel } = body;

  if (!teamId || !sessionId) {
    return NextResponse.json({ error: 'teamId and sessionId required' }, { status: 400 });
  }

  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id, full_name')
      .eq('id', user.id)
      .single();

    const { data: session } = await admin
      .from('sessions')
      .select('id, type, date, opponent')
      .eq('id', sessionId)
      .eq('team_id', teamId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch last 14 days of observations for team context
    const since14d = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: recentObs } = await admin
      .from('observations')
      .select('category, sentiment')
      .eq('team_id', teamId)
      .gte('created_at', since14d);

    // Fetch recent session count for context
    const { count: recentSessionCount } = await admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId);

    // Compute top strengths and challenges from recent observations
    const catMap: Record<string, { pos: number; neg: number }> = {};
    for (const obs of recentObs ?? []) {
      if (!obs.category) continue;
      if (!catMap[obs.category]) catMap[obs.category] = { pos: 0, neg: 0 };
      if (obs.sentiment === 'positive') catMap[obs.category].pos++;
      if (obs.sentiment === 'needs-work') catMap[obs.category].neg++;
    }

    const topStrengths = Object.entries(catMap)
      .filter(([, v]) => v.pos > 0)
      .sort((a, b) => b[1].pos - a[1].pos)
      .slice(0, 3)
      .map(([cat]) => cat);

    const topChallenges = Object.entries(catMap)
      .filter(([, v]) => v.neg > 0)
      .sort((a, b) => b[1].neg - a[1].neg)
      .slice(0, 3)
      .map(([cat]) => cat);

    const context = await buildAIContext(teamId, admin);
    const sessionLabel = SESSION_TYPE_LABELS[session.type] ?? session.type;

    const sessionDateShort = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    const prompt = PROMPT_REGISTRY.teamTalk({
      ...context,
      sessionType: session.type,
      sessionLabel,
      opponent: session.opponent ?? undefined,
      topStrengths,
      topChallenges,
      weeklyFocusLabel: weeklyFocusLabel ?? undefined,
      recentSessionCount: recentSessionCount ?? 0,
    });

    const result = await callAIWithJSON<TeamTalk>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId: coach?.org_id || '',
        maxTokens: 300,
        temperature: 0.7,
      },
      admin,
    );

    let validated: TeamTalk;
    try {
      validated = teamTalkSchema.parse(result.parsed);
    } catch {
      validated = result.parsed as TeamTalk;
    }

    const { data: plan } = await admin.from('plans').insert({
      team_id: teamId,
      coach_id: user.id,
      ai_interaction_id: result.interactionId,
      type: 'team_talk',
      title: `Opening Team Talk — ${sessionLabel} · ${sessionDateShort}`,
      content: JSON.stringify(validated),
      content_structured: validated,
    }).select().single();

    return NextResponse.json({ plan, teamTalk: validated, interactionId: result.interactionId });
  } catch (error: unknown) {
    return handleAIError(error, 'Team talk generation');
  }
}
