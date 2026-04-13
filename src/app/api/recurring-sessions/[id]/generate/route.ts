import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// POST /api/recurring-sessions/[id]/generate
// Generates individual session rows for every matching weekday
// between the template's start_date and end_date, skipping dates
// that already have a session of the same type for this team.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await createServiceSupabase();

    // Load the template
    const { data: template, error: tErr } = await admin
      .from('recurring_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Verify team membership
    const { data: membership } = await admin
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', template.team_id)
      .eq('coach_id', user.id)
      .maybeSingle();

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Collect all dates in range that match the day_of_week
    const start = new Date(template.start_date + 'T00:00:00');
    const end   = new Date(template.end_date   + 'T00:00:00');
    const targetDay: number = template.day_of_week;
    const candidateDates: string[] = [];

    const cur = new Date(start);
    // Advance to first occurrence of targetDay
    while (cur.getDay() !== targetDay) cur.setDate(cur.getDate() + 1);

    while (cur <= end) {
      candidateDates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 7);
    }

    if (candidateDates.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0, dates: [] });
    }

    // Find existing sessions on those dates for this team with the same type
    const { data: existing } = await admin
      .from('sessions')
      .select('date')
      .eq('team_id', template.team_id)
      .eq('type', template.type)
      .in('date', candidateDates);

    const existingDates = new Set((existing || []).map((s: any) => s.date));
    const newDates = candidateDates.filter(d => !existingDates.has(d));

    if (newDates.length === 0) {
      return NextResponse.json({ created: 0, skipped: candidateDates.length, dates: [] });
    }

    // Bulk insert
    const rows = newDates.map(date => ({
      team_id:   template.team_id,
      coach_id:  user.id,
      type:      template.type,
      date,
      start_time: template.start_time  || null,
      end_time:   template.end_time    || null,
      location:   template.location    || null,
    }));

    const { data: inserted, error: iErr } = await admin
      .from('sessions')
      .insert(rows)
      .select('id, date');

    if (iErr) throw iErr;

    return NextResponse.json({
      created: inserted?.length ?? 0,
      skipped: candidateDates.length - (inserted?.length ?? 0),
      dates: (inserted || []).map((s: any) => s.date),
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
