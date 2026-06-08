/**
 * POST /api/coach/referral-credit-status/consume — ticket 0074.
 *
 * Stamps `notified_at = NOW()` on the caller coach's most-recent
 * unconsumed referral_credit_grants row so the home-card hides. The
 * row is scoped to the caller (`inviter_coach_id = user.id`); only
 * the inviter's own row is stamped.
 *
 * Ownership posture: the route reads the latest unconsumed row by
 * inviter_coach_id and stamps its notified_at; a missing row returns
 * `ok: true` (no-op) so the home-card's optimistic POST never errors
 * when the inviter has no row.
 *
 * COPPA: this route NEVER reads referred-coach info. It's a one-
 * column stamp scoped to the inviter's own row.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(_request: Request) {
  void _request;
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();

  try {
    // Read the latest unconsumed row for the caller.
    const { data: row } = await admin
      .from('referral_credit_grants')
      .select('id')
      .eq('inviter_coach_id', user.id)
      .is('notified_at', null)
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ ok: true });
    }

    const { error } = await admin
      .from('referral_credit_grants')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', (row as { id: string }).id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
