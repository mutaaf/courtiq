import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// GET /api/practice-plan-shares/clone-count — for the authed caller, returns
// the count of clones of THEIR published practice plans in the last 7 days,
// plus a per-plan breakdown. The cloning coach's identity is NEVER returned;
// the publisher sees only the aggregate count, by-plan title, to keep the
// loop coach-private (ticket 0049 decision).
//
// Response shape:
//   { count: number, byPlan: { plan_id, plan_title, count }[], lastSeenCount }
//
// The home card renders only when count > lastSeenCount; the seen route below
// advances the bookmark on first render so the card auto-dismisses on view.
export async function GET(_request: Request) {
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  try {
    // 1) The caller's PUBLISHED practice plans (the ones whose clones we count).
    // We read all of the caller's practice plans here, not just the shared
    // ones, because a clone's source_plan_id points at the SOURCE plan id —
    // whether that source has an active share token or not.
    const { data: ownPlansRaw } = await admin
      .from('plans')
      .select('id, title')
      .eq('coach_id', user.id)
      .eq('type', 'practice');

    const ownPlans = (ownPlansRaw ?? []) as Array<{ id: string; title: string | null }>;

    if (ownPlans.length === 0) {
      const { data: coach } = await admin
        .from('coaches')
        .select('preferences')
        .eq('id', user.id)
        .single();
      const prefs = ((coach?.preferences as Record<string, unknown>) ?? {});
      return NextResponse.json({
        count: 0,
        byPlan: [],
        lastSeenCount: Number(prefs.last_seen_clone_count ?? 0),
      });
    }

    const ownIds = ownPlans.map((p) => p.id);
    const titleById = new Map<string, string>(
      ownPlans.map((p) => [p.id, p.title ?? '']),
    );

    // 2) Recent clones whose source is one of the caller's plans. We never
    //    read the cloning coach_id off these rows — the count is aggregate.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: clonesRaw } = await admin
      .from('plans')
      .select('source_plan_id')
      .in('source_plan_id', ownIds)
      .gte('created_at', sevenDaysAgo);

    const clones = (clonesRaw ?? []) as Array<{ source_plan_id: string | null }>;

    const byPlanMap = new Map<string, number>();
    for (const row of clones) {
      const sid = row.source_plan_id;
      if (!sid) continue;
      byPlanMap.set(sid, (byPlanMap.get(sid) ?? 0) + 1);
    }

    const byPlan = Array.from(byPlanMap.entries())
      .map(([planId, count]) => ({
        plan_id: planId,
        plan_title: titleById.get(planId) ?? '',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const total = byPlan.reduce((sum, r) => sum + r.count, 0);

    // 3) The publisher's auto-dismiss bookmark.
    const { data: coach } = await admin
      .from('coaches')
      .select('preferences')
      .eq('id', user.id)
      .single();
    const prefs = ((coach?.preferences as Record<string, unknown>) ?? {});
    const lastSeenCount = Number(prefs.last_seen_clone_count ?? 0);

    return NextResponse.json({ count: total, byPlan, lastSeenCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Practice plan clone-count error:', message);
    // Fail soft — a transient DB error on the count card should never block /home.
    return NextResponse.json({ count: 0, byPlan: [], lastSeenCount: 0 });
  }
}
