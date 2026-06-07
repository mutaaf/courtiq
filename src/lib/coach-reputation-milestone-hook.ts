// ─── Ticket 0073 — milestone write-side hook ────────────────────────────────
//
// Best-effort milestone upsert called from the two clone routes
// (practice-plan share clone + drill-share clone). The hook reads
// the publishing coach's CURRENT clone counts (after the just-
// completed clone has landed) and upserts a row per crossed
// threshold into `coach_reputation_milestones`. The UNIQUE
// (published_coach_id, milestone_kind) constraint makes re-upserts
// idempotent.
//
// LESSONS#0036 — the hook is wrapped in a try/catch so a milestone
// failure NEVER affects the clone path. The clone route awaits this
// helper (the route's tests assert the upsert was attempted), but
// any thrown error inside is swallowed and surfaced only on the
// server log.

import type {
  PlanCloneRow,
  DrillCloneRow,
  CoachReputation,
} from '@/lib/coach-reputation-utils';
import {
  computeCoachReputation,
  milestonesCrossed,
} from '@/lib/coach-reputation-utils';

type SupabaseLike = {
  from: (table: string) => unknown;
};

/**
 * Read the publishing coach's current reputation (across plan + drill
 * clones) and upsert any newly-crossed milestone rows.
 *
 * Best-effort: any error inside is caught and console.error'd.
 *
 * @param admin Supabase service-role client (from
 *  `createServiceSupabase()`).
 * @param publishedCoachId The coach whose reputation we are
 *  recomputing — i.e. the publisher of the share that was just
 *  cloned.
 */
export async function fireMilestonesForPublishedCoach(
  admin: SupabaseLike,
  publishedCoachId: string,
): Promise<void> {
  try {
    // 1) Plan-side: find the publisher's published plans, then load
    //    every clone (`plans` row whose `source_plan_id IN <ids>`).
    //    The clone row's `coach_id` + `team_id` resolve the cloning
    //    coach; the cloning coach's `org_id` is fetched in step 3.
    const publisherPlansResp = await ((
      (admin.from('plans') as unknown) as {
        select: (s: string) => {
          eq: (col: string, val: string) => { eq: (c2: string, v2: string) => Promise<{ data: Array<{ id: string }> | null; error: unknown }> };
        };
      }
    )
      .select('id, coach_id, type')
      .eq('coach_id', publishedCoachId)
      .eq('type', 'practice'));
    const publisherPlanIds = ((publisherPlansResp.data ?? []) as Array<{ id: string }>).map((r) => r.id);

    let planClones: PlanCloneRow[] = [];
    const cloningCoachIdsFromPlans = new Set<string>();
    if (publisherPlanIds.length > 0) {
      const cloneRowsResp = await ((
        (admin.from('plans') as unknown) as {
          select: (s: string) => {
            in: (col: string, vals: string[]) => Promise<{ data: Array<{ source_plan_id: string; coach_id: string; team_id: string; created_at: string }> | null; error: unknown }>;
          };
        }
      )
        .select('source_plan_id, coach_id, team_id, created_at')
        .in('source_plan_id', publisherPlanIds));
      const cloneRows = (cloneRowsResp.data ?? []) as Array<{
        source_plan_id: string;
        coach_id: string;
        team_id: string;
        created_at: string;
      }>;
      for (const r of cloneRows) cloningCoachIdsFromPlans.add(r.coach_id);
      // We'll fill cloning_org_id in step 3.
      planClones = cloneRows.map((r) => ({
        source_plan_id: r.source_plan_id,
        cloning_coach_id: r.coach_id,
        cloning_team_id: r.team_id,
        cloning_org_id: null,
        created_at: r.created_at,
      }));
    }

    // 2) Drill-side: find the publisher's drill_shares, then load
    //    every drill_share_clones row.
    const publisherDrillSharesResp = await ((
      (admin.from('drill_shares') as unknown) as {
        select: (s: string) => {
          eq: (col: string, val: string) => Promise<{ data: Array<{ id: string }> | null; error: unknown }>;
        };
      }
    )
      .select('id, coach_id')
      .eq('coach_id', publishedCoachId));
    const publisherDrillShareIds = ((publisherDrillSharesResp.data ?? []) as Array<{ id: string }>).map((r) => r.id);

    let drillClones: DrillCloneRow[] = [];
    const cloningCoachIdsFromDrills = new Set<string>();
    if (publisherDrillShareIds.length > 0) {
      const drillCloneRowsResp = await ((
        (admin.from('drill_share_clones') as unknown) as {
          select: (s: string) => {
            in: (col: string, vals: string[]) => Promise<{ data: Array<{ drill_share_id: string; cloner_coach_id: string; cloned_at: string }> | null; error: unknown }>;
          };
        }
      )
        .select('drill_share_id, cloner_coach_id, cloned_at')
        .in('drill_share_id', publisherDrillShareIds));
      const drillCloneRows = (drillCloneRowsResp.data ?? []) as Array<{
        drill_share_id: string;
        cloner_coach_id: string;
        cloned_at: string;
      }>;
      for (const r of drillCloneRows) cloningCoachIdsFromDrills.add(r.cloner_coach_id);
      drillClones = drillCloneRows.map((r) => ({
        source_drill_share_id: r.drill_share_id,
        cloning_coach_id: r.cloner_coach_id,
        cloning_team_id: '',
        cloning_org_id: null,
        created_at: r.cloned_at,
      }));
    }

    // 3) Resolve cloning coaches' org_ids in ONE batched read. The
    //    select is allow-listed (id + org_id) — never reads full_name,
    //    email, etc.
    const cloningCoachIds = Array.from(
      new Set<string>([...cloningCoachIdsFromPlans, ...cloningCoachIdsFromDrills]),
    );
    const coachOrgById = new Map<string, string | null>();
    if (cloningCoachIds.length > 0) {
      const orgRowsResp = await ((
        (admin.from('coaches') as unknown) as {
          select: (s: string) => {
            in: (col: string, vals: string[]) => Promise<{ data: Array<{ id: string; org_id: string | null }> | null; error: unknown }>;
          };
        }
      )
        .select('id, org_id')
        .in('id', cloningCoachIds));
      const orgRows = (orgRowsResp.data ?? []) as Array<{
        id: string;
        org_id: string | null;
      }>;
      for (const r of orgRows) coachOrgById.set(r.id, r.org_id ?? null);
    }
    // Fill cloning_org_id on every row.
    planClones = planClones.map((r) => ({
      ...r,
      cloning_org_id: coachOrgById.get(r.cloning_coach_id) ?? null,
    }));
    drillClones = drillClones.map((r) => ({
      ...r,
      cloning_org_id: coachOrgById.get(r.cloning_coach_id) ?? null,
    }));

    // 4) Compute reputation and the milestone-kind list to upsert.
    const rep: CoachReputation = computeCoachReputation({
      publishedCoachId,
      planClones,
      drillClones,
      nowMs: Date.now(),
    });
    const kinds = milestonesCrossed(rep);
    if (kinds.length === 0) return;

    // 5) Upsert each crossed milestone. UNIQUE(published_coach_id,
    //    milestone_kind) makes a repeat-cross idempotent.
    const rows = kinds.map((kind) => ({
      published_coach_id: publishedCoachId,
      milestone_kind: kind,
    }));
    await ((
      (admin.from('coach_reputation_milestones') as unknown) as {
        upsert: (rows: unknown, opts: { onConflict: string }) => Promise<{ error: unknown }>;
      }
    )
      .upsert(rows, { onConflict: 'published_coach_id,milestone_kind' }));
  } catch (e) {
    // Best-effort. The clone path is unaffected — silence beats a
    // user-facing error on a quiet retention edge.
    // eslint-disable-next-line no-console
    console.error('coach reputation milestone hook failed', e);
  }
}
