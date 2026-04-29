/**
 * Returns the signed-in coach's first team, used by onboarding screens that
 * need a teamId before the dashboard's team-context hooks have hydrated.
 */
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const { data } = await admin
    .from('team_coaches')
    .select('team_id')
    .eq('coach_id', user.id)
    .limit(1)
    .single();

  return NextResponse.json({ teamId: data?.team_id ?? null });
}
