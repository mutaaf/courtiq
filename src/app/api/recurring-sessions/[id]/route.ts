import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// DELETE /api/recurring-sessions/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await createServiceSupabase();

    // Verify ownership — only the creator (or team admin) may delete
    const { data: rec } = await admin
      .from('recurring_sessions')
      .select('coach_id, team_id')
      .eq('id', id)
      .maybeSingle();

    if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Must be the creating coach OR an admin in the team
    const { data: membership } = await admin
      .from('team_coaches')
      .select('role')
      .eq('team_id', rec.team_id)
      .eq('coach_id', user.id)
      .maybeSingle();

    const isOwner = rec.coach_id === user.id;
    const isAdmin = membership?.role === 'head_coach';
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await admin.from('recurring_sessions').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
