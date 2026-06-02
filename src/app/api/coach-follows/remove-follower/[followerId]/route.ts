import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// DELETE /api/coach-follows/remove-follower/[followerId] — the publisher
// dissolves a follow edge FROM THE PUBLISHER'S SIDE (ticket 0063). The DB
// row is the same row the follower's own DELETE deletes; this endpoint just
// inverts the perspective server-side so the publisher's Unfollow-me UI on
// /coach-profile/followers does not need a new URL shape.
//
// Idempotent: no row → 200 with { wasRemoved: false }; with a row → 200 +
// row deleted + { wasRemoved: true }.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ followerId: string }> },
) {
  const { followerId } = await params;

  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!followerId) {
    return NextResponse.json({ error: 'followerId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  try {
    // Look up the row by (follower=URL param, followee=auth.user.id).
    const { data: existing } = await admin
      .from('coach_follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('followee_id', user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ ok: true, wasRemoved: false });
    }

    const { error } = await admin
      .from('coach_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('followee_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, wasRemoved: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('coach-follows remove-follower error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
