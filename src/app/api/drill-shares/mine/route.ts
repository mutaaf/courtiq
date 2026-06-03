import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// GET /api/drill-shares/mine — list the caller's own published drill shares
// + per-share clone counts (ticket 0064).
//
// AUTH: self-enforces via auth.getUser(). The blanket /api/drill-shares/
// publicPaths entry does not bypass this guard.
//
// Returns BOTH active and inactive shares — the publisher needs to see
// their unpublished drills in the same list so they can re-activate or
// edit the caption (the publish sheet's idempotent re-publish flow).
//
// SHAPE: { shares: Array<{ token, drillId, drillName, caption,
// publishedAt, isActive, cloneCount }> }.
//
// COPPA: the route reads only drill_shares + drills (name) + clone-row
// counts. No player, parent, session, or team is referenced. The clone
// count is a bare integer per share — never the cloner's identity. The
// existing public /coach/<handle> profile (0026) is BYTE-IDENTICAL — this
// list lives only on the AUTHED coach-profile dashboard surface.
//
// LESSONS#0055 — the handler takes no body and no params, so it declares
// zero parameters (running tsc --noEmit catches any stray `Request` arg
// the test might pass).
export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServiceSupabase();

  try {
    // 1) Caller's shares, most-recent first.
    const { data: sharesRaw } = await supabase
      .from('drill_shares')
      .select('id, coach_id, drill_id, share_token, caption, is_active, created_at')
      .eq('coach_id', user.id)
      .order('created_at', { ascending: false });

    const shares = (sharesRaw ?? []) as Array<{
      id: string;
      coach_id: string;
      drill_id: string;
      share_token: string;
      caption: string | null;
      is_active: boolean;
      created_at: string;
    }>;

    if (shares.length === 0) {
      return NextResponse.json({ shares: [] });
    }

    const drillIds = Array.from(new Set(shares.map((s) => s.drill_id)));
    const shareIds = Array.from(new Set(shares.map((s) => s.id)));

    // 2) Resolve drill names with an EXPLICIT allow-list (LESSONS#0036).
    const { data: drillsRaw } = await supabase
      .from('drills')
      .select('id, name')
      .in('id', drillIds);
    const drillNameById = new Map<string, string>();
    for (const d of (drillsRaw ?? []) as Array<{ id: string; name: string }>) {
      drillNameById.set(d.id, d.name);
    }

    // 3) Roll up clone counts per share id.
    const { data: cloneRowsRaw } = await supabase
      .from('drill_share_clones')
      .select('drill_share_id')
      .in('drill_share_id', shareIds);
    const cloneCountByShareId = new Map<string, number>();
    for (const row of (cloneRowsRaw ?? []) as Array<{ drill_share_id: string }>) {
      const cur = cloneCountByShareId.get(row.drill_share_id) ?? 0;
      cloneCountByShareId.set(row.drill_share_id, cur + 1);
    }

    const out = shares.map((s) => ({
      token: s.share_token,
      drillId: s.drill_id,
      drillName: drillNameById.get(s.drill_id) ?? 'Drill',
      caption: s.caption,
      publishedAt: s.created_at,
      isActive: s.is_active,
      cloneCount: cloneCountByShareId.get(s.id) ?? 0,
    }));

    return NextResponse.json({ shares: out });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Drill share mine error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
