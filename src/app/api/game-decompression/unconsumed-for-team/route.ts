import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// GET /api/game-decompression/unconsumed-for-team?teamId=... — return the
// caller's MOST-RECENT unconsumed (`consumed_at IS NULL`) decompression
// for the team in the last 14 days, or null when none exists (ticket
// 0069).
//
// AUTHENTICATED — self-enforces auth below; NOT in publicPaths.
// The `/api/ai/plan` route reads this endpoint at the START of plan
// generation; if a decompression is present, the recommended drill is
// inserted as drill #1 of the new plan and the decompression is marked
// consumed in the same transaction.
//
// Head-coach check via team_coaches (LESSONS#0057). Explicit `.select()`
// allow-list per LESSONS#0036.
export async function GET(request: Request) {
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const teamId = url.searchParams.get('teamId');
  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // Head-coach check — never `teams.coach_id` (LESSONS#0057).
    const { data: teamCoach } = await supabase
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', teamId)
      .eq('coach_id', user.id)
      .single();
    if (!teamCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Explicit allow-list per LESSONS#0036 — never `select('*')` on a row
    // that joins to a session + a coach (a future column on this table
    // should never silently leak through this read).
    const { data: rows } = await supabase
      .from('game_decompressions')
      .select(
        'id, session_id, coach_id, team_id, transcript, duration_seconds, recommended_drill_name, recommended_drill_setup, recommended_drill_why, consumed_at, consumed_plan_id, created_at',
      )
      .eq('team_id', teamId)
      .eq('coach_id', user.id)
      .is('consumed_at', null)
      .gte('created_at', fourteenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    const decompression = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return NextResponse.json({ decompression });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Game-decompression unconsumed-for-team error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
