import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// POST /api/coach-follows — the cloning coach taps "Follow Coach <Name>" on
// the public plan page (or the league-feed card) and the client POSTs
// { followee_id } here. Writes one row to `coach_follows` with the caller as
// the follower. Idempotent: a duplicate POST catches the UNIQUE-violation
// (postgres code 23505) and resolves to { alreadyFollowing: true }.
//
// Rate-limit: at most 30 follows per coach per rolling 7 days, enforced by a
// count of existing rows for the caller; 429 on the 31st. The limit exists to
// keep a runaway-script from polluting the follow graph; the human path
// (clone → follow) lands well below it.
//
// Tier posture: NEITHER following nor being-followed is tier-gated (ticket
// 0063 AC). The route DOES NOT import `src/lib/tier.ts` — the follow
// primitive is universal across tiers so the graph remains open (same posture
// as 0049 publish + clone).
//
// COPPA: the table is COACH-TO-COACH only; no player, parent, or minor
// reference (migration 058). The response is { ok, alreadyFollowing,
// followeeId } — never the follower's full name, email, or any other
// contact field.
export async function POST(request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const followeeId = (body as { followee_id?: unknown }).followee_id;
  if (typeof followeeId !== 'string' || !followeeId) {
    return NextResponse.json({ error: 'followee_id required' }, { status: 400 });
  }
  if (followeeId === user.id) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  try {
    // 1) Rate-limit: count rolling-7-day follows for the caller. 429 on >= 30.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = (await admin
      .from('coach_follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', user.id)
      .gte('created_at', sevenDaysAgo)) as { count: number | null };
    if ((count ?? 0) >= 30) {
      return NextResponse.json(
        { error: 'Follow rate limit reached (30 per 7 days)' },
        { status: 429 },
      );
    }

    // 2) Insert the row. A duplicate hits the UNIQUE(follower_id, followee_id)
    //    constraint and returns postgres error code 23505 — the route catches
    //    it and resolves to alreadyFollowing.
    const { error: insertError } = await admin
      .from('coach_follows')
      .insert({ follower_id: user.id, followee_id: followeeId });

    if (insertError) {
      const code = (insertError as { code?: string }).code;
      if (code === '23505') {
        return NextResponse.json({ ok: true, alreadyFollowing: true, followeeId });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, alreadyFollowing: false, followeeId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('coach-follows POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
