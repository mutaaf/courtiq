import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { buildStreakData, getDayKey } from '@/lib/streak-utils';

// GET /api/streak?team_id=xxx
// Returns coaching streak data for the authenticated coach on the given team.
// Activity = any observation created OR any session logged for that team, per day.

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');
  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const admin = await createServiceSupabase();

  // Fetch observation dates + session dates in parallel (last 365 days)
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString();

  const [obsResult, sessResult] = await Promise.all([
    admin
      .from('observations')
      .select('created_at')
      .eq('team_id', teamId)
      .gte('created_at', since)
      .order('created_at', { ascending: false }),
    admin
      .from('sessions')
      .select('created_at')
      .eq('team_id', teamId)
      .gte('created_at', since)
      .order('created_at', { ascending: false }),
  ]);

  const obsDates = (obsResult.data ?? []).map((r: any) =>
    getDayKey(new Date(r.created_at))
  );
  const sessDates = (sessResult.data ?? []).map((r: any) =>
    getDayKey(new Date(r.created_at))
  );

  const allDates = [...obsDates, ...sessDates];
  const today = getDayKey(new Date());

  const streakData = buildStreakData(allDates, today);

  return NextResponse.json(streakData);
}
