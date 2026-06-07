import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { addFavorite, parseFavoritedDrills } from '@/lib/drill-favorites-utils';
import { fireMilestonesForPublishedCoach } from '@/lib/coach-reputation-milestone-hook';

// POST /api/drill-shares/[token]/clone — save a published drill into the
// caller's favorites library (ticket 0064).
//
// AUTH: self-enforces via auth.getUser() — the route is NOT a public
// surface. The clone path is ONLY "ADD to favorites" — it never removes
// (so a coach who already favorited the drill stays favorited).
//
// WRITES (two):
//   1) UPDATE coaches.preferences.favorited_drills to include the drill_id
//      (via the existing addFavorite helper from drill-favorites-utils.ts,
//      LESSONS#0096 — reuse the helper, don't reinvent its semantics).
//   2) INSERT one drill_share_clones row so the publisher's clone-count
//      rollup includes this cloner. UNIQUE(drill_share_id, cloner_coach_id)
//      makes the insert idempotent — a second clone is a no-op.
//
// SELF-CLONE: if the caller IS the publisher (previewing their own share),
// the route returns 200 { reason: 'self' } without touching either write —
// silence beats an error on the share-with-yourself preview flow.
//
// IDEMPOTENCY: a second clone by the same coach is a silent no-op —
// returns { alreadyFavorited: true } and does NOT insert a second
// drill_share_clones row. The UNIQUE constraint is the structural
// backstop; the route's "check existing clone row first" posture is the
// fast-path that avoids the constraint-violation insert.
//
// FREE for every tier — cloning is universal so the graph remains open
// (same posture as 0049 / 0055 / 0063). The route does NOT import
// tier.ts.
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
    // 1) Resolve the share row. Read WITHOUT the is_active filter so we
    // can return 410 (gone) on unpublished tokens — never 404 — exactly
    // like the public GET route does.
    const { data: share } = await supabase
      .from('drill_shares')
      .select('id, coach_id, drill_id, is_active')
      .eq('share_token', token)
      .maybeSingle();

    if (!share) {
      return NextResponse.json({ error: 'Drill share not found' }, { status: 404 });
    }
    if (!share.is_active) {
      return NextResponse.json(
        { error: 'This drill share was unpublished' },
        { status: 410 },
      );
    }

    // 2) Self-clone short-circuit. The publisher previewing their own
    // share lands here; silence beats an error.
    if (share.coach_id === user.id) {
      return NextResponse.json({
        drillId: share.drill_id,
        reason: 'self',
        alreadyFavorited: false,
      });
    }

    // 3) Read the caller's existing favorites preferences.
    const { data: cloner } = await supabase
      .from('coaches')
      .select('id, preferences')
      .eq('id', user.id)
      .single();

    const currentPrefs = (cloner?.preferences as Record<string, unknown>) ?? {};
    const currentFavorites = parseFavoritedDrills(currentPrefs);
    const alreadyFavorited = currentFavorites.includes(share.drill_id);

    if (alreadyFavorited) {
      // The drill is already in the caller's favorites — short-circuit
      // BOTH writes. The drill_share_clones row may already exist (a
      // previous clone) but might not (the favorite predates the share),
      // so this branch deliberately does NOT touch drill_share_clones.
      return NextResponse.json({
        drillId: share.drill_id,
        alreadyFavorited: true,
      });
    }

    // 4) ADD to favorites (only-add semantics — never remove, per AC).
    // The existing addFavorite helper returns the original array unchanged
    // if the drill is already favorited; we've already early-returned on
    // that path above so we're safe to write.
    const updatedFavorites = addFavorite(share.drill_id, currentFavorites);
    await supabase
      .from('coaches')
      .update({
        preferences: { ...currentPrefs, favorited_drills: updatedFavorites },
      })
      .eq('id', user.id);

    // 5) Insert the clone row (best-effort idempotent — the UNIQUE
    // constraint catches a race where two clones land at the same instant).
    await supabase
      .from('drill_share_clones')
      .insert({
        drill_share_id: share.id,
        cloner_coach_id: user.id,
      });

    // Ticket 0073 — best-effort milestone hook. Fires the
    // publishing coach's reputation milestones if the just-landed
    // drill clone pushed their counts over a threshold.
    // LESSONS#0036 — errors are caught inside the helper.
    await fireMilestonesForPublishedCoach(supabase, share.coach_id);

    return NextResponse.json({
      drillId: share.drill_id,
      alreadyFavorited: false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Drill share clone error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
