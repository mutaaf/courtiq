import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { truncateForHome } from '@/lib/sub-handoff-utils';

// GET /api/sub-handoff/recent-notes — AUTHED. Returns the caller's
// unread sub-notes from the last 7 days, ordered most-recent first.
//
// Powers the <SubNoteCard /> on /home — the card renders ONE line per
// unread sub-note (capped at 3 in the UI; the route returns up to 10 so
// the "+ N more" tail can be derived client-side).
//
// "Unread" = sub_note_at IS NOT NULL AND sub_note_seen_at IS NULL. Tapping
// Got-it on the card POSTs /api/sub-handoff/recent-notes/seen which
// stamps sub_note_seen_at on every matching row.
export async function GET() {
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServiceSupabase();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data } = await supabase
      .from('sub_handoffs')
      .select(
        'id, sub_first_name, sub_note_text, sub_note_at, session_id',
      )
      .eq('coach_id', user.id)
      .not('sub_note_at', 'is', null)
      .is('sub_note_seen_at', null)
      .gte('sub_note_at', sevenDaysAgo)
      .order('sub_note_at', { ascending: false })
      .limit(10);

    const lines = (data ?? []).map((row) => {
      const r = row as {
        id: string;
        sub_first_name: string | null;
        sub_note_text: string | null;
        sub_note_at: string | null;
        session_id: string;
      };
      return {
        id: r.id,
        subFirstName: r.sub_first_name ?? 'Sub',
        truncatedText: truncateForHome(r.sub_note_text ?? '', 120),
        subNoteAt: r.sub_note_at,
        sessionId: r.session_id,
      };
    });

    return NextResponse.json({ lines });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sub-handoff recent-notes error:', message);
    return NextResponse.json({ lines: [] });
  }
}
