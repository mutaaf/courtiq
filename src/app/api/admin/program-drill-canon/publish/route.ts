/**
 * POST /api/admin/program-drill-canon/publish — ticket 0090.
 *
 * The director taps "Publish as <Org name> drill canon" on the
 * admin card; that button POSTs THIS route with the eligible
 * drillIds. The route:
 *   (a) validates the caller is a director on the same org
 *       (LESSONS#0087 — `coaches.role === 'admin'`);
 *   (b) FAILS-CLOSED if the org is not on
 *       `tier === 'organization'` AND `subscription_status IN
 *       ('active','past_due','trialing')` (LESSONS#0044 —
 *       subscription status is load-bearing);
 *   (c) validates every drillId resolves to a drill the org's
 *       coaches have thumbed in `coach_drill_signals` with
 *       `rating='up'` (defense against publishing a drill no one
 *       in the program ran);
 *   (d) sets `superseded_at = NOW()` on any prior unsuperseded
 *       canon for the same org (one active at a time);
 *   (e) writes a NEW `program_drill_canon` row carrying the
 *       publishing director's coach_id + the drill_ids + the
 *       publish timestamp.
 *
 * COPPA: every `.select()` uses an explicit allow-list. NEVER reads
 * coaches.email / phone / surname / players.*.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively;
 * never embeds an AGENTS.md banned word verbatim.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const PAID_GRACE_STATUSES = new Set(['active', 'past_due', 'trialing']);

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
  const drillIdsParam = Array.isArray(body.drillIds) ? body.drillIds : null;
  if (!orgIdParam || !drillIdsParam || drillIdsParam.length === 0) {
    return NextResponse.json({ error: 'orgId and a non-empty drillIds array are required' }, { status: 400 });
  }
  const requestedDrillIds = drillIdsParam.filter((d): d is string => typeof d === 'string');
  if (requestedDrillIds.length === 0) {
    return NextResponse.json({ error: 'drillIds must contain strings' }, { status: 400 });
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
  if (callerRole !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!callerOrgId || orgIdParam !== callerOrgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const orgId = callerOrgId;

  // ── (2) Tier + subscription_status gate (LESSONS#0044).
  const { data: orgRow } = await admin
    .from('organizations')
    .select('id, tier, subscription_status')
    .eq('id', orgId)
    .maybeSingle();
  const tier = (orgRow as { tier?: string | null } | null)?.tier ?? 'free';
  const subStatus = (orgRow as { subscription_status?: string | null } | null)?.subscription_status ?? 'none';
  if (tier !== 'organization' || !PAID_GRACE_STATUSES.has(subStatus)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── (3) Validate every requested drillId is in the eligible set —
  //    i.e. AT LEAST ONE in-program coach has thumbed it up. This is
  //    the defensive check the AC names: a director cannot publish a
  //    drill no one in the program ran.
  const { data: orgCoachesRaw } = await admin
    .from('coaches')
    .select('id')
    .eq('org_id', orgId);
  const orgCoachIds = ((orgCoachesRaw ?? []) as Array<{ id: string }>).map((c) => c.id);

  let eligibleDrillIds = new Set<string>();
  if (orgCoachIds.length > 0) {
    const { data: signalRowsRaw } = await admin
      .from('coach_drill_signals')
      .select('coach_id, drill_id')
      .in('coach_id', orgCoachIds)
      .eq('rating', 'up');
    const signalRows = (signalRowsRaw ?? []) as Array<{ coach_id: string; drill_id: string }>;
    eligibleDrillIds = new Set(signalRows.map((r) => r.drill_id));
  }
  for (const requested of requestedDrillIds) {
    if (!eligibleDrillIds.has(requested)) {
      return NextResponse.json(
        { error: `drillId '${requested}' is not in the eligible canon set` },
        { status: 400 },
      );
    }
  }

  // ── (4) Supersede any prior unsuperseded canon for this org.
  const nowIso = new Date().toISOString();
  await admin
    .from('program_drill_canon')
    .update({ superseded_at: nowIso })
    .eq('org_id', orgId)
    .is('superseded_at', null);

  // ── (5) Insert the new canon row. The director's coach_id is the
  //    publisher; the drill_ids ride on the JSONB array column.
  const { data: insertedRaw } = await admin
    .from('program_drill_canon')
    .insert({
      org_id: orgId,
      published_by_coach_id: user.id,
      drill_ids: requestedDrillIds,
      published_at: nowIso,
      superseded_at: null,
    })
    .select('id')
    .single();
  const canonId = (insertedRaw as { id?: string } | null)?.id ?? null;

  return NextResponse.json({
    success: true,
    canonId,
    drillIds: requestedDrillIds,
    publishedAt: nowIso,
  });
}
