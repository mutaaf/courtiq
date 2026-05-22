import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export interface ArcSession {
  session_number: number;
  theme?: string;
  carries_forward?: string | null;
  key_coaching_point?: string;
  drills?: unknown[];
}

export interface ActiveArcResponse {
  arc_title: string;
  total_sessions: number;
  currentSessionNumber: number;
  /** The session the coach should run next (1-indexed into sessions array) */
  currentSession: ArcSession | null;
  /** The prior session — carries its carries_forward / key_coaching_point for continuity */
  priorSession: ArcSession | null;
  progression_note?: string;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 });

  const admin = await createServiceSupabase();

  // Fetch the most recent practice_arc plan the caller owns for this team.
  // Scoping on both coach_id + team_id ensures cross-coach data isolation.
  const { data: plans } = await admin
    .from('plans')
    .select('id, title, created_at, content_structured')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .eq('type', 'practice_arc')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!plans || plans.length === 0) {
    return NextResponse.json({ active: null });
  }

  const arc = plans[0];
  const structured = arc.content_structured as {
    arc_title?: string;
    total_sessions?: number;
    sessions?: ArcSession[];
    progression_note?: string;
  } | null;

  if (!structured?.arc_title || !structured.total_sessions || !structured.sessions?.length) {
    return NextResponse.json({ active: null });
  }

  // Count sessions logged for this team since the arc was created (each = one arc session run).
  const { data: sessionsSince } = await admin
    .from('sessions')
    .select('id')
    .eq('team_id', teamId)
    .gte('date', arc.created_at.slice(0, 10))
    .limit(100);

  const sessionsLogged = (sessionsSince ?? []).length;
  // currentSessionNumber is 1-based and clamped to [1, total_sessions]
  const currentSessionNumber = Math.min(
    Math.max(1, sessionsLogged + 1),
    structured.total_sessions,
  );

  const sessions = structured.sessions;
  const currentIdx = currentSessionNumber - 1;
  const currentSession = sessions[currentIdx] ?? null;
  const priorSession = currentIdx > 0 ? (sessions[currentIdx - 1] ?? null) : null;

  const payload: ActiveArcResponse = {
    arc_title: structured.arc_title,
    total_sessions: structured.total_sessions,
    currentSessionNumber,
    currentSession,
    priorSession,
    progression_note: structured.progression_note,
  };

  return NextResponse.json({ active: payload });
}
