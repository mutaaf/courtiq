/**
 * POST /api/coach/reactivation-signals/consume — ticket 0072.
 *
 * Stamps `consumed_at = NOW()` on a single reactivation signal after
 * verifying the signal belongs to the caller coach. The home-page
 * `<ReturningParentCard />` calls this from the "Got it" button so the
 * card hides and the signal does not re-render on a future home-page
 * load.
 *
 * Ownership posture: the route loads the row with allow-listed columns
 * (id + dormant_coach_id only), confirms `dormant_coach_id === user.id`,
 * and 403s on a foreign signal — never trusts the client to scope by
 * the user (LESSONS#0036 family). 404 on an unknown id.
 *
 * COPPA: this route NEVER reads the hashed parent email, the prior
 * player, the prior team. It's a one-column stamp scoped to the row id
 * the home-card already knows about.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const signalId = (body as { signalId?: unknown }).signalId;
  if (typeof signalId !== 'string' || !signalId) {
    return NextResponse.json({ error: 'signalId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  try {
    // 1) Load the row + the owner. Allow-list — never reads the hash.
    const { data: row } = await admin
      .from('coach_reactivation_signals')
      .select('id, dormant_coach_id')
      .eq('id', signalId)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }
    if ((row as { dormant_coach_id: string }).dormant_coach_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2) Stamp consumed_at. The partial index on (dormant_coach_id,
    //    fired_at DESC) WHERE consumed_at IS NULL drops this row out
    //    of the home-card lookup the moment the stamp lands.
    const { error } = await admin
      .from('coach_reactivation_signals')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', signalId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
