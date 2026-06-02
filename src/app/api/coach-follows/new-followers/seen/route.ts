import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// POST /api/coach-follows/new-followers/seen — advance the publisher's
// `coaches.preferences.last_seen_follow_count` bookmark to `now().toISOString()`
// so the <NewFollowersCard /> on /home auto-dismisses on first view (ticket
// 0063). Mirrors 0049's clone-count seen-bookmark pattern — the bookmark
// rides on the existing jsonb `preferences` column so no new `coaches`
// column is needed.
export async function POST(_request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  try {
    // Merge the new bookmark into preferences without clobbering other keys.
    const { data: coach } = await admin
      .from('coaches')
      .select('preferences')
      .eq('id', user.id)
      .single();
    const prefs = ((coach as { preferences?: Record<string, unknown> } | null)?.preferences ??
      {}) as Record<string, unknown>;
    const nextPrefs = { ...prefs, last_seen_follow_count: new Date().toISOString() };

    const { error } = await admin
      .from('coaches')
      .update({ preferences: nextPrefs })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, lastSeenFollowCount: nextPrefs.last_seen_follow_count });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('coach-follows new-followers seen error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
