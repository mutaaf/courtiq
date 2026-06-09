// ─── Ticket 0076 — clone-stick write-side hook ──────────────────────────────
//
// Called from the 0044 thumbs-up PATCH route (POST `/api/coach-drill-
// signals` with rating='up'). If the caller previously cloned a
// drill_shares row whose drill_id matches the just-thumbed drill, the
// hook upserts a row into `drill_clone_stick_signals` keyed on
// `(drill_share_id, cloner_coach_id)`. The UNIQUE constraint makes
// re-taps idempotent.
//
// Best-effort posture per LESSONS#0036: a stick-row write failure is
// caught and console.error'd; the upstream thumbs-up path is
// unaffected. The hook also fires the existing 0073 milestone hook
// (so a freshly-crossed stuck_1 / stuck_3 / stuck_8 fires from the
// thumbs-up path, not just from clone events).

import { fireMilestonesForPublishedCoach } from '@/lib/coach-reputation-milestone-hook';

type SupabaseLike = {
  from: (table: string) => unknown;
};

/**
 * Write a stick-signal row for the (caller, thumbed-drill) pair when
 * the caller previously cloned a drill_shares row that resolves to
 * the same drill_id.
 *
 * @param admin Supabase service-role client.
 * @param callerId The authed coach who just thumbed-up the drill.
 * @param drillId The drill they thumbed.
 */
export async function fireClonStickForThumbUp(
  admin: SupabaseLike,
  callerId: string,
  drillId: string,
): Promise<void> {
  try {
    // 1) Look up drill_share_clones rows for the caller joined to
    //    drill_shares that resolve to the thumbed drill_id. The
    //    PostgREST nested-select syntax `drill_shares!inner(...)`
    //    keeps the read one round-trip.
    const cloneRowsResp = await ((
      (admin.from('drill_share_clones') as unknown) as {
        select: (s: string) => {
          eq: (col: string, val: string) => Promise<{
            data: Array<{
              drill_share_id: string;
              cloner_coach_id: string;
              cloned_at: string;
              drill_shares?:
                | { id: string; drill_id: string; coach_id: string }
                | Array<{ id: string; drill_id: string; coach_id: string }>
                | null;
            }> | null;
            error: unknown;
          }>;
        };
      }
    )
      .select(
        'drill_share_id, cloner_coach_id, cloned_at, drill_shares!inner(id, drill_id, coach_id)',
      )
      .eq('cloner_coach_id', callerId));

    const cloneRows = (cloneRowsResp.data ?? []) as Array<{
      drill_share_id: string;
      cloner_coach_id: string;
      cloned_at: string;
      drill_shares?:
        | { id: string; drill_id: string; coach_id: string }
        | Array<{ id: string; drill_id: string; coach_id: string }>
        | null;
    }>;

    // 2) Filter to rows where the parent share's drill_id matches the
    //    thumbed drill AND the cloner is NOT the publisher (self-thumb
    //    guard) AND cloned_at < now (the timing guard — pure
    //    defensive; a clone in the future is structurally impossible
    //    but we filter it just in case).
    const nowMs = Date.now();
    const matchingShares: Array<{
      shareId: string;
      publisherCoachId: string;
    }> = [];
    for (const r of cloneRows) {
      const parent = Array.isArray(r.drill_shares) ? r.drill_shares[0] : r.drill_shares;
      if (!parent) continue;
      if (parent.drill_id !== drillId) continue;
      if (parent.coach_id === callerId) continue; // self-thumb guard
      const clonedAtMs = Date.parse(r.cloned_at);
      if (!Number.isFinite(clonedAtMs)) continue;
      if (clonedAtMs > nowMs) continue; // future-clone defensive
      matchingShares.push({ shareId: r.drill_share_id, publisherCoachId: parent.coach_id });
    }

    if (matchingShares.length === 0) return;

    // 3) Resolve caller's org_id once (used for cloner_org_id on every
    //    new stick row).
    const callerRowResp = await ((
      (admin.from('coaches') as unknown) as {
        select: (s: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { id: string; org_id: string | null } | null; error: unknown }>;
          };
        };
      }
    )
      .select('id, org_id')
      .eq('id', callerId)
      .maybeSingle());
    const callerOrgId = callerRowResp.data?.org_id ?? null;

    // 4) Upsert one stick row per matching share. UNIQUE
    //    (drill_share_id, cloner_coach_id) makes repeat-taps a no-op.
    const stickRows = matchingShares.map(({ shareId }) => ({
      drill_share_id: shareId,
      cloner_coach_id: callerId,
      cloner_org_id: callerOrgId,
    }));
    await ((
      (admin.from('drill_clone_stick_signals') as unknown) as {
        upsert: (rows: unknown, opts: { onConflict: string }) => Promise<{ error: unknown }>;
      }
    )
      .upsert(stickRows, { onConflict: 'drill_share_id,cloner_coach_id' }));

    // 5) Fire the existing 0073 milestone hook for each affected
    //    publisher (one publisher per matching share — usually one).
    //    The hook reads stick signals, so the freshly-upserted row is
    //    visible.
    const publishers = new Set<string>(matchingShares.map((m) => m.publisherCoachId));
    for (const publisherId of publishers) {
      await fireMilestonesForPublishedCoach(admin, publisherId);
    }
  } catch (e) {
    // Best-effort per LESSONS#0036 — the thumbs-up path is unaffected.
    // eslint-disable-next-line no-console
    console.error('clone-stick write hook failed', e);
  }
}
