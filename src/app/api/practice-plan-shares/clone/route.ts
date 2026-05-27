import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// POST /api/practice-plan-shares/clone — save a published practice plan to the
// caller's own team (ticket 0049). Inserts a fresh `plans` row with
//   coach_id          = caller
//   team_id           = $teamId   (verified to belong to the caller's org)
//   type              = 'practice'
//   content_structured = source plan's content_structured (byte-for-byte copy)
//   source_plan_id    = source plan's id (server-derived from the token —
//                       a client-supplied source_plan_id is IGNORED, the same
//                       posture as LESSONS#0039)
//
// The clone is a fresh draft — the source plan is unchanged. Free for every
// tier (per ticket: gating cloning inverts the network effect).
//
// Auth: caller must be signed in (401 otherwise). The target team must be in
// the caller's org (404 otherwise). The token must resolve to an active share
// (404 otherwise). The underlying plan must be type='practice' (404 otherwise
// — defensive even though only practice plans can be published).
export async function POST(request: Request) {
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { token, teamId } = body as {
    token?: string;
    teamId?: string;
    // The route IGNORES any client-supplied source_plan_id — that field is
    // server-derived from the token's resolved plan_id. LESSONS#0039.
    source_plan_id?: unknown;
    sourcePlanId?: unknown;
  };

  if (!token || !teamId) {
    return NextResponse.json({ error: 'token and teamId required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // 1) Resolve the active share token.
    const { data: share } = await supabase
      .from('practice_plan_shares')
      .select('id, plan_id, coach_id, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (!share) {
      return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 });
    }

    // 2) Resolve the underlying practice plan. The .eq('type','practice') is
    // a defensive guard — only practice plans can be published, but the clone
    // path stays strict so a future plan type can never silently ride this
    // route into a different surface.
    const { data: sourcePlan } = await supabase
      .from('plans')
      .select('id, team_id, coach_id, type, title, content_structured')
      .eq('id', share.plan_id)
      .eq('type', 'practice')
      .single();

    if (!sourcePlan) {
      return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 });
    }

    // 3) Verify the target team belongs to the caller's org. The caller's
    // org_id comes from THEIR coaches row (never trust the request).
    const { data: callerCoach } = await supabase
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!callerCoach?.org_id) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 });
    }

    const { data: targetTeam } = await supabase
      .from('teams')
      .select('id, org_id')
      .eq('id', teamId)
      .single();

    if (!targetTeam || targetTeam.org_id !== callerCoach.org_id) {
      return NextResponse.json({ error: 'Team not found for this coach' }, { status: 404 });
    }

    // 4) Insert the cloned plan. The clone is a FRESH draft on the cloner's
    // team; source_plan_id stamps attribution back to the original. Any
    // client-supplied source_plan_id in `body` was never bound — the route
    // recomputes it here from the token-resolved sourcePlan.id.
    const { data: inserted, error } = await supabase
      .from('plans')
      .insert({
        team_id: teamId,
        coach_id: user.id,
        type: 'practice',
        title: sourcePlan.title ?? null,
        content: '',
        content_structured: sourcePlan.content_structured ?? {},
        source_plan_id: sourcePlan.id,
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ planId: inserted?.id ?? null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Practice plan share clone error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
