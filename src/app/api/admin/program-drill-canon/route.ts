/**
 * GET /api/admin/program-drill-canon — ticket 0090.
 *
 * The /admin (director) surface mounts <ProgramDrillCanonCard />; that
 * card calls THIS route to learn whether the program's drill canon is
 * eligible to surface AND what its top drills look like. Reads the
 * union of in-program coaches' thumbed-up drill signals (the existing
 * 0039 cross-team `coach_drill_signals` persistence — migration 040;
 * schema-wins-over-prose per LESSONS#0096 vs the ticket's
 * `drill_thumbs` shorthand) and hands them to the pure helper
 * `computeProgramDrillCanon`.
 *
 * Tier posture: server-gated on `tier === 'organization'` AND
 * `subscription_status IN ('active', 'past_due', 'trialing')`
 * (LESSONS#0044 — load-bearing). Free / Coach / Pro / canceled-Org
 * → `{ eligible: false, eligibilityReason: 'not_org_tier' }`.
 *
 * Director-role gate: `coaches.role === 'admin'` (LESSONS#0087). A
 * non-director caller in the same org → 403. A cross-org caller →
 * 403 (defense-in-depth: the route only acts on the caller's own
 * org).
 *
 * COPPA: every `.select()` uses an explicit allow-list. NEVER reads
 * `coaches.email`, `coaches.phone`, `coaches.full_name` surname (the
 * route splits first_name from full_name in-process), `players.*`,
 * `players.parent_email`, `players.dob`. The rendered payload carries
 * coach FIRST names only and structural drill metadata.
 *
 * Schema-wins-over-prose (LESSONS#0096):
 *   - `coach_drill_signals` is the real table (migration 040); the
 *     ticket prose refers to it as `drill_thumbs`.
 *   - The director-role check is `role === 'admin'`, not `is_admin`.
 *   - `team_coaches` resolves cross-team org membership (LESSONS#0057);
 *     we use `coaches.org_id` directly here because the per-org
 *     coach set is the simpler shape and the source of truth for
 *     "is this coach in this program."
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively;
 * never embeds an AGENTS.md banned word verbatim.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { computeProgramDrillCanon, type CoachThumbRow, type DrillRow } from '@/lib/program-drill-canon';

const PAID_GRACE_STATUSES = new Set(['active', 'past_due', 'trialing']);
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Strip surname via literal space (LESSONS#0061). */
function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  const idx = trimmed.indexOf(' ');
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

export async function GET(request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const orgIdParam = url.searchParams.get('orgId') ?? '';

  const admin = await createServiceSupabase();

  // ── (1) Resolve caller's coach row (id, org_id, role only —
  //    NEVER reads coaches.email/phone/full_name; LESSONS#0036).
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
  // Cross-org gate — the caller can only see their own org's canon.
  if (!callerOrgId || (orgIdParam && orgIdParam !== callerOrgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const orgId = callerOrgId;

  // ── (2) Read the org row for the tier + subscription_status gate.
  const { data: orgRow } = await admin
    .from('organizations')
    .select('id, name, tier, subscription_status')
    .eq('id', orgId)
    .maybeSingle();

  const tier = (orgRow as { tier?: string | null } | null)?.tier ?? 'free';
  const subStatus = (orgRow as { subscription_status?: string | null } | null)?.subscription_status ?? 'none';
  const orgName = (orgRow as { name?: string | null } | null)?.name ?? 'your program';

  // Tier + subscription_status gate (LESSONS#0044 — both load-bearing).
  if (tier !== 'organization' || !PAID_GRACE_STATUSES.has(subStatus)) {
    return NextResponse.json({
      eligible: false,
      eligibilityReason: 'not_org_tier',
    });
  }

  // ── (3) Read the org's coach roster (id, full_name, role only).
  const { data: coachRowsRaw } = await admin
    .from('coaches')
    .select('id, full_name, role')
    .eq('org_id', orgId);
  const coachRows = (coachRowsRaw ?? []) as Array<{
    id: string;
    full_name: string | null;
    role: string | null;
  }>;

  const inProgramCoachIds = coachRows.map((c) => c.id);
  const firstNameByCoachId = new Map<string, string>();
  for (const c of coachRows) {
    firstNameByCoachId.set(c.id, firstNameOf(c.full_name));
  }

  // ── (4) Read the union of `coach_drill_signals` for those coaches
  //    with rating='up'. Narrow allow-list: coach_id + drill_id only.
  let thumbRowsRaw: Array<{ coach_id: string; drill_id: string }> = [];
  if (inProgramCoachIds.length > 0) {
    const { data } = await admin
      .from('coach_drill_signals')
      .select('coach_id, drill_id')
      .in('coach_id', inProgramCoachIds)
      .eq('rating', 'up');
    thumbRowsRaw = (data ?? []) as Array<{ coach_id: string; drill_id: string }>;
  }

  // ── (5) Read drill metadata for the union of thumb drill_ids.
  const distinctDrillIds = [...new Set(thumbRowsRaw.map((r) => r.drill_id))];
  let drillRowsRaw: DrillRow[] = [];
  if (distinctDrillIds.length > 0) {
    const { data } = await admin
      .from('drills')
      .select('id, name, sport_id, age_groups')
      .in('id', distinctDrillIds);
    drillRowsRaw = (data ?? []) as DrillRow[];
  }

  // ── (6) Shape the helper inputs and aggregate.
  const coachThumbRows: CoachThumbRow[] = thumbRowsRaw.map((r) => ({
    coach_id: r.coach_id,
    coach_first_name: firstNameByCoachId.get(r.coach_id) ?? '',
    drill_id: r.drill_id,
  }));

  const canon = computeProgramDrillCanon({
    coachThumbRows,
    drillRows: drillRowsRaw,
  });

  // ── (7) Read the org's most-recent unsuperseded canon, if any.
  const { data: existingCanonRowsRaw } = await admin
    .from('program_drill_canon')
    .select('id, drill_ids, published_at, superseded_at, published_by_coach_id')
    .eq('org_id', orgId)
    .is('superseded_at', null)
    .order('published_at', { ascending: false })
    .limit(1);
  const existingCanonRows = (existingCanonRowsRaw ?? []) as Array<{
    id: string;
    drill_ids: string[];
    published_at: string;
    superseded_at: string | null;
    published_by_coach_id: string;
  }>;
  const existingCanon = existingCanonRows[0];
  let currentCanon: { drillIds: string[]; publishedAt: string; canonId: string } | undefined;
  if (existingCanon && existingCanon.published_at) {
    const publishedMs = Date.parse(existingCanon.published_at);
    if (Number.isFinite(publishedMs) && Date.now() - publishedMs <= NINETY_DAYS_MS) {
      currentCanon = {
        drillIds: Array.isArray(existingCanon.drill_ids) ? existingCanon.drill_ids : [],
        publishedAt: existingCanon.published_at,
        canonId: existingCanon.id,
      };
    }
  }

  // ── (8) If the canon is empty AND no published canon exists, surface
  //    the deterministic "not enough thumbs yet" state.
  if (canon.drills.length === 0 && !currentCanon) {
    return NextResponse.json({
      eligible: false,
      eligibilityReason: 'too_few_drills_meeting_threshold',
    });
  }

  return NextResponse.json({
    eligible: true,
    drills: canon.drills,
    totalCoachesInProgram: coachRows.length,
    orgName,
    ...(currentCanon ? { currentCanon } : {}),
  });
}
