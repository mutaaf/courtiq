import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// POST /api/sub-handoff/recent-notes/seen — AUTHED. Marks every unread
// sub-note from the last 7 days as seen for the caller. Called by the
// /home <SubNoteCard /> Got-it button.
//
// One DB UPDATE — no body required.
export async function POST() {
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServiceSupabase();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  try {
    await supabase
      .from('sub_handoffs')
      .update({ sub_note_seen_at: nowIso })
      .eq('coach_id', user.id)
      .not('sub_note_at', 'is', null)
      .is('sub_note_seen_at', null)
      .gte('sub_note_at', sevenDaysAgo);

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sub-handoff recent-notes seen error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
