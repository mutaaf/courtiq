import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// POST /api/practice-plan-shares/clone-count/seen — advance the publisher's
// `coaches.preferences.last_seen_clone_count` bookmark to their CURRENT
// 7-day clone count (ticket 0049 — auto-dismiss on view, mirrors 0047 but
// stores in jsonb so no new `coaches` column is needed). Idempotent.
//
// The bookmark is consulted by /api/practice-plan-shares/clone-count + the
// PlanClonesCard component; once it matches the live count, the card stops
// rendering until a fresh clone arrives.
export async function POST(_request: Request) {
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  try {
    // 1) The caller's published practice plans (same shape as clone-count).
    const { data: ownPlansRaw } = await admin
      .from('plans')
      .select('id')
      .eq('coach_id', user.id)
      .eq('type', 'practice');

    const ownPlans = (ownPlansRaw ?? []) as Array<{ id: string }>;
    let total = 0;

    if (ownPlans.length > 0) {
      // 2) Clones in the last 7 days where source is one of the caller's plans.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: clonesRaw } = await admin
        .from('plans')
        .select('source_plan_id')
        .in('source_plan_id', ownPlans.map((p) => p.id))
        .gte('created_at', sevenDaysAgo);
      total = (clonesRaw ?? []).length;
    }

    // 3) Merge the new bookmark into preferences without clobbering other keys.
    const { data: coach } = await admin
      .from('coaches')
      .select('preferences')
      .eq('id', user.id)
      .single();
    const prefs = ((coach?.preferences as Record<string, unknown>) ?? {});
    const nextPrefs = { ...prefs, last_seen_clone_count: total };

    const { error } = await admin
      .from('coaches')
      .update({ preferences: nextPrefs })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, lastSeenCount: total });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Practice plan clone-count seen error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
