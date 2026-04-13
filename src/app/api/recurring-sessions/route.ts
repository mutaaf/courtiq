import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/recurring-sessions?team_id=...
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

    const admin = await createServiceSupabase();

    // Verify user is a member of this team
    const { data: membership } = await admin
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', teamId)
      .eq('coach_id', user.id)
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await admin
      .from('recurring_sessions')
      .select('*')
      .eq('team_id', teamId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/recurring-sessions — create a recurring session template
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { team_id, type, day_of_week, start_time, end_time, location, start_date, end_date } = body;

    if (!team_id || day_of_week == null || !start_date || !end_date) {
      return NextResponse.json({ error: 'team_id, day_of_week, start_date, end_date required' }, { status: 400 });
    }
    if (day_of_week < 0 || day_of_week > 6) {
      return NextResponse.json({ error: 'day_of_week must be 0–6' }, { status: 400 });
    }
    if (end_date < start_date) {
      return NextResponse.json({ error: 'end_date must be >= start_date' }, { status: 400 });
    }

    const admin = await createServiceSupabase();

    const { data: membership } = await admin
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', team_id)
      .eq('coach_id', user.id)
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await admin
      .from('recurring_sessions')
      .insert({
        team_id,
        coach_id: user.id,
        type: type || 'practice',
        day_of_week,
        start_time: start_time || null,
        end_time: end_time || null,
        location: location || null,
        start_date,
        end_date,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
