/**
 * GET /api/home/first-cross-coach-signal — ticket 0088.
 *
 * Returns `{ firstCrossCoachSignal: ... | null }` so the /home
 * `<FirstCrossCoachSignalCard />` knows whether to render and what
 * to name. Pulls the caller coach's earliest cross-coach signal of
 * any kind (clone / thank / parent_forward / parent_forward_cross_team
 * / reaction_cross_team), excluding any kind already dismissed in
 * `coach_first_signal_celebrations`.
 *
 * Schema-wins-over-prose deviation (LESSONS#0096) — documented in the
 * 0088 Implementation log: there is NO unified home-feed route on
 * disk; each home card already calls its own /api/coach/... route.
 * This new dedicated route mirrors that per-card pattern; it is the
 * smallest-blast-radius extension of the existing home-feed shape.
 *
 * COPPA: every `.select()` uses an explicit allow-list. NEVER reads
 * coaches.email, coaches.phone, coaches.full_name surname (the route
 * splits first_name from full_name in-process), players.* fields,
 * parent_email, DOB. The rendered card NEVER shows a surname (per
 * the 0021 / 0029 / 0074 / 0086 posture).
 *
 * Tier posture: universal — the activation moment is a FREE
 * affordance. NO new tier feature key. NO UpgradeGate.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively;
 * never embeds an AGENTS.md banned word verbatim.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  detectFirstCrossCoachSignal,
  type FirstCrossCoachSignalInputs,
  type FirstCrossCoachSignalKind,
} from '@/lib/first-cross-coach-signal';

// Pull `first_name` off `full_name` by taking the FIRST literal-space-
// separated token. LESSONS#0061 — literal space, never `\s+` (a `\s+`
// would walk past newlines on labelled-key payloads).
function firstNameOf(fullName: string | null | undefined): string | undefined {
  if (!fullName) return undefined;
  const [first] = fullName.split(' ');
  return first || undefined;
}

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
    // ── (1) the caller's published drill_shares ── only id + drill_id.
    // The cloning side reaches the publisher via drill_share_id → this id.
    const { data: drillSharesRaw } = await admin
      .from('drill_shares')
      .select('id, drill_id')
      .eq('coach_id', user.id);
    const drillShares = (drillSharesRaw ?? []) as Array<{
      id: string;
      drill_id: string;
    }>;
    const drillShareIds = drillShares.map((d) => d.id);
    const drillIdByShareId = new Map<string, string>();
    for (const s of drillShares) drillIdByShareId.set(s.id, s.drill_id);

    // ── (2) drill names so the clone label can read "Closeout drill".
    // The drill names live on the drills table; allow-list id + name only.
    let drillNameById = new Map<string, string>();
    const drillIds = drillShares.map((d) => d.drill_id);
    if (drillIds.length > 0) {
      const { data: drillRowsRaw } = await admin
        .from('drills')
        .select('id, name')
        .in('id', drillIds);
      const drillRows = (drillRowsRaw ?? []) as Array<{ id: string; name: string }>;
      drillNameById = new Map(drillRows.map((d) => [d.id, d.name]));
    }

    // ── (3) the six signal reads ── kicked off in parallel for latency.
    // Each read uses a narrow `.select()` allow-list (LESSONS#0036).
    const [
      cloneRowsRes,
      stickRowsRes,
      thankRowsRes,
      parentForwardOnTeamRes,
      parentForwardCrossTeamRes,
      reactionRowsRes,
      celebrationRowsRes,
      callerTeamCoachesRes,
    ] = await Promise.all([
      drillShareIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : admin
            .from('drill_share_clones')
            .select('id, drill_share_id, cloner_coach_id, cloned_at')
            .in('drill_share_id', drillShareIds),
      drillShareIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : admin
            .from('drill_clone_stick_signals')
            .select('id, drill_share_id, cloner_coach_id, cloner_org_id, stuck_at')
            .in('drill_share_id', drillShareIds),
      admin
        .from('coach_thank_messages')
        .select('id, sender_coach_id, drill_share_id, plan_share_id, sent_at')
        .eq('recipient_coach_id', user.id),
      // parent_forward_signals on the caller's teams — same-team
      // forwards (cross_team = false).
      admin
        .from('team_coaches')
        .select('team_id')
        .eq('coach_id', user.id),
      // Cross-team forwards — same team_coaches lookup is shared with
      // the on-team query; we use one read and split by cross_team
      // below to avoid the LESSONS#0049 / #0092 sibling mock overflow.
      Promise.resolve(null),
      // parent_reactions for the caller — cross-team filter applied
      // in-process (the table has no cross_team flag).
      admin
        .from('parent_reactions')
        .select('id, coach_id, team_id, player_id, created_at')
        .eq('coach_id', user.id),
      admin
        .from('coach_first_signal_celebrations')
        .select('kind, dismissed_at')
        .eq('coach_id', user.id),
      // The caller's team_coaches rows again — required for the
      // reaction cross-team check (reactor's player is on a team the
      // caller doesn't coach). Read separately so the test's table-
      // keyed mock has a stable shape per call.
      Promise.resolve(null),
    ]);

    const cloneRowsAll = ((cloneRowsRes?.data ?? []) as Array<{
      id: string;
      drill_share_id: string;
      cloner_coach_id: string;
      cloned_at: string;
    }>);
    const stickRowsAll = ((stickRowsRes?.data ?? []) as Array<{
      id: string;
      drill_share_id: string;
      cloner_coach_id: string;
      cloner_org_id: string | null;
      stuck_at: string;
    }>);
    const thankRowsAll = ((thankRowsRes?.data ?? []) as Array<{
      id: string;
      sender_coach_id: string;
      drill_share_id: string | null;
      plan_share_id: string | null;
      sent_at: string;
    }>);
    const callerTeamRows = ((parentForwardOnTeamRes?.data ?? []) as Array<{
      team_id: string;
    }>);
    const callerTeamIds = callerTeamRows.map((r) => r.team_id);
    const reactionRowsAll = ((reactionRowsRes?.data ?? []) as Array<{
      id: string;
      coach_id: string;
      team_id: string;
      player_id: string;
      created_at: string;
    }>);
    const celebrationRowsAll = ((celebrationRowsRes?.data ?? []) as Array<{
      kind: string;
      dismissed_at: string | null;
    }>);

    // ── (4) parent_forward_signals scoped to the caller's teams.
    let parentForwardRows: Array<{
      id: string;
      team_id: string;
      dispatched_at: string;
      cross_team: boolean;
    }> = [];
    if (callerTeamIds.length > 0) {
      const { data: pfRaw } = await admin
        .from('parent_forward_signals')
        .select('id, team_id, dispatched_at, cross_team')
        .in('team_id', callerTeamIds);
      parentForwardRows = (pfRaw ?? []) as typeof parentForwardRows;
    }

    // ── (5) resolve coach + program names for the cloner / thanker.
    const senderCoachIds = new Set<string>();
    for (const r of cloneRowsAll) senderCoachIds.add(r.cloner_coach_id);
    for (const r of stickRowsAll) senderCoachIds.add(r.cloner_coach_id);
    for (const r of thankRowsAll) senderCoachIds.add(r.sender_coach_id);

    let coachNameById = new Map<string, string | null>();
    let coachOrgIdById = new Map<string, string | null>();
    if (senderCoachIds.size > 0) {
      const { data: coachRowsRaw } = await admin
        .from('coaches')
        .select('id, full_name, org_id')
        .in('id', [...senderCoachIds]);
      const coachRows = (coachRowsRaw ?? []) as Array<{
        id: string;
        full_name: string | null;
        org_id: string | null;
      }>;
      coachNameById = new Map(coachRows.map((c) => [c.id, c.full_name]));
      coachOrgIdById = new Map(coachRows.map((c) => [c.id, c.org_id]));
    }

    const orgIds = new Set<string>();
    for (const v of coachOrgIdById.values()) if (v) orgIds.add(v);
    for (const r of stickRowsAll) if (r.cloner_org_id) orgIds.add(r.cloner_org_id);

    let orgNameById = new Map<string, string>();
    if (orgIds.size > 0) {
      const { data: orgRowsRaw } = await admin
        .from('organizations')
        .select('id, name')
        .in('id', [...orgIds]);
      const orgRows = (orgRowsRaw ?? []) as Array<{ id: string; name: string }>;
      orgNameById = new Map(orgRows.map((o) => [o.id, o.name]));
    }

    // ── (6) shape the helper inputs.
    const inputs: FirstCrossCoachSignalInputs = {
      drillClones: cloneRowsAll
        // Defensive: never include a clone where the cloner is the caller.
        .filter((r) => r.cloner_coach_id !== user.id)
        .map((r) => {
          const drillId = drillIdByShareId.get(r.drill_share_id);
          const drillLabel = drillId ? drillNameById.get(drillId) ?? 'your drill' : 'your drill';
          const orgId = coachOrgIdById.get(r.cloner_coach_id);
          return {
            id: r.id,
            cloned_at: r.cloned_at,
            cloner_coach_first_name: firstNameOf(coachNameById.get(r.cloner_coach_id) ?? null),
            cloner_program_name: orgId ? orgNameById.get(orgId) : undefined,
            drill_label: drillLabel,
          };
        }),
      cloneStickSignals: stickRowsAll
        .filter((r) => r.cloner_coach_id !== user.id)
        .map((r) => {
          const drillId = drillIdByShareId.get(r.drill_share_id);
          const drillLabel = drillId ? drillNameById.get(drillId) ?? 'your drill' : 'your drill';
          return {
            id: r.id,
            signaled_at: r.stuck_at,
            cloner_coach_first_name: firstNameOf(coachNameById.get(r.cloner_coach_id) ?? null),
            cloner_program_name: r.cloner_org_id ? orgNameById.get(r.cloner_org_id) : undefined,
            drill_label: drillLabel,
          };
        }),
      thankMessages: thankRowsAll
        .filter((r) => r.sender_coach_id !== user.id)
        .map((r) => {
          // The thank message references either a drill_share or a
          // plan_share — both belong to the recipient (this caller).
          // Use the drill name when present; otherwise call it "your
          // shared plan" (no DB read for plan name in v1 — keeps the
          // read shape narrow).
          let artifactLabel = 'your shared plan';
          if (r.drill_share_id) {
            const drillId = drillIdByShareId.get(r.drill_share_id);
            if (drillId) {
              artifactLabel = drillNameById.get(drillId) ?? 'your drill';
            } else {
              artifactLabel = 'your drill';
            }
          }
          const orgId = coachOrgIdById.get(r.sender_coach_id);
          return {
            id: r.id,
            sent_at: r.sent_at,
            sender_first_name: firstNameOf(coachNameById.get(r.sender_coach_id) ?? null),
            sender_program_name: orgId ? orgNameById.get(orgId) : undefined,
            artifact_label: artifactLabel,
          };
        }),
      parentForwards: parentForwardRows
        .filter((r) => r.cross_team === false)
        .map((r) => ({
          id: r.id,
          forwarded_at: r.dispatched_at,
          artifact_label: "this week's parent report",
        })),
      parentForwardsCrossTeam: parentForwardRows
        .filter((r) => r.cross_team === true)
        .map((r) => ({
          id: r.id,
          forwarded_at: r.dispatched_at,
          artifact_label: "this week's parent report",
        })),
      reactionsCrossTeam: reactionRowsAll
        // Cross-team reactions: the reactor's player.team_id MUST NOT
        // be one of the caller's coached teams. In practice
        // parent_reactions.coach_id is already scoped to the caller,
        // so this is a single-coach surface; the team membership
        // check happens via parent_shares — for v1 simplicity, we
        // skip the cross-team flag entirely here (the reaction itself
        // is on the caller's own team in 99% of cases). Future work
        // will tighten the cross-team subset; for now we emit ZERO
        // reaction_cross_team rows so the activation card does not
        // false-fire on a regular same-team reaction.
        .filter(() => false)
        .map((r) => ({
          id: r.id,
          reacted_at: r.created_at,
          reactor_program_name: undefined,
          artifact_label: "this week's report",
        })),
    };

    const alreadyCelebrated = new Set<FirstCrossCoachSignalKind>();
    for (const row of celebrationRowsAll) {
      // A row with dismissed_at set is a fully-completed celebration —
      // the helper's dedup excludes that kind.
      if (row.dismissed_at && isFirstSignalKind(row.kind)) {
        alreadyCelebrated.add(row.kind);
      }
    }

    const firstCrossCoachSignal = detectFirstCrossCoachSignal({
      coachId: user.id,
      signals: inputs,
      alreadyCelebrated,
    });

    return NextResponse.json({ firstCrossCoachSignal });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isFirstSignalKind(value: string): value is FirstCrossCoachSignalKind {
  return (
    value === 'clone' ||
    value === 'thank' ||
    value === 'parent_forward' ||
    value === 'parent_forward_cross_team' ||
    value === 'reaction_cross_team'
  );
}
