/**
 * GET /api/coach/viral-social-proof — ticket 0084.
 *
 * Returns ONE short factual line describing the calling coach's
 * strongest viral event in the last 14 days, so the quota-wall
 * `<AIUpgradePrompt>` can render it under the existing artifact-named
 * headline. Free-tier coaches only: paid tiers receive
 * `{ line: null, eventKind: null }` because the social-proof line is a
 * conversion surface, not a paid retention surface (the wall is what
 * fires for free coaches at quota).
 *
 * Reads (allow-listed, LESSONS#0036):
 *   coaches(id, org_id)                          — caller's org
 *   organizations(id, tier, name)                — caller's tier
 *   plans(id, team_id, coach_id, type)           — caller's parent_reports (14d)
 *   teams(id, name)                              — team name for the rendered line
 *   parent_forward_signals(sender_player_id, team_id, dispatched_at, cross_team)
 *   drill_shares(id, coach_id, drill_id)
 *   drills(id, name)
 *   drill_share_clones(drill_share_id, cloner_coach_id, cloned_at)
 *   drill_clone_stick_signals(drill_share_id, cloner_coach_id, cloner_org_id, stuck_at)
 *   coach_reputation_milestones(id, milestone_kind, crossed_at)
 *
 * Privacy / COPPA: NEVER reads parent_email, parent_phone, DOB,
 * medical_notes, jersey_number, or player full_name. The cloning
 * coach's full_name is NEVER read — the cloning side is attributed
 * ONLY by program name (LESSONS#0073), resolved via
 * coaches(id → org_id) → organizations.name (LESSONS#0078).
 *
 * Per LESSONS#0049 / #0092 / #0100 / #0110 — this is a NEW route. The
 * Glob sweep for sibling test-file mock-queue extensions on
 * `tests/api/*forward*.test.ts` / `*drill*.test.ts` /
 * `*reputation*.test.ts` is a no-op here per LESSONS#0116 (no existing
 * route's queue shape changes).
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  buildViralSocialProof,
  type ViralProofEvent,
} from '@/lib/viral-social-proof';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

const NULL_BODY = { line: null, eventKind: null } as const;

export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();
  const nowMs = Date.now();
  const windowStartIso = new Date(nowMs - WINDOW_DAYS * DAY_MS).toISOString();

  try {
    // 1) Caller's coach row → org_id. Allow-list: id + org_id ONLY.
    //    NEVER reads full_name (LESSONS#0073 — program-name attribution).
    const { data: callerCoach } = await admin
      .from('coaches')
      .select('id, org_id')
      .eq('id', user.id)
      .maybeSingle();
    const callerOrgId = (callerCoach as { org_id?: string } | null)?.org_id ?? null;

    // 2) Caller's org tier. Free-tier coaches only — paid tiers always
    //    receive { line: null }. Server-side gate per AGENTS.md rule 5;
    //    the client mount on the 402 surface is defense-in-depth.
    if (!callerOrgId) {
      return NextResponse.json(NULL_BODY);
    }
    const { data: orgRow } = await admin
      .from('organizations')
      .select('id, tier, name')
      .eq('id', callerOrgId)
      .maybeSingle();
    const callerTier = (orgRow as { tier?: string } | null)?.tier ?? 'free';
    if (callerTier !== 'free') {
      return NextResponse.json(NULL_BODY);
    }

    const events: ViralProofEvent[] = [];

    // 3) Reputation milestones — highest-priority kind, read first so
    //    the helper can short-circuit if any are present. Allow-list:
    //    id + milestone_kind + crossed_at.
    {
      const { data: milestones } = await admin
        .from('coach_reputation_milestones')
        .select('id, milestone_kind, crossed_at')
        .eq('published_coach_id', user.id)
        .gte('crossed_at', windowStartIso)
        .order('crossed_at', { ascending: false });
      const rows = (milestones ?? []) as Array<{
        id: string;
        milestone_kind: string;
        crossed_at: string;
      }>;
      // Resolve the program count carried on the milestone kind. The
      // 0073 / 0076 milestone kinds encode the count in the suffix
      // ('clones_10' → 10, 'programs_4' → 4, 'stuck_3' → 3). The line
      // formatter renders "your work was cloned by coaches in N
      // programs", so we map the suffix to a program count.
      for (const m of rows) {
        const match = m.milestone_kind.match(/_(\d+)$/);
        const count = match ? parseInt(match[1], 10) : 1;
        events.push({
          kind: 'reputation_milestone',
          occurredAtMs: Date.parse(m.crossed_at),
          programCount: count,
        });
      }
    }

    // 4) Drill stick signals + drill clones — both keyed by the
    //    publisher's drill_shares rows. Read shares ONCE, then join.
    let shareIds: string[] = [];
    const drillIdByShareId = new Map<string, string>();
    {
      const { data: shares } = await admin
        .from('drill_shares')
        .select('id, coach_id, drill_id')
        .eq('coach_id', user.id);
      const rows = (shares ?? []) as Array<{
        id: string;
        coach_id: string;
        drill_id: string;
      }>;
      shareIds = rows.map((r) => r.id);
      for (const r of rows) drillIdByShareId.set(r.id, r.drill_id);
    }

    if (shareIds.length > 0) {
      // 4a) Drill titles — allow-list id + name.
      const drillIds = Array.from(new Set(drillIdByShareId.values()));
      const { data: drills } = await admin
        .from('drills')
        .select('id, name')
        .in('id', drillIds);
      const drillNameById = new Map<string, string>();
      for (const d of (drills ?? []) as Array<{ id: string; name: string }>) {
        drillNameById.set(d.id, d.name);
      }

      // 4b) Stick signals (higher priority than plain clones). Allow-
      //     list drill_share_id + cloner_org_id + stuck_at. NEVER reads
      //     the cloner's full_name.
      const { data: sticks } = await admin
        .from('drill_clone_stick_signals')
        .select('drill_share_id, cloner_org_id, stuck_at')
        .in('drill_share_id', shareIds)
        .gte('stuck_at', windowStartIso);
      const stickRows = (sticks ?? []) as Array<{
        drill_share_id: string;
        cloner_org_id: string | null;
        stuck_at: string;
      }>;

      // 4c) Plain clones. Allow-list drill_share_id + cloner_coach_id +
      //     cloned_at. The cloning coach's org_id is resolved through
      //     the COACHES table (per LESSONS#0078) — NEVER reads
      //     full_name.
      const { data: clones } = await admin
        .from('drill_share_clones')
        .select('drill_share_id, cloner_coach_id, cloned_at')
        .in('drill_share_id', shareIds)
        .gte('cloned_at', windowStartIso);
      const cloneRows = (clones ?? []) as Array<{
        drill_share_id: string;
        cloner_coach_id: string;
        cloned_at: string;
      }>;

      // Resolve cloning coach → org_id (NEVER full_name). The
      //   cloner_coach_id set spans stick rows (when cloner_org_id is
      //   null on the stick) AND every clone row.
      const clonerCoachIds = Array.from(
        new Set([
          ...stickRows
            .filter((s) => s.cloner_org_id === null)
            .map((s) => s.drill_share_id),
          ...cloneRows.map((c) => c.cloner_coach_id),
        ]),
      );
      const orgIdByCoachId = new Map<string, string>();
      if (clonerCoachIds.length > 0) {
        const { data: clonerCoaches } = await admin
          .from('coaches')
          .select('id, org_id')
          .in('id', clonerCoachIds);
        for (const c of (clonerCoaches ?? []) as Array<{
          id: string;
          org_id: string | null;
        }>) {
          if (c.org_id) orgIdByCoachId.set(c.id, c.org_id);
        }
      }

      // Resolve every required org name. Combine the stick rows'
      // cloner_org_id with the clone rows' resolved-via-coaches org id.
      const orgIdsNeeded = Array.from(
        new Set([
          ...stickRows
            .filter((s) => s.cloner_org_id !== null)
            .map((s) => s.cloner_org_id as string),
          ...cloneRows
            .map((c) => orgIdByCoachId.get(c.cloner_coach_id))
            .filter((v): v is string => !!v),
        ]),
      );
      const orgNameById = new Map<string, string>();
      if (orgIdsNeeded.length > 0) {
        const { data: orgs } = await admin
          .from('organizations')
          .select('id, name')
          .in('id', orgIdsNeeded);
        for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) {
          orgNameById.set(o.id, o.name);
        }
      }

      for (const s of stickRows) {
        const drillId = drillIdByShareId.get(s.drill_share_id) ?? null;
        const drillTitle = (drillId && drillNameById.get(drillId)) || 'drill';
        const programName =
          (s.cloner_org_id && orgNameById.get(s.cloner_org_id)) || 'a program';
        events.push({
          kind: 'drill_stick_signal',
          occurredAtMs: Date.parse(s.stuck_at),
          programName,
          drillTitle,
        });
      }

      for (const c of cloneRows) {
        const drillId = drillIdByShareId.get(c.drill_share_id) ?? null;
        const drillTitle = (drillId && drillNameById.get(drillId)) || 'drill';
        const orgId = orgIdByCoachId.get(c.cloner_coach_id);
        const programName = (orgId && orgNameById.get(orgId)) || 'a program';
        events.push({
          kind: 'drill_clone',
          occurredAtMs: Date.parse(c.cloned_at),
          programName,
          drillTitle,
        });
      }
    }

    // 5) Parent forward signals — keyed by the caller's parent_report
    //    plans. The 0079 / 0080 tables key forwards by team_id, so we
    //    resolve "the calling coach's parent reports' teams" first.
    {
      const { data: plans } = await admin
        .from('plans')
        .select('id, team_id, coach_id, type')
        .eq('coach_id', user.id)
        .eq('type', 'parent_report')
        .gte('created_at', windowStartIso);
      const planRows = (plans ?? []) as Array<{
        id: string;
        team_id: string | null;
        coach_id: string;
        type: string;
      }>;
      const teamIds = Array.from(
        new Set(
          planRows
            .map((p) => p.team_id)
            .filter((v): v is string => !!v),
        ),
      );

      if (teamIds.length > 0) {
        const { data: teams } = await admin
          .from('teams')
          .select('id, name')
          .in('id', teamIds);
        const teamNameById = new Map<string, string>();
        for (const t of (teams ?? []) as Array<{ id: string; name: string }>) {
          teamNameById.set(t.id, t.name);
        }

        const { data: forwards } = await admin
          .from('parent_forward_signals')
          .select('sender_player_id, team_id, dispatched_at, cross_team')
          .in('team_id', teamIds)
          .gte('dispatched_at', windowStartIso);
        const forwardRows = (forwards ?? []) as Array<{
          sender_player_id: string;
          team_id: string;
          dispatched_at: string;
          cross_team: boolean;
        }>;

        // Group on-team forwards per team — N = distinct senders.
        const onTeamBuckets = new Map<
          string,
          { senders: Set<string>; latestMs: number }
        >();
        // Cross-team forwards — one event per source team in the window.
        const crossTeamBuckets = new Map<string, number>();
        for (const f of forwardRows) {
          const ts = Date.parse(f.dispatched_at);
          if (f.cross_team) {
            const prev = crossTeamBuckets.get(f.team_id) ?? 0;
            if (ts > prev) crossTeamBuckets.set(f.team_id, ts);
          } else {
            const bucket = onTeamBuckets.get(f.team_id) ?? {
              senders: new Set<string>(),
              latestMs: 0,
            };
            bucket.senders.add(f.sender_player_id);
            if (ts > bucket.latestMs) bucket.latestMs = ts;
            onTeamBuckets.set(f.team_id, bucket);
          }
        }

        for (const [teamId, b] of onTeamBuckets) {
          const teamName = teamNameById.get(teamId) || 'team';
          events.push({
            kind: 'parent_forward_on_team',
            occurredAtMs: b.latestMs,
            teamName,
            senderCount: b.senders.size,
          });
        }
        for (const [teamId, latestMs] of crossTeamBuckets) {
          const teamName = teamNameById.get(teamId) || 'team';
          events.push({
            kind: 'parent_forward_cross_team',
            occurredAtMs: latestMs,
            teamName,
          });
        }
      }
    }

    const result = buildViralSocialProof({ events, nowMs });
    if (!result) return NextResponse.json(NULL_BODY);
    return NextResponse.json({
      line: result.line,
      eventKind: result.eventKind,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('viral-social-proof error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
