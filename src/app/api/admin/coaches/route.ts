import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Verify user is admin
  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (!coach || coach.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Get all coaches in the org
  const { data: coaches } = await admin
    .from('coaches')
    .select('id, full_name, email, role, created_at')
    .eq('org_id', coach.org_id)
    .order('created_at', { ascending: true });

  // Get all teams in the org with player counts
  const { data: teams } = await admin
    .from('teams')
    .select('id, name')
    .eq('org_id', coach.org_id)
    .order('name', { ascending: true });

  const teamsWithCounts = await Promise.all(
    (teams || []).map(async (team) => {
      const { count } = await admin
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)
        .eq('is_active', true);
      return { ...team, player_count: count || 0 };
    })
  );

  return NextResponse.json({
    coaches: coaches || [],
    teams: teamsWithCounts,
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Verify user is admin
  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (!coach || coach.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { email } = await request.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  // Invite user via Supabase Auth
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { org_id: coach.org_id },
  });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: invite?.user?.id });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Verify user is admin
  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (!coach || coach.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { coachId, role } = await request.json();
  if (!coachId || !role) {
    return NextResponse.json({ error: 'coachId and role required' }, { status: 400 });
  }

  const validRoles = ['admin', 'head_coach', 'coach', 'assistant'];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Ensure target coach is in same org
  const { data: targetCoach } = await admin
    .from('coaches')
    .select('id, org_id')
    .eq('id', coachId)
    .single();

  if (!targetCoach || targetCoach.org_id !== coach.org_id) {
    return NextResponse.json({ error: 'Coach not found in your organization' }, { status: 404 });
  }

  const { error: updateError } = await admin
    .from('coaches')
    .update({ role })
    .eq('id', coachId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
