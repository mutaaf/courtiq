import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// GET /api/coach-follows/new-followers — the publisher-side notification
// source (ticket 0063). Returns the last 7 days of `coach_follows` rows where
// followee_id = auth.user.id AND created_at > coaches.preferences.
// last_seen_follow_count bookmark, mirroring 0049's clone-count seen-
// bookmark pattern (the bookmark rides on the existing jsonb `preferences`
// column — NO new `coaches` column needed).
//
// Response shape:
//   {
//     lines: Array<{ followerFirstName: string }>,   // capped at 5
//     extraCount: number,                            // remainder
//     total: number,                                 // distinct followers
//   }
//
// Privacy: the response carries ONLY the follower's FIRST name (parsed
// server-side via `full_name.split(' ')[0]`). The publisher never sees the
// follower's last name, email, or any other contact field. The dedup posture
// is "one line per follower per render": if the same follower contributes
// more than one row (e.g. unfollow + re-follow), they still appear once.
export async function GET(_request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  try {
    // 1) Resolve the caller's bookmark.
    const { data: coach } = await admin
      .from('coaches')
      .select('preferences')
      .eq('id', user.id)
      .single();
    const prefs = ((coach as { preferences?: Record<string, unknown> } | null)?.preferences ??
      {}) as Record<string, unknown>;
    const bookmarkRaw = prefs.last_seen_follow_count;
    const bookmark = typeof bookmarkRaw === 'string' ? bookmarkRaw : null;

    // 2) The effective lower bound: max(bookmark, now - 7 days). A follower
    //    who landed > 7 days ago is OUT of the rolling window regardless of
    //    whether the publisher has acked them or not — silence beats a stale
    //    notification.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const lowerBound = bookmark && bookmark > sevenDaysAgo ? bookmark : sevenDaysAgo;

    // 3) Read the new follows. The route never reads beyond `follower_id` +
    //    `created_at` here — the follower's identity comes from the coaches
    //    join in step 4.
    const { data: followsRaw } = await admin
      .from('coach_follows')
      .select('follower_id, created_at')
      .eq('followee_id', user.id)
      .gte('created_at', lowerBound)
      .order('created_at', { ascending: false });
    const follows = (followsRaw ?? []) as Array<{ follower_id: string; created_at: string }>;

    if (follows.length === 0) {
      return NextResponse.json({ lines: [], extraCount: 0, total: 0 });
    }

    // 4) Dedup follower_ids preserving most-recent-first order.
    const seen = new Set<string>();
    const orderedFollowerIds: string[] = [];
    for (const row of follows) {
      if (seen.has(row.follower_id)) continue;
      seen.add(row.follower_id);
      orderedFollowerIds.push(row.follower_id);
    }

    // 5) Resolve first names — COPPA-safe `.select()` allow-list (id +
    //    full_name only; no email, phone, parent contact, or any other
    //    field).
    const { data: coachesRaw } = await admin
      .from('coaches')
      .select('id, full_name')
      .in('id', orderedFollowerIds);
    const fullNameById = new Map<string, string>();
    for (const c of (coachesRaw ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (c.id) fullNameById.set(c.id, c.full_name ?? '');
    }

    const allLines = orderedFollowerIds.map((id) => {
      const fullName = fullNameById.get(id) ?? '';
      const firstName = String(fullName).split(' ')[0] || 'Coach';
      return { followerFirstName: firstName };
    });
    const lines = allLines.slice(0, 5);
    const extraCount = Math.max(0, allLines.length - 5);

    return NextResponse.json({ lines, extraCount, total: allLines.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('coach-follows new-followers error:', message);
    // Fail soft — a transient DB error should never block /home.
    return NextResponse.json({ lines: [], extraCount: 0, total: 0 });
  }
}
