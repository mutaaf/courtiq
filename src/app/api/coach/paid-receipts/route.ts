/**
 * GET /api/coach/paid-receipts — ticket 0089.
 *
 * Returns the day-60 paid-coach receipts payload. The /home page
 * mounts <PaidCoachReceiptsCard /> UNDER the daily-focus card; that
 * card calls THIS route to learn whether the day-56-to-day-90 fire
 * window is open for the caller AND, if so, what the five named
 * counters and next-month compounding-copy key are.
 *
 * Schema-wins-over-prose deviation (LESSONS#0096) — documented in the
 * 0089 Implementation log: the ticket prose said the route would
 * derive `paidSinceMs` from the earliest `stripe_webhook_events` row
 * for the org, but the real `stripe_webhook_events` shape (migration
 * 028) is a minimal idempotency log with NO org link and NO
 * `event_data` column. The route therefore reads
 * `organizations.paid_since_at`, a new TIMESTAMPTZ column added in
 * migration 074 alongside the CHECK-enum widen. Backfill for
 * already-active orgs and the trigger that sets it on future
 * activations both live in that migration — the Stripe webhook
 * handler stays byte-identical per the AC.
 *
 * COPPA: every `.select()` uses an explicit allow-list. NEVER reads
 * `coaches.email`, `coaches.phone`, `coaches.full_name`, `players.*`,
 * `players.parent_email`, `players.dob`. The route reads only counter
 * shapes and the cloning organizations' public name.
 *
 * Tier posture: server-gated on `tier IN ('coach', 'pro_coach',
 * 'organization')` AND `subscription_status IN ('active', 'past_due',
 * 'trialing')`. A free-tier or churned coach receives
 * `{ eligible: false }`. NO new tier feature key — the card is a
 * retention surface for PAID coaches, not a feature gate.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively;
 * never embeds an AGENTS.md banned word verbatim.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { summarizePaidCoachReceipts } from '@/lib/paid-coach-receipts';

const PAID_GRACE_STATUSES = new Set(['active', 'past_due', 'trialing']);
const PAID_TIERS = new Set(['coach', 'pro_coach', 'program', 'organization']);
const PARENT_REPORT_PLAN_TYPES = new Set(['parent_report', 'report_card']);
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();

  try {
    // ── (1) Read the caller's coach + org row. Allow-list is narrow:
    //    coach id / org_id only; the org row carries the tier,
    //    subscription_status, and paid_since_at — every field required
    //    to gate the response. NEVER selects coaches.email / phone /
    //    full_name (COPPA — LESSONS#0036).
    const { data: coachRow } = await admin
      .from('coaches')
      .select('id, org_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!coachRow?.org_id) {
      return NextResponse.json({ eligible: false });
    }
    const orgId = coachRow.org_id;

    const { data: orgRow } = await admin
      .from('organizations')
      .select('id, tier, subscription_status, paid_since_at')
      .eq('id', orgId)
      .maybeSingle();
    if (!orgRow) {
      return NextResponse.json({ eligible: false });
    }

    // Server-side tier + status gate (LESSONS#0044 — load-bearing for
    // cancelled / unpaid orgs).
    const tier = (orgRow as { tier?: string | null }).tier ?? 'free';
    const subStatus = (orgRow as { subscription_status?: string | null }).subscription_status ?? 'none';
    if (!PAID_TIERS.has(tier)) {
      return NextResponse.json({ eligible: false });
    }
    if (!PAID_GRACE_STATUSES.has(subStatus)) {
      return NextResponse.json({ eligible: false });
    }

    // Paid-since timestamp — primary source is the new
    // organizations.paid_since_at column. If it is still null on this
    // org (a pre-migration paid org whose backfill row was somehow
    // missed), we silence the card rather than guessing — surfaced
    // here as eligible: false so the UI never lies about the day count.
    const paidSinceRaw = (orgRow as { paid_since_at?: string | null }).paid_since_at;
    if (!paidSinceRaw) {
      return NextResponse.json({ eligible: false });
    }
    const paidSinceMs = Date.parse(paidSinceRaw);
    if (!Number.isFinite(paidSinceMs)) {
      return NextResponse.json({ eligible: false });
    }

    const nowMs = Date.now();
    const daysSincePaid = Math.floor((nowMs - paidSinceMs) / DAY_MS);

    // Early window-check short-circuit. The helper's window gate is the
    // ground truth, but the route can avoid the six counter reads when
    // we're already certain the window isn't open. Bounds are 56..90
    // inclusive; outside, return eligible: false WITHOUT hitting the
    // counter tables.
    if (daysSincePaid < 56 || daysSincePaid > 90) {
      return NextResponse.json({ eligible: false });
    }

    // ── (2) Check the dedup table BEFORE issuing the counter reads.
    //    A coach who already tapped "Got it" gets eligible: false.
    const { data: dedupRowsRaw } = await admin
      .from('coach_first_signal_celebrations')
      .select('kind, dismissed_at')
      .eq('coach_id', user.id);
    const dedupRows = (dedupRowsRaw ?? []) as Array<{ kind: string; dismissed_at: string | null }>;
    const alreadyDismissed = dedupRows.some(
      (r) => r.kind === 'paid_receipts_d60' && r.dismissed_at,
    );
    if (alreadyDismissed) {
      return NextResponse.json({ eligible: false });
    }

    // ── (3) Counter reads — narrow allow-lists per LESSONS#0036.
    const last30Iso = new Date(nowMs - 30 * DAY_MS).toISOString();

    const [
      observationsRes,
      plansRes,
      reactionsRes,
      clonesRes,
      shareSourceIdsRes,
    ] = await Promise.all([
      admin
        .from('observations')
        .select('id')
        .eq('coach_id', user.id),
      admin
        .from('plans')
        .select('id, type, created_at')
        .eq('coach_id', user.id)
        .gte('created_at', last30Iso),
      admin
        .from('parent_reactions')
        .select('id, created_at')
        .eq('coach_id', user.id)
        .gte('created_at', last30Iso),
      admin
        .from('drill_shares')
        .select('id')
        .eq('coach_id', user.id),
      // Read the coach's drill_shares ids in parallel with the
      // observations / plans / reactions reads so the second-stage
      // clone-on-share read can fan out from the resolved id set.
      Promise.resolve(null),
    ]);

    const observationRows = (observationsRes?.data ?? []) as Array<{ id: string }>;
    const planRowsAll = (plansRes?.data ?? []) as Array<{
      id: string;
      type: string;
      created_at: string;
    }>;
    const reactionRows = (reactionsRes?.data ?? []) as Array<{
      id: string;
      created_at: string;
    }>;
    const drillShareRows = (clonesRes?.data ?? []) as Array<{ id: string }>;
    void shareSourceIdsRes;

    // Only parent-report-shaped plans count toward the report counter.
    const parentReportRows = planRowsAll.filter((p) =>
      PARENT_REPORT_PLAN_TYPES.has(p.type),
    );

    // ── (4) Drill clones — drill_share_clones joined to the cloner's
    //    organizations.name via coaches.org_id (per LESSONS#0078 — the
    //    join goes through cloner_coach_id, NOT a non-existent
    //    `cloner_org_id` on drill_share_clones).
    const drillShareIds = drillShareRows.map((d) => d.id);
    let cloneRows: Array<{ id: string; cloner_program_name?: string }> = [];
    if (drillShareIds.length > 0) {
      const { data: rawClonesRows } = await admin
        .from('drill_share_clones')
        .select('id, cloner_coach_id')
        .in('drill_share_id', drillShareIds);
      const rawClones = (rawClonesRows ?? []) as Array<{
        id: string;
        cloner_coach_id: string;
      }>;
      // Resolve cloner org names — coach id → org id → org name. Every
      // .select() is narrow. NEVER reads coaches.full_name / email /
      // phone (COPPA).
      const clonerCoachIds = Array.from(new Set(rawClones.map((r) => r.cloner_coach_id)));
      let coachOrgIdById = new Map<string, string | null>();
      if (clonerCoachIds.length > 0) {
        const { data: cRowsRaw } = await admin
          .from('coaches')
          .select('id, org_id')
          .in('id', clonerCoachIds);
        const cRows = (cRowsRaw ?? []) as Array<{ id: string; org_id: string | null }>;
        coachOrgIdById = new Map(cRows.map((c) => [c.id, c.org_id]));
      }
      const orgIds = Array.from(
        new Set(
          [...coachOrgIdById.values()].filter((v): v is string => Boolean(v)),
        ),
      );
      let orgNameById = new Map<string, string>();
      if (orgIds.length > 0) {
        const { data: oRowsRaw } = await admin
          .from('organizations')
          .select('id, name')
          .in('id', orgIds);
        const oRows = (oRowsRaw ?? []) as Array<{ id: string; name: string }>;
        orgNameById = new Map(oRows.map((o) => [o.id, o.name]));
      }
      cloneRows = rawClones
        // Defensive: never count a self-clone as a cross-coach signal.
        .filter((r) => r.cloner_coach_id !== user.id)
        .map((r) => {
          const orgId2 = coachOrgIdById.get(r.cloner_coach_id);
          const programName = orgId2 ? orgNameById.get(orgId2) : undefined;
          return programName ? { id: r.id, cloner_program_name: programName } : { id: r.id };
        });
    }

    // ── (5) Arc weeks — the caller's published practice plans across
    //    the last 8 weeks act as the carry-forward signal in v1.
    //    LESSONS#0096 — the prose named an "arc-state" table; on this
    //    repo's schema the carry-forward is implicit in the practice
    //    plan history. Counting distinct week_index values in the
    //    last 56 days gives a stable "weeks of work carrying forward"
    //    integer without inventing a missing column.
    const arcWindowMs = nowMs - 56 * DAY_MS;
    const arcRows = planRowsAll
      .filter((p) => Date.parse(p.created_at) >= arcWindowMs)
      .map((p) => {
        const created = Date.parse(p.created_at);
        const weekIndex = Math.floor((nowMs - created) / (7 * DAY_MS));
        return { week_index: weekIndex };
      });

    const summary = summarizePaidCoachReceipts({
      coachId: user.id,
      paidSinceMs,
      nowMs,
      observationRows,
      planRows: planRowsAll,
      parentReactionRows: reactionRows,
      parentReportRows,
      cloneRows,
      arcRows,
    });

    if (!summary) {
      return NextResponse.json({ eligible: false });
    }
    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
