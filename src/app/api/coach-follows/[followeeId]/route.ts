import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// DELETE /api/coach-follows/[followeeId] — dissolve the caller's follow edge
// to the named followee (ticket 0063). Idempotent: no row → 200 with
// { wasFollowing: false }; with a row → 200 + the row gone +
// { wasFollowing: true }. The followee-side Unfollow-me control on
// /coach-profile/followers also routes through this endpoint, since both
// parties can dissolve the edge from their own side.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ followeeId: string }> },
) {
  const { followeeId } = await params;

  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!followeeId) {
    return NextResponse.json({ error: 'followeeId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  try {
    // 1) Look up whether the row exists — keeps the response semantic (the
    //    caller learns whether anything was actually undone).
    const { data: existing } = await admin
      .from('coach_follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('followee_id', followeeId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ ok: true, wasFollowing: false });
    }

    // 2) Delete the row. The route ignores any returned error from delete()
    //    that is a no-row-affected case (already handled by the lookup above).
    const { error } = await admin
      .from('coach_follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('followee_id', followeeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, wasFollowing: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('coach-follows DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
