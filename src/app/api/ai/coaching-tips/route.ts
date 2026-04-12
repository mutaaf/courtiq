import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';

export interface CoachingTip {
  type: 'alert' | 'suggestion' | 'praise';
  message: string;
  action_label?: string;
  action_href?: string;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { teamId } = body;
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 });

  try {
    const now = Date.now();
    const day = 86_400_000;
    const thirtyDaysAgo = new Date(now - 30 * day).toISOString();
    const thirtyDaysAgoDate = new Date(now - 30 * day).toISOString().split('T')[0];

    // Fetch team data, roster, observations, and sessions in parallel
    const [teamRes, playersRes, obsRes, sessionsRes, coachRes] = await Promise.all([
      admin
        .from('teams')
        .select('name, age_group, current_week, sports(name)')
        .eq('id', teamId)
        .single(),
      admin
        .from('players')
        .select('id, name, jersey_number')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      admin
        .from('observations')
        .select('player_id, category, sentiment, created_at')
        .eq('team_id', teamId)
        .gte('created_at', thirtyDaysAgo),
      admin
        .from('sessions')
        .select('id, date, type')
        .eq('team_id', teamId)
        .gte('date', thirtyDaysAgoDate)
        .order('date', { ascending: false }),
      admin.from('coaches').select('org_id').eq('id', user.id).single(),
    ]);

    const teamData = teamRes.data;
    const players = playersRes.data || [];
    const obsList = obsRes.data || [];
    const sessions = sessionsRes.data || [];
    const sportName = (teamData?.sports as any)?.name || 'basketball';

    // ── Metric computation ──────────────────────────────────────────────────

    const obs7d = obsList.filter((o) => now - new Date(o.created_at).getTime() < 7 * day);
    const obs7to14d = obsList.filter((o) => {
      const age = now - new Date(o.created_at).getTime();
      return age >= 7 * day && age < 14 * day;
    });
    const obs14d = obsList.filter((o) => now - new Date(o.created_at).getTime() < 14 * day);

    const calcHealth = (obs: typeof obsList): number | null => {
      const scored = obs.filter((o) => o.sentiment !== 'neutral');
      if (!scored.length) return null;
      return Math.round(
        (obs.filter((o) => o.sentiment === 'positive').length / scored.length) * 100
      );
    };

    const thisWeekHealth = calcHealth(obs7d);
    const lastWeekHealth = calcHealth(obs7to14d);
    const healthDelta =
      thisWeekHealth !== null && lastWeekHealth !== null
        ? thisWeekHealth - lastWeekHealth
        : null;

    // Players not observed in the last 7 days
    const observedIds7d = new Set(obs7d.filter((o) => o.player_id).map((o) => o.player_id));
    const unobservedThisWeek = players.filter((p) => !observedIds7d.has(p.id));

    // Players not observed in the last 14 days (long gaps)
    const observedIds14d = new Set(obs14d.filter((o) => o.player_id).map((o) => o.player_id));
    const longGapPlayers = players.filter((p) => !observedIds14d.has(p.id));

    // Top needs-work categories in last 14 days
    const needsWorkCounts = new Map<string, number>();
    obs14d
      .filter((o) => o.sentiment === 'needs-work' && o.category)
      .forEach((o) => {
        needsWorkCounts.set(o.category, (needsWorkCounts.get(o.category) ?? 0) + 1);
      });
    const topNeedsWork = [...needsWorkCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Last session date
    const lastSession = sessions[0];
    const daysSinceLastSession = lastSession
      ? Math.floor((now - new Date(lastSession.date + 'T00:00:00').getTime()) / day)
      : null;

    // Sessions this week
    const sessionsThisWeek = sessions.filter(
      (s) => now - new Date(s.date + 'T00:00:00').getTime() < 7 * day
    );

    // ── Build AI prompt context ──────────────────────────────────────────────

    const lines: string[] = [
      `Team: ${teamData?.name ?? 'Team'} | Sport: ${sportName} | Age Group: ${teamData?.age_group ?? 'Youth'} | Season Week: ${teamData?.current_week ?? 1}`,
      `Active players: ${players.length}`,
      '',
      '=== LAST 7 DAYS ===',
      `Observations: ${obs7d.length}`,
      thisWeekHealth !== null
        ? `Health score: ${thisWeekHealth}%${lastWeekHealth !== null ? ` (${healthDelta! >= 0 ? '+' : ''}${healthDelta}% vs prior week)` : ''}`
        : 'Health score: not enough data',
      sessionsThisWeek.length > 0
        ? `Sessions logged: ${sessionsThisWeek.length} (${sessionsThisWeek.map((s) => s.type).join(', ')})`
        : 'No sessions logged this week',
    ];

    if (unobservedThisWeek.length === 0) {
      lines.push('Player coverage: all players observed this week ✓');
    } else {
      lines.push(
        `Players not observed this week (${unobservedThisWeek.length}/${players.length}): ${unobservedThisWeek
          .slice(0, 6)
          .map((p) => p.name)
          .join(', ')}${unobservedThisWeek.length > 6 ? ` +${unobservedThisWeek.length - 6} more` : ''}`
      );
    }

    if (longGapPlayers.length > 0) {
      lines.push(
        `Players with 14+ day observation gap: ${longGapPlayers
          .slice(0, 4)
          .map((p) => p.name)
          .join(', ')}`
      );
    }

    lines.push('', '=== LAST 14 DAYS ===');

    if (topNeedsWork.length > 0) {
      lines.push(
        `Top needs-work skill areas: ${topNeedsWork.map(([cat, n]) => `${cat} (${n}x)`).join(', ')}`
      );
    } else {
      lines.push('No significant needs-work patterns');
    }

    if (daysSinceLastSession !== null) {
      lines.push(`Last session: ${daysSinceLastSession} day(s) ago (${lastSession?.type})`);
    } else {
      lines.push('No sessions logged in the last 30 days');
    }

    lines.push(
      '',
      `Total observations (30 days): ${obsList.length}`,
      `Total sessions (30 days): ${sessions.length}`
    );

    const contextBlock = lines.join('\n');

    const systemPrompt = [
      `You are a proactive coaching intelligence assistant for SportsIQ, a youth ${sportName} coaching app.`,
      'Analyze team metrics and generate 2–3 brief, warm, actionable coaching tips.',
      'Be specific (mention skill names, player counts, percentages).',
      'Avoid generic advice — make each tip directly based on the data provided.',
    ].join(' ');

    const userPrompt = [
      contextBlock,
      '',
      'Generate 2–3 coaching tips. Rules:',
      '- type "alert" = urgent attention needed (e.g. coverage gap, sharp health drop)',
      '- type "suggestion" = improvement opportunity (e.g. drill a weak skill area)',
      '- type "praise" = celebrate a positive metric (use sparingly, only if clearly warranted)',
      '- message: 1–2 sentences, specific and warm',
      '- action_label: 2–4 words (e.g. "View Drills", "Go to Roster")',
      '- action_href: one of /capture, /roster, /drills, /plans, /sessions, /analytics',
      '',
      'Respond with a JSON array only:',
      '[{ "type": "alert"|"suggestion"|"praise", "message": "...", "action_label": "...", "action_href": "..." }]',
    ].join('\n');

    const result = await callAIWithJSON<CoachingTip[]>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt,
        userPrompt,
        orgId: coachRes.data?.org_id || '',
        maxTokens: 600,
        temperature: 0.45,
      },
      admin
    );

    const tips = Array.isArray(result.parsed) ? result.parsed.slice(0, 3) : [];

    return NextResponse.json({ tips });
  } catch (error: any) {
    console.error('Coaching tips error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
