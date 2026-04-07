import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('*, organizations(id, name, slug, tier, sport_config)')
    .eq('id', user.id)
    .single();

  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // Get teams
  const { data: teamCoaches } = await admin
    .from('team_coaches')
    .select('team_id, role, teams(*)')
    .eq('coach_id', user.id);

  const teams = (teamCoaches || []).map((tc: any) => ({
    ...tc.teams,
    coachRole: tc.role,
  }));

  return NextResponse.json({ coach, teams });
}
