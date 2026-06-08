import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  computeCrossProgramEmergentFocus,
  type CrossProgramPlanRow,
} from '@/lib/emergent-focus-utils';

// ─── GET /api/sport/emergent-focus?sportId=<uuid>&excludeOrgId=<uuid> ──────
// Ticket 0075 — coach-side cross-program "three coaches in your sport are on
// closeouts too" signal, surfaced on Capture.
//
// Reads the last 14 days of `plans` for teams in the caller's sport
// EXCLUDING the caller's own org, aggregates skills_targeted across DISTINCT
// orgs, and returns ONE focus (top by program count) with — when one exists
// — the most-thumbed-up published drill associated with that skill via the
// existing 0044 thumbed-drill ranking (coach_drill_signals.rating='up') AND
// the 0064 drill_shares table. Distinct from 0071 which is in-program +
// director-only; THIS is cross-program + coach-side.
//
// CONTRACT:
//   - sportId + excludeOrgId are REQUIRED query params (the route is
//     called from the authed Capture surface with the caller's resolved
//     team.sport_id + activeTeam.org_id).
//   - 3 distinct orgs (default minPrograms = 3) is the cross-program
//     scarcity floor — below that, focus: null (silence beats nag).
//   - Drill is OPTIONAL: when no published, thumbed-up drill exists for the
//     focus skill, the route returns the focus with `drill: null`. The
//     Capture surface still renders the line without the clone card.
//
// COPPA / data minimization (LESSONS#0036): allow-list `.select()` on every
// read. The route NEVER reads `players`, `observations`, `parent_email`,
// `date_of_birth`, `jersey_number`, `medical_notes`, `photo_url`. The
// response carries only the sport-name-resolved-by-the-client + the skill
// string + the drill name + duration + an opaque `sourceDrillShareId` (the
// 0064 clone POST resolves it server-side; the client never sees the
// publishing coach id).
//
// BEST-EFFORT (LESSONS#0036): every read-failure path returns
// `200 { focus: null }`. The Capture surface is byte-identical when the
// line is absent — silence beats nag, and capture must NEVER be blocked by
// a flaky discovery read.
//
// NO new tier feature key (LESSONS#0078). The line is a quality lift on
// Capture (the highest-frequency free-tier surface the product ships);
// tier-gating it would invert the loop. The clone POST is the existing
// 0064 surface, with its existing free-for-every-tier posture untouched.

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Response shape consumed by the Capture surface. Mirrored in the
 *  component's data prop type. */
export interface CrossProgramFocusResponse {
  focus: {
    skill: string;
    distinctProgramCount: number;
    drill: {
      sourceDrillShareId: string;
      name: string;
      duration_minutes: number | null;
      setup_lines: string[];
    } | null;
  } | null;
}

export async function GET(request: Request): Promise<NextResponse<CrossProgramFocusResponse>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // 401 is the only non-200 the Capture surface can see; the surface
    // tolerates it (the read is best-effort and returns undefined).
    return NextResponse.json({ focus: null } as CrossProgramFocusResponse, { status: 401 });
  }

  const url = new URL(request.url);
  const sportId = url.searchParams.get('sportId');
  const excludeOrgId = url.searchParams.get('excludeOrgId');
  if (!sportId || !excludeOrgId) {
    // Missing params — silence beats nag (the surface renders nothing).
    return NextResponse.json({ focus: null });
  }

  const admin = await createServiceSupabase();

  try {
    // ── Step 1: list teams in the sport EXCLUDING the caller's own org. ──
    // Allow-list select per LESSONS#0036 — only id + org_id (sport_id is the
    // filter, not part of the projection). We never read team.name,
    // coach_id, or any other team field.
    const { data: teamRows, error: teamsError } = await admin
      .from('teams')
      .select('id, org_id')
      .eq('sport_id', sportId)
      .neq('org_id', excludeOrgId);

    if (teamsError || !teamRows || teamRows.length === 0) {
      // Best-effort: nothing to aggregate → focus: null. The surface is
      // byte-identical when the line is absent.
      return NextResponse.json({ focus: null });
    }

    const teams = teamRows as Array<{ id: string; org_id: string }>;
    const teamOrgById = new Map(teams.map((t) => [t.id, t.org_id]));
    const teamIds = teams.map((t) => t.id);

    // ── Step 2: 14-day window of plans for those teams. ────────────────
    // Allow-list select per LESSONS#0036 — three columns only. No title, no
    // content, no content_structured, no player_id, no coach_id.
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data: planRows, error: plansError } = await admin
      .from('plans')
      .select('team_id, skills_targeted, created_at')
      .in('team_id', teamIds)
      .gte('created_at', since);

    if (plansError || !planRows) {
      // Best-effort posture — a plans read failure resolves to focus: null
      // (mirrors 0071's read-failure path; silence beats nag).
      return NextResponse.json({ focus: null });
    }

    // Hand the rows to the pure aggregator. The route is responsible for
    // joining team_id → org_id (the helper just dedupes on the org_id field).
    const xPlans: CrossProgramPlanRow[] = [];
    for (const row of planRows) {
      const r = row as { team_id: string; skills_targeted: string[] | null; created_at: string };
      const org_id = teamOrgById.get(r.team_id);
      if (!org_id) continue;
      xPlans.push({
        org_id,
        skills_targeted: r.skills_targeted,
        created_at: r.created_at,
      });
    }

    const focuses = computeCrossProgramEmergentFocus(xPlans);
    if (focuses.length === 0) {
      // Below the cross-program threshold (3 distinct orgs) → silence.
      return NextResponse.json({ focus: null });
    }

    const top = focuses[0];

    // ── Step 3: resolve the most-thumbed-up published drill for the skill.
    // Read the drill catalog filtered by category matching the focus skill
    // (case-insensitive). Drills are a real DB table (LESSONS#0096); the
    // skill maps to the drill's category column.
    //
    // The "most-thumbed-up" ranking is: for each candidate drill in the
    // sport's drill catalog whose category matches the focus skill AND
    // whose drill_id has at least one published drill_shares row, count
    // (a) coach_drill_signals.rating='up' rows, (b) drill_share_clones rows,
    // and pick the highest combined score. A clean tie breaks by drill name
    // ascending for determinism. Best-effort throughout — a missing drill
    // or empty signals returns drill: null and the surface renders the line
    // without the clone card.

    // ── Step 3a: candidate drill_shares (active publications). ──────────
    const { data: shareRows } = await admin
      .from('drill_shares')
      .select('id, drill_id')
      .eq('is_active', true);

    const shares = (shareRows ?? []) as Array<{ id: string; drill_id: string }>;
    if (shares.length === 0) {
      return NextResponse.json({ focus: { skill: top.skill, distinctProgramCount: top.distinctProgramCount, drill: null } });
    }
    const shareDrillIds = Array.from(new Set(shares.map((s) => s.drill_id)));

    // ── Step 3b: drills matching the focus skill (by category). ─────────
    // Skill strings are controlled vocabulary on plans.skills_targeted; the
    // drills.category column carries the same vocabulary on the drill
    // catalog. A case-insensitive equality match is the simplest correct
    // surface; a future ranking can broaden it.
    const { data: drillRows } = await admin
      .from('drills')
      .select('id, name, category, duration_minutes, setup_instructions')
      .in('id', shareDrillIds);

    const allDrills = (drillRows ?? []) as Array<{
      id: string;
      name: string;
      category: string | null;
      duration_minutes: number | null;
      setup_instructions: string | null;
    }>;
    // Skill-to-drill matching: try the exact skill string first, then a
    // simple singular/plural normalisation (controlled-vocabulary skills
    // like "closeouts" map to drills named "Live closeout 1-on-1" — the
    // category column is the catch-all bucket like "Defense", so we
    // additionally match on the drill NAME containing the stem). The
    // normalisation is INCLUSIVE — better to surface a related drill than
    // none — and the helper returns null when nothing matches so the
    // surface gracefully renders the line without the clone card.
    const focusSkillLower = top.skill.toLowerCase();
    const focusSkillStem = focusSkillLower.replace(/s$/, ''); // closeouts → closeout
    const matchingDrills = allDrills.filter((d) => {
      const cat = (d.category ?? '').toLowerCase();
      const name = (d.name ?? '').toLowerCase();
      return (
        cat.includes(focusSkillLower) ||
        name.includes(focusSkillLower) ||
        cat.includes(focusSkillStem) ||
        name.includes(focusSkillStem)
      );
    });

    if (matchingDrills.length === 0) {
      return NextResponse.json({ focus: { skill: top.skill, distinctProgramCount: top.distinctProgramCount, drill: null } });
    }

    // ── Step 3c: thumb-up scores per drill. ─────────────────────────────
    const matchingDrillIds = matchingDrills.map((d) => d.id);
    const { data: signalRows } = await admin
      .from('coach_drill_signals')
      .select('drill_id, rating')
      .in('drill_id', matchingDrillIds)
      .eq('rating', 'up');

    const upCountByDrillId = new Map<string, number>();
    for (const r of (signalRows ?? []) as Array<{ drill_id: string }>) {
      upCountByDrillId.set(r.drill_id, (upCountByDrillId.get(r.drill_id) ?? 0) + 1);
    }

    // ── Step 3d: clone-count tiebreak per share. ────────────────────────
    const matchingShareIds = shares
      .filter((s) => matchingDrillIds.includes(s.drill_id))
      .map((s) => s.id);
    const { data: cloneRows } = await admin
      .from('drill_share_clones')
      .select('drill_share_id')
      .in('drill_share_id', matchingShareIds);

    const cloneCountByShareId = new Map<string, number>();
    for (const r of (cloneRows ?? []) as Array<{ drill_share_id: string }>) {
      cloneCountByShareId.set(r.drill_share_id, (cloneCountByShareId.get(r.drill_share_id) ?? 0) + 1);
    }

    // ── Step 3e: score each (drill, share) candidate. ───────────────────
    // score = thumbs-up on the drill + clone count on the share. Highest
    // wins; ties broken alphabetically by drill name for determinism.
    let bestShareId: string | null = null;
    let bestDrill: typeof matchingDrills[number] | null = null;
    let bestScore = -1;
    for (const drill of matchingDrills) {
      const drillUps = upCountByDrillId.get(drill.id) ?? 0;
      for (const share of shares) {
        if (share.drill_id !== drill.id) continue;
        const cloneCount = cloneCountByShareId.get(share.id) ?? 0;
        const score = drillUps + cloneCount;
        if (
          score > bestScore ||
          (score === bestScore &&
            bestDrill &&
            drill.name.localeCompare(bestDrill.name) < 0)
        ) {
          bestScore = score;
          bestDrill = drill;
          bestShareId = share.id;
        }
      }
    }

    if (!bestDrill || !bestShareId) {
      return NextResponse.json({ focus: { skill: top.skill, distinctProgramCount: top.distinctProgramCount, drill: null } });
    }

    // Setup lines: split the multi-line setup_instructions string into
    // per-line entries for the surface (the component renders them as a
    // bullet list); empty entries are filtered.
    const setupLines = (bestDrill.setup_instructions ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return NextResponse.json({
      focus: {
        skill: top.skill,
        distinctProgramCount: top.distinctProgramCount,
        drill: {
          sourceDrillShareId: bestShareId,
          name: bestDrill.name,
          duration_minutes: bestDrill.duration_minutes ?? null,
          setup_lines: setupLines,
        },
      },
    });
  } catch (err: unknown) {
    // Top-level safety net — every read above is already best-effort, but a
    // synchronous throw (e.g. an unexpected supabase-js shape change) lands
    // here and silently returns focus: null so the Capture surface stays
    // byte-identical.
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('sport-emergent-focus error:', message);
    return NextResponse.json({ focus: null });
  }
}
