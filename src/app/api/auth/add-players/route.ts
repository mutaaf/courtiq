import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { playerNames } = await request.json();
  const names: string[] = (playerNames || []).filter((n: string) => n && n.trim());

  if (names.length === 0) return NextResponse.json({ success: true, count: 0 });

  const admin = await createServiceSupabase();

  // Get the coach's first team
  const { data: teamCoach } = await admin.from('team_coaches')
    .select('team_id, teams(age_group)')
    .eq('coach_id', user.id)
    .limit(1)
    .single();

  if (!teamCoach) return NextResponse.json({ error: 'No team found' }, { status: 404 });

  const ageGroup = (teamCoach as any).teams?.age_group || '8-10';

  const { error } = await admin.from('players').insert(
    names.map((name: string) => ({
      team_id: teamCoach.team_id,
      name: name.trim(),
      age_group: ageGroup,
    }))
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, count: names.length });
}
