/**
 * GET /api/coach/reputation-milestones — ticket 0073.
 *
 * Returns the caller coach's unconsumed reputation milestones from
 * the last 14 days so the /home `<CoachReputationMilestoneCard />`
 * can render the most-recent unseen milestone ("your closeout
 * drill was cloned by a coach in a 3rd program this month").
 *
 * COPPA contract (LESSONS#0036):
 *  - `.select()` allow-list on the read. NEVER reads cloning-coach
 *    full_name, cloning-team name, parent_email, DOB.
 *  - The response shape is `{ milestones: Array<{ id, kind,
 *    crossedAt }> }`. The cloning-coach's identity NEVER leaves the
 *    server (only the milestone kind label does).
 *
 * Auth: the caller must be authenticated. Milestones are scoped by
 * `published_coach_id = user.id`.
 *
 * Tier posture: universal — the publishing coach's reputation
 * belongs to them; no UpgradeGate.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

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
    const cutoffIso = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();
    // Allow-list: id, milestone_kind, crossed_at, notified_at. NEVER
    // joins the cloning-coach side — the surface never names the
    // cloning coach.
    const { data, error } = await admin
      .from('coach_reputation_milestones')
      .select('id, milestone_kind, crossed_at, notified_at')
      .eq('published_coach_id', user.id)
      .is('notified_at', null)
      .gte('crossed_at', cutoffIso)
      .order('crossed_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      id: string;
      milestone_kind: string;
      crossed_at: string;
      notified_at: string | null;
    }>;

    // Ticket 0081 — enrich the stuck_* milestones with the drill
    // title, the cloning program name, and the drill id so the
    // home card's new <ThankClonerButton /> can pre-fill the sheet
    // and so the existing "Open my drill" link deep-links to the
    // right drill. The enrichment ONLY runs when at least one
    // stuck_* milestone is in the result set — non-stuck kinds
    // never hit the extra reads. Existing tests that fixture only
    // non-stuck kinds are byte-identical (LESSONS#0049 / #0092 /
    // #0100 / #0110 — gate the new from() calls behind a
    // conditional so non-stuck callers don't overflow the queue).
    const hasStuck = rows.some(
      (r) =>
        r.milestone_kind === 'stuck_1' ||
        r.milestone_kind === 'stuck_3' ||
        r.milestone_kind === 'stuck_8',
    );

    const stuckContextByMilestoneId = new Map<
      string,
      {
        drillTitle: string | null;
        programNames: string[];
        drillId: string | null;
      }
    >();

    if (hasStuck) {
      // Resolve the publisher's drill_shares (allow-list id + drill_id)
      // and the most-recent stick signal on those shares. We pick the
      // single most-recent stick — the ticket's milestone-card surface
      // names ONE drill / ONE program at a time.
      const { data: shareRowsRaw } = await admin
        .from('drill_shares')
        .select('id, drill_id')
        .eq('coach_id', user.id);
      const shareRows = (shareRowsRaw ?? []) as Array<{
        id: string;
        drill_id: string;
      }>;
      const drillIdByShareId = new Map<string, string>();
      for (const s of shareRows) drillIdByShareId.set(s.id, s.drill_id);

      if (shareRows.length > 0) {
        const shareIds = shareRows.map((s) => s.id);
        const { data: stickRowsRaw } = await admin
          .from('drill_clone_stick_signals')
          .select('drill_share_id, cloner_org_id, stuck_at')
          .in('drill_share_id', shareIds)
          .order('stuck_at', { ascending: false })
          .limit(1);
        const stickRows = (stickRowsRaw ?? []) as Array<{
          drill_share_id: string;
          cloner_org_id: string | null;
          stuck_at: string;
        }>;
        const stick = stickRows[0];
        if (stick) {
          const drillId = drillIdByShareId.get(stick.drill_share_id) ?? null;
          let drillTitle: string | null = null;
          if (drillId) {
            const { data: drillRow } = await admin
              .from('drills')
              .select('id, name')
              .eq('id', drillId)
              .maybeSingle();
            const d = drillRow as { name?: string } | null;
            drillTitle = d?.name ?? null;
          }
          let programName: string | null = null;
          if (stick.cloner_org_id) {
            const { data: orgRow } = await admin
              .from('organizations')
              .select('id, name')
              .eq('id', stick.cloner_org_id)
              .maybeSingle();
            const o = orgRow as { name?: string } | null;
            programName = o?.name ?? null;
          }
          // Apply the enrichment to every stuck_* milestone in the
          // result set. The 0076 hook is best-effort and writes the
          // milestone for the single most-recent stick; threading the
          // single enrichment row to every stuck card is the right
          // shape for v1.
          for (const r of rows) {
            if (
              r.milestone_kind === 'stuck_1' ||
              r.milestone_kind === 'stuck_3' ||
              r.milestone_kind === 'stuck_8'
            ) {
              stuckContextByMilestoneId.set(r.id, {
                drillTitle,
                programNames: programName ? [programName] : [],
                drillId,
              });
            }
          }
        }
      }
    }

    const milestones = rows.map((r) => {
      const ctx = stuckContextByMilestoneId.get(r.id);
      return {
        id: r.id,
        kind: r.milestone_kind,
        crossedAt: r.crossed_at,
        ...(ctx?.drillTitle !== undefined && ctx.drillTitle !== null
          ? { drillTitle: ctx.drillTitle }
          : {}),
        ...(ctx?.programNames && ctx.programNames.length > 0
          ? { programNames: ctx.programNames }
          : {}),
        ...(ctx?.drillId !== undefined && ctx.drillId !== null
          ? { drillId: ctx.drillId }
          : {}),
      };
    });
    return NextResponse.json({ milestones });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
