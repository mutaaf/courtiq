import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Find coach record and org
  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id')
    .eq('auth_id', user.id)
    .single();

  if (!coach) return NextResponse.json({ error: 'Coach record not found' }, { status: 404 });

  const { org_id } = coach;

  // Count other coaches in this org
  const { count: coachCount } = await admin
    .from('coaches')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', org_id);

  const isOnlyCoach = (coachCount ?? 0) <= 1;

  if (isOnlyCoach) {
    // Full org data deletion — COPPA-compliant: all player data removed
    // Order matters: children before parents (FK constraints)
    const teamIds: string[] = [];
    const { data: teams } = await admin.from('teams').select('id').eq('org_id', org_id);
    if (teams) teamIds.push(...teams.map((t) => t.id));

    if (teamIds.length > 0) {
      // Delete in dependency order
      await admin.from('observations').delete().in('team_id', teamIds);
      await admin.from('player_skill_proficiency').delete().in('team_id', teamIds);
      await admin.from('player_goals').delete().in('team_id', teamIds);
      await admin.from('player_notes').delete().in('team_id', teamIds);
      await admin.from('player_achievements').delete().in('team_id', teamIds);
      await admin.from('player_availability').delete().in('team_id', teamIds);
      await admin.from('session_attendance').delete().in('team_id', teamIds);
      await admin.from('players').delete().in('team_id', teamIds);
      await admin.from('plans').delete().in('team_id', teamIds);
      await admin.from('sessions').delete().in('team_id', teamIds);
      await admin.from('recurring_sessions').delete().in('team_id', teamIds);
      await admin.from('team_announcements').delete().in('team_id', teamIds);
      await admin.from('share_links').delete().in('team_id', teamIds);
      await admin.from('parent_reactions').delete().in('team_id', teamIds);
      await admin.from('teams').delete().in('id', teamIds);
    }

    await admin.from('coaches').delete().eq('org_id', org_id);
    await admin.from('organizations').delete().eq('id', org_id);
  } else {
    // Org has other coaches — remove this coach's personal data only
    // Player/team data stays for the remaining coaches
    await admin.from('player_notes').delete().eq('coach_id', coach.id);
    await admin.from('coaches').delete().eq('id', coach.id);
  }

  // Delete the Supabase auth user (irreversible — must be last)
  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteAuthError) {
    console.error('Failed to delete auth user:', deleteAuthError);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
