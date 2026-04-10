import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';

export interface SessionDebriefResult {
  session_summary: string;
  player_highlights: Array<{
    player_name: string;
    highlight: string;
  }>;
  areas_to_improve: Array<{
    skill_area: string;
    detail: string;
    player_count: number;
  }>;
  next_practice_focus: Array<{
    focus: string;
    rationale: string;
    suggested_drill: string;
  }>;
  coaching_tip: string;
  overall_tone: 'great' | 'good' | 'developing' | 'struggling';
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

    // Fetch session
    const { data: session } = await admin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch all observations for this session with player names
    const { data: observations } = await admin
      .from('observations')
      .select('player_id, category, sentiment, text, players:player_id(name)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (!observations || observations.length === 0) {
      return NextResponse.json(
        { error: 'No observations found for this session. Capture some observations first.' },
        { status: 400 }
      );
    }

    // Fetch team info
    const { data: team } = await admin
      .from('teams')
      .select('name, age_group, current_week, sports(name)')
      .eq('id', teamId)
      .single();

    // Fetch active roster for context
    const { data: players } = await admin
      .from('players')
      .select('id, name, jersey_number, position')
      .eq('team_id', teamId)
      .eq('is_active', true);

    const sportName = (team?.sports as any)?.name || 'basketball';
    const sessionType = session.type;
    const sessionDate = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    // Build observation summary for the prompt
    const obsByPlayer = new Map<
      string,
      { positive: string[]; needsWork: string[]; neutral: string[]; name: string }
    >();

    for (const obs of observations) {
      const playerName = (obs.players as any)?.name || 'Team';
      const key = obs.player_id || 'team';
      if (!obsByPlayer.has(key)) {
        obsByPlayer.set(key, { positive: [], needsWork: [], neutral: [], name: playerName });
      }
      const bucket = obsByPlayer.get(key)!;
      if (obs.sentiment === 'positive') bucket.positive.push(obs.text);
      else if (obs.sentiment === 'needs-work') bucket.needsWork.push(obs.text);
      else bucket.neutral.push(obs.text);
    }

    const observationBlocks = Array.from(obsByPlayer.entries()).map(([, data]) => {
      const lines = [`Player: ${data.name}`];
      if (data.positive.length) lines.push(`  ✓ Positive: ${data.positive.join('; ')}`);
      if (data.needsWork.length) lines.push(`  ⚠ Needs Work: ${data.needsWork.join('; ')}`);
      if (data.neutral.length) lines.push(`  • Neutral: ${data.neutral.join('; ')}`);
      return lines.join('\n');
    });

    const totalPositive = observations.filter((o) => o.sentiment === 'positive').length;
    const totalNeedsWork = observations.filter((o) => o.sentiment === 'needs-work').length;

    const systemPrompt = [
      `You are an expert youth ${sportName} coaching assistant for SportsIQ.`,
      'You analyze post-session data and generate actionable, encouraging coaching insights.',
      'You work with volunteer coaches at youth organizations like the YMCA.',
      'Your tone is positive, growth-mindset oriented, and practical.',
      'Keep feedback age-appropriate and constructive.',
    ].join('\n');

    const userPrompt = [
      `Session: ${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)} on ${sessionDate}`,
      `Team: ${team?.name || 'Team'} | Age Group: ${team?.age_group || 'Youth'} | Season Week: ${team?.current_week || 1}`,
      session.opponent ? `Opponent: ${session.opponent}` : null,
      `Players on roster: ${players?.length || 0}`,
      `Total observations: ${observations.length} (${totalPositive} positive, ${totalNeedsWork} needs-work)`,
      '',
      '--- OBSERVATIONS ---',
      observationBlocks.join('\n\n'),
      '',
      'Generate a post-session debrief with:',
      '1. A brief session summary (2-3 sentences, encouraging)',
      '2. Player highlights (positive callouts, max 3, must be from actual observations)',
      '3. Top areas to improve (max 3, from actual needs-work observations)',
      '4. Next practice focus (3 actionable items with a specific drill suggestion each)',
      '5. One coaching tip for the coach themselves',
      '6. Overall session tone (great/good/developing/struggling) based on positive vs needs-work ratio',
      '',
      'Respond with JSON:',
      '{',
      '  "session_summary": "string",',
      '  "player_highlights": [{ "player_name": "string", "highlight": "string" }],',
      '  "areas_to_improve": [{ "skill_area": "string", "detail": "string", "player_count": number }],',
      '  "next_practice_focus": [{ "focus": "string", "rationale": "string", "suggested_drill": "string" }],',
      '  "coaching_tip": "string",',
      '  "overall_tone": "great" | "good" | "developing" | "struggling"',
      '}',
    ]
      .filter((l) => l !== null)
      .join('\n');

    const result = await callAIWithJSON<SessionDebriefResult>(
      {
        coachId: user.id,
        teamId,
        interactionType: 'custom',
        systemPrompt,
        userPrompt,
        orgId: coach?.org_id || '',
        maxTokens: 1500,
        temperature: 0.6,
      },
      admin
    );

    const debrief = result.parsed;

    // Save the structured debrief back to the session
    await admin
      .from('sessions')
      .update({ coach_debrief_extracts: debrief as any })
      .eq('id', sessionId);

    return NextResponse.json({ debrief, interactionId: result.interactionId });
  } catch (error: any) {
    console.error('Session debrief error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
