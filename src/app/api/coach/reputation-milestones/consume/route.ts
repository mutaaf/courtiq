/**
 * POST /api/coach/reputation-milestones/consume — ticket 0073.
 *
 * Stamps `notified_at = NOW()` on a single milestone after verifying
 * the milestone belongs to the caller coach. The home-page
 * `<CoachReputationMilestoneCard />` calls this from the "Got it"
 * button so the card hides and the next render surfaces the
 * next-most-recent unconsumed milestone (if any).
 *
 * Ownership posture: load the row with allow-listed columns (id +
 * published_coach_id only), confirm `published_coach_id === user.id`,
 * 403 on a foreign milestone — never trust the client to scope by
 * the user (LESSONS#0036 family). 404 on an unknown id.
 *
 * COPPA: this route NEVER reads cloning-coach info. It's a one-
 * column stamp scoped to the row id the home-card already knows
 * about.
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
  const milestoneId = (body as { milestoneId?: unknown }).milestoneId;
  if (typeof milestoneId !== 'string' || !milestoneId) {
    return NextResponse.json({ error: 'milestoneId required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  try {
    const { data: row } = await admin
      .from('coach_reputation_milestones')
      .select('id, published_coach_id')
      .eq('id', milestoneId)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }
    if ((row as { published_coach_id: string }).published_coach_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await admin
      .from('coach_reputation_milestones')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', milestoneId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
