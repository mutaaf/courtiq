import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { handleAIError } from '@/lib/ai/error';
import type { SessionDebriefResult } from '@/app/api/ai/session-debrief/route';

export interface SessionBriefingResult {
  session_goal: string;
  focus_areas: Array<{
    skill: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  players_to_watch: Array<{
    name: string;
    note: string;
    type: 'needs_attention' | 'on_a_roll' | 'returning' | 'goal_deadline';
  }>;
  coaching_tips: string[];
  energy_note: string;
  unavailable_players: string[];
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { sessionId, teamId } = body;

  if (!sessionId || !teamId) {
    return NextResponse.json({ error: 'sessionId and teamId required' }, { status: 400 });
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
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch team info
    const { data: team } = await admin
      .from('teams')
      .select('name, age_group, current_week, sports(name)')
      .eq('id', teamId)
      .single();

    // Fetch active roster
    const { data: players } = await admin
      .from('players')
      .select('id, name, jersey_number, position')
      .eq('team_id', teamId)
      .eq('is_active', true);

    // Fetch recent observations (last 14 days) for trend context
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const { data: recentObs } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, players:player_id(name)')
      .eq('team_id', teamId)
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false })
      .limit(60);

    // Fetch player availability — latest record per player
    const { data: availability } = await admin
      .from('player_availability')
      .select('player_id, status, reason, players:player_id(name)')
      .eq('team_id', teamId)
      .in('status', ['injured', 'sick', 'unavailable', 'limited'])
      .order('created_at', { ascending: false })
      .limit(50);

    // Deduplicate: keep only most recent record per player
    const seenPlayers = new Set<string>();
    const unavailableRecords: typeof availability = [];
    for (const rec of availability || []) {
      if (!seenPlayers.has(rec.player_id)) {
        seenPlayers.add(rec.player_id);
        unavailableRecords.push(rec);
      }
    }

    // Fetch active player goals with deadlines within 7 days
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const { data: urgentGoals } = await admin
      .from('player_goals')
      .select('player_id, goal_text, target_date, players:player_id(name)')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .not('target_date', 'is', null)
      .lte('target_date', soon.toISOString().split('T')[0])
      .order('target_date', { ascending: true })
      .limit(10);

    // Fetch the most recent prior session with a debrief for continuity
    const { data: lastDebriefSession } = await admin
      .from('sessions')
      .select('date, type, coach_debrief_extracts')
      .eq('team_id', teamId)
      .neq('id', sessionId)
      .not('coach_debrief_extracts', 'is', null)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    const sportName = (team?.sports as any)?.name || 'basketball';
    const sessionType = session.type;
    const isGame = ['game', 'scrimmage', 'tournament'].includes(sessionType);
    const sessionDate = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    // Build observation summary: skill/sentiment counts per player
    const playerObsMap = new Map<
      string,
      { name: string; positive: number; needsWork: number; categories: Set<string> }
    >();
    for (const obs of recentObs || []) {
      const playerName = (obs.players as any)?.name || 'Team';
      const key = obs.player_id || 'team';
      if (!playerObsMap.has(key)) {
        playerObsMap.set(key, { name: playerName, positive: 0, needsWork: 0, categories: new Set() });
      }
      const bucket = playerObsMap.get(key)!;
      if (obs.sentiment === 'positive') bucket.positive++;
      else if (obs.sentiment === 'needs-work') bucket.needsWork++;
      if (obs.category) bucket.categories.add(obs.category);
    }

    // Identify players who need attention (high needs-work ratio) or are on a roll
    const playerSummaryLines: string[] = [];
    for (const [, data] of playerObsMap.entries()) {
      const total = data.positive + data.needsWork;
      if (total === 0) continue;
      const needsWorkRatio = data.needsWork / total;
      const trend = needsWorkRatio > 0.6 ? 'struggling' : needsWorkRatio < 0.3 ? 'thriving' : 'mixed';
      const cats = Array.from(data.categories).slice(0, 3).join(', ');
      playerSummaryLines.push(
        `${data.name}: ${data.positive}+ / ${data.needsWork}⚠ across ${total} obs (${trend}) | skills: ${cats || 'various'}`
      );
    }

    // Team-level skill trend: top needs-work categories
    const catNeedsWork: Record<string, number> = {};
    const catPositive: Record<string, number> = {};
    for (const obs of recentObs || []) {
      if (!obs.category) continue;
      if (obs.sentiment === 'needs-work') catNeedsWork[obs.category] = (catNeedsWork[obs.category] || 0) + 1;
      else if (obs.sentiment === 'positive') catPositive[obs.category] = (catPositive[obs.category] || 0) + 1;
    }
    const topNeedsWork = Object.entries(catNeedsWork)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, count]) => `${cat} (${count} needs-work obs)`);

    // Unavailable players
    const unavailableNames = unavailableRecords.map(
      (r) => `${(r.players as any)?.name || 'Unknown'} (${r.status}${r.reason ? ': ' + r.reason : ''})`
    );

    // Prior debrief focus points
    const priorFocusLines: string[] = [];
    if (lastDebriefSession?.coach_debrief_extracts) {
      const d = lastDebriefSession.coach_debrief_extracts as SessionDebriefResult;
      const priorDate = new Date(lastDebriefSession.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      if (d.next_practice_focus?.length) {
        priorFocusLines.push(`From ${priorDate} ${lastDebriefSession.type} debrief, recommended focus:`);
        d.next_practice_focus.forEach((f) => priorFocusLines.push(`  - ${f.focus}: ${f.rationale}`));
      }
    }

    // Urgent goals
    const urgentGoalLines = (urgentGoals || []).map((g) => {
      const days = g.target_date
        ? Math.ceil((new Date(g.target_date).getTime() - Date.now()) / 86400000)
        : null;
      return `${(g.players as any)?.name || 'Player'}: "${g.goal_text}" — due in ${days !== null ? days + ' days' : 'soon'}`;
    });

    const systemPrompt = [
      `You are SportsIQ's AI coaching assistant for youth ${sportName}.`,
      'You help volunteer coaches prepare for their sessions with data-driven, actionable briefings.',
      'Your tone is positive, practical, and concise. Keep coaching language age-appropriate.',
      'Focus on what the coach can realistically address in a single session.',
    ].join('\n');

    const userPrompt = [
      `=== SESSION BRIEFING REQUEST ===`,
      `Session: ${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)} on ${sessionDate}`,
      `Team: ${team?.name || 'Team'} | Sport: ${sportName} | Age Group: ${team?.age_group || 'Youth'} | Season Week: ${team?.current_week || 1}`,
      session.opponent ? `Opponent: ${session.opponent}` : null,
      session.location ? `Location: ${session.location}` : null,
      `Roster: ${players?.length || 0} active players`,
      '',
      unavailableNames.length > 0
        ? `=== UNAVAILABLE PLAYERS ===\n${unavailableNames.join('\n')}\n`
        : null,
      urgentGoalLines.length > 0
        ? `=== GOALS WITH UPCOMING DEADLINES ===\n${urgentGoalLines.join('\n')}\n`
        : null,
      priorFocusLines.length > 0
        ? `=== PRIOR SESSION RECOMMENDATIONS ===\n${priorFocusLines.join('\n')}\n`
        : null,
      topNeedsWork.length > 0
        ? `=== TEAM SKILL TRENDS (last 14 days, needs-work focus) ===\n${topNeedsWork.join('\n')}\n`
        : null,
      playerSummaryLines.length > 0
        ? `=== INDIVIDUAL PLAYER SUMMARIES (last 14 days) ===\n${playerSummaryLines.join('\n')}\n`
        : null,
      `=== GENERATE PRE-SESSION BRIEFING ===`,
      isGame
        ? 'This is a game/scrimmage. Focus on mental preparation, game-day reminders, and key matchup tips.'
        : 'This is a practice. Focus on skill development priorities and individual player growth.',
      '',
      'Generate a coaching briefing with:',
      '1. session_goal: one clear sentence for what success looks like today',
      '2. focus_areas: up to 3 skill areas to prioritize, with reason and priority (high/medium/low)',
      '3. players_to_watch: up to 4 players requiring special attention. Types:',
      '   - needs_attention: struggling recently or consistent needs-work obs',
      '   - on_a_roll: strong recent momentum worth acknowledging',
      '   - returning: unavailable last time or injured/sick (use for any from the unavailable list)',
      '   - goal_deadline: has an urgent goal coming up',
      '4. coaching_tips: exactly 3 brief, practical tips the coach can apply THIS session',
      '5. energy_note: one sentence on the team\'s current energy/momentum heading into this session',
      '6. unavailable_players: list of names from unavailable data (just first names, no status)',
      '',
      'Respond with JSON:',
      '{',
      '  "session_goal": "string",',
      '  "focus_areas": [{ "skill": "string", "reason": "string", "priority": "high"|"medium"|"low" }],',
      '  "players_to_watch": [{ "name": "string", "note": "string", "type": "needs_attention"|"on_a_roll"|"returning"|"goal_deadline" }],',
      '  "coaching_tips": ["string", "string", "string"],',
      '  "energy_note": "string",',
      '  "unavailable_players": ["string"]',
      '}',
    ]
      .filter((l) => l !== null)
      .join('\n');

    const result = await callAIWithJSON<SessionBriefingResult>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt,
        userPrompt,
        orgId: coach?.org_id || '',
        maxTokens: 1200,
        temperature: 0.5,
      },
      admin
    );

    const briefing = result.parsed;
    if (!briefing.focus_areas) briefing.focus_areas = [];
    if (!briefing.players_to_watch) briefing.players_to_watch = [];
    if (!briefing.coaching_tips) briefing.coaching_tips = [];
    if (!briefing.unavailable_players) briefing.unavailable_players = [];

    return NextResponse.json({ briefing, interactionId: result.interactionId });
  } catch (error: unknown) {
    return handleAIError(error, 'Session briefing');
  }
}
