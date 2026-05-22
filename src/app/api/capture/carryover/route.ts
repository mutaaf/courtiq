import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import type { SessionDebriefResult } from '@/app/api/ai/session-debrief/route';

// GET /api/capture/carryover?teamId=<id>
// Returns the next_practice_focus strings from the most recent debriefed session
// for the coach's active team. Best-effort: returns { focus: [] } on any missing
// data rather than an error, so the carryover strip never blocks capture.
export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ focus: [] });

  const admin = await createServiceSupabase();

  // Resolve caller's org to scope the session read
  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();

  // Confirm the team belongs to the same org — a non-owned teamId returns an
  // empty result rather than an error to avoid leaking team existence.
  const { data: team } = await admin
    .from('teams')
    .select('org_id')
    .eq('id', teamId)
    .single();

  if (!team || !coach || team.org_id !== coach.org_id) {
    return NextResponse.json({ focus: [] });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, date, type, coach_debrief_extracts')
    .eq('team_id', teamId)
    .not('coach_debrief_extracts', 'is', null)
    .lte('date', today)
    .order('date', { ascending: false })
    .limit(1);

  const session = sessions?.[0];
  if (!session) return NextResponse.json({ focus: [] });

  const debrief = session.coach_debrief_extracts as SessionDebriefResult | null;
  const rawFocus = debrief?.next_practice_focus ?? [];
  const focus = rawFocus.slice(0, 3).map((f) => f.focus);

  return NextResponse.json({
    focus,
    sessionDate: session.date as string,
    sessionType: session.type as string,
  });
}
