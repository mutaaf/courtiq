import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// POST /api/drill-shares/[token]/unpublish — flip is_active=false on the
// caller's drill_shares row at this token (ticket 0064).
//
// AUTH: self-enforces via auth.getUser() — the route is NOT a public
// surface. The blanket /api/drill-shares/ publicPaths entry does not
// bypass this guard (same posture as 0049's /create / /clone routes).
//
// IDEMPOTENCY: hitting the route twice (or hitting it for a row that
// doesn't exist on the caller's set) returns 200 with
// { wasPublished: false } so the UI can silently no-op. The public page
// at /drill/<token> reads the row WITHOUT the is_active filter so it can
// return 410 — never 404 — for an unpublished token.
//
// Scoping: the route filters by share_token AND coach_id, so a cross-coach
// caller's "unpublish my peer's drill" attempt resolves to no-row → the
// idempotent wasPublished:false path. No 403 is returned (silence beats
// a confirmation that someone else owns the token).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // Look up the share row owned by the caller. The (share_token, coach_id)
    // pair is enough — share_token is UNIQUE so the maybeSingle is exact.
    const { data: existing } = await supabase
      .from('drill_shares')
      .select('id, coach_id, share_token, is_active')
      .eq('share_token', token)
      .eq('coach_id', user.id)
      .maybeSingle();

    if (!existing) {
      // No row at this token under the caller — silently no-op.
      return NextResponse.json({ wasPublished: false });
    }

    if (!existing.is_active) {
      // Already unpublished — idempotent no-op.
      return NextResponse.json({ wasPublished: false });
    }

    // Flip is_active off, stamp updated_at.
    await supabase
      .from('drill_shares')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    return NextResponse.json({ wasPublished: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Drill share unpublish error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
