/**
 * GET /api/plans/program-canon-inherited — ticket 0090.
 *
 * The /plans page mounts <ProgramCanonInheritedBanner />. This route
 * returns the banner's eligibility payload.
 *
 * Eligibility: the calling coach
 *   (a) was created in the last 14 days (proxy for "newly joined the
 *       program" — the 14-day window aligns with the AC);
 *   (b) belongs to an org currently on `tier === 'organization'`
 *       AND `subscription_status IN ('active','past_due','trialing')`
 *       (LESSONS#0044);
 *   (c) that org has an unsuperseded `program_drill_canon`;
 *   (d) the coach has NOT dismissed `kind: 'program_canon_inherited'`
 *       in `coach_first_signal_celebrations` (the 0088 dedup primitive,
 *       widened by migration 075).
 *
 * COPPA: narrow `.select()` allow-lists; no player / parent / email /
 * phone field is touched.
 *
 * Voice posture (LESSONS#0023): instructs positively; no banned token.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const PAID_GRACE_STATUSES = new Set(['active', 'past_due', 'trialing']);
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ inherited: false });
  }

  const admin = await createServiceSupabase();

  try {
    const { data: coachRow } = await admin
      .from('coaches')
      .select('id, org_id, created_at')
      .eq('id', user.id)
      .maybeSingle();
    if (!coachRow) return NextResponse.json({ inherited: false });
    const orgId = (coachRow as { org_id?: string | null }).org_id;
    const createdAtRaw = (coachRow as { created_at?: string | null }).created_at;
    if (!orgId || !createdAtRaw) return NextResponse.json({ inherited: false });

    const createdMs = Date.parse(createdAtRaw);
    if (!Number.isFinite(createdMs)) return NextResponse.json({ inherited: false });
    if (Date.now() - createdMs > FOURTEEN_DAYS_MS) {
      return NextResponse.json({ inherited: false });
    }

    const { data: orgRow } = await admin
      .from('organizations')
      .select('id, name, tier, subscription_status')
      .eq('id', orgId)
      .maybeSingle();
    const tier = (orgRow as { tier?: string | null } | null)?.tier ?? 'free';
    const subStatus = (orgRow as { subscription_status?: string | null } | null)?.subscription_status ?? 'none';
    const orgName = (orgRow as { name?: string | null } | null)?.name ?? 'your program';
    if (tier !== 'organization' || !PAID_GRACE_STATUSES.has(subStatus)) {
      return NextResponse.json({ inherited: false });
    }

    const { data: canonRowsRaw } = await admin
      .from('program_drill_canon')
      .select('id, drill_ids, published_at')
      .eq('org_id', orgId)
      .is('superseded_at', null)
      .order('published_at', { ascending: false })
      .limit(1);
    const canonRows = (canonRowsRaw ?? []) as Array<{
      id: string;
      drill_ids: string[];
      published_at: string;
    }>;
    const activeCanon = canonRows[0];
    if (!activeCanon || !Array.isArray(activeCanon.drill_ids) || activeCanon.drill_ids.length === 0) {
      return NextResponse.json({ inherited: false });
    }

    // Dedup: a coach who tapped "Got it" has a celebration row with
    // dismissed_at set.
    const { data: dedupRowsRaw } = await admin
      .from('coach_first_signal_celebrations')
      .select('kind, dismissed_at')
      .eq('coach_id', user.id)
      .eq('kind', 'program_canon_inherited');
    const dedupRows = (dedupRowsRaw ?? []) as Array<{ kind: string; dismissed_at: string | null }>;
    if (dedupRows.some((r) => r.dismissed_at !== null)) {
      return NextResponse.json({ inherited: false });
    }

    return NextResponse.json({
      inherited: true,
      drillCount: activeCanon.drill_ids.length,
      programName: orgName,
    });
  } catch {
    return NextResponse.json({ inherited: false });
  }
}
