/**
 * POST /api/admin/sport-pulse-opt-out — ticket 0091.
 *
 * The /admin (director) surface mounts <SportPulseOptOutToggle />;
 * that toggle POSTs THIS route with `{ orgId, optedOut }`. The route:
 *   (a) validates the caller is the director on the org
 *       (LESSONS#0087 — `coaches.role === 'admin'`);
 *   (b) writes `organizations.opted_out_of_sport_pulse = <optedOut>`.
 *
 * Tier posture: NO tier gate. Every director can opt their program
 * out regardless of tier — privacy trumps growth. The opt-out is the
 * privacy floor that lets the sport-wide pulse exist at all
 * (without it the named-program signal would be a corporate signal,
 * not a director-controlled one).
 *
 * COPPA: every `.select()` uses an explicit allow-list. NEVER reads
 * `coaches.email`, `coaches.phone`, `players.*`. The route writes
 * one boolean column and returns the new state — no minor data is
 * read or written.
 *
 * LESSONS#0044 — auth + role gate load-bearing.
 * LESSONS#0072 — never mutate a DB-read row reference; the route
 *  builds a fresh `{ opted_out_of_sport_pulse: <bool> }` object.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively;
 * never embeds an AGENTS.md banned word verbatim.
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
  const orgIdParam = typeof body.orgId === 'string' ? body.orgId : '';
  const optedOutParam = typeof body.optedOut === 'boolean' ? body.optedOut : null;
  if (!orgIdParam || optedOutParam === null) {
    return NextResponse.json(
      { error: 'orgId and optedOut (boolean) are required' },
      { status: 400 },
    );
  }

  const admin = await createServiceSupabase();

  // ── (1) Resolve caller's coach row — id/org_id/role only.
  const { data: callerRow } = await admin
    .from('coaches')
    .select('id, org_id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!callerRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const callerOrgId = (callerRow as { org_id?: string | null }).org_id;
  const callerRole = (callerRow as { role?: string | null }).role;

  // Director gate (LESSONS#0087).
  if (callerRole !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Cross-org gate — the caller can only act on their own org.
  if (!callerOrgId || orgIdParam !== callerOrgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const orgId = callerOrgId;

  // ── (2) Write the new opt-out state. Per LESSONS#0072 — build a
  //    fresh values object; never mutate a DB-read row reference.
  await admin
    .from('organizations')
    .update({ opted_out_of_sport_pulse: optedOutParam })
    .eq('id', orgId);

  return NextResponse.json({
    success: true,
    orgId,
    optedOut: optedOutParam,
  });
}
