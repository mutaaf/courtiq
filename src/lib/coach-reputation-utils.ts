// ─── Ticket 0073 — coach reputation aggregator ──────────────────────────────
//
// Pure helper. Given (a) plan-clone rows (existing 0049 schema:
// `plans` rows whose `source_plan_id` points at a published coach's
// plan), and (b) drill-clone rows (existing 0064
// `drill_share_clones` joined with `drill_shares` to map back to the
// published coach), returns the SHAPE the league-discovery surface
// renders under each card and the milestone hook checks against the
// threshold list.
//
// Reads no DB. Writes no AI. Mirrors `src/lib/emergent-focus-utils.ts`
// (0071) and `src/lib/coach-reactivation-utils.ts` (0072) — a small
// pure module with one exported function the route + the component
// test + the milestone hook all pin without a Supabase mock.
//
// Per LESSONS#0023 — every output is a NUMBER, so no banned-word scan
// is needed. Per LESSONS#0061 — no surname regex; this helper never
// formats a name.
//
// Per LESSONS#0096 — the input shapes match the actual schema, NOT
// the ticket prose's "practice_plan_clones" name. The 0049 schema
// uses `plans.source_plan_id` (a self-FK) to track plan clones; the
// 0064 schema uses a dedicated `drill_share_clones` table. The
// caller is responsible for resolving each clone row's
// `cloning_org_id` via the cloning coach's row (the helper does NOT
// do its own join).

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 28;

/** Minimal plan-clone row shape. Maps to a `plans` row whose
 *  `source_plan_id` points at the published coach's source plan;
 *  `cloning_coach_id` / `cloning_team_id` / `cloning_org_id` are
 *  resolved by the caller from the cloning coach's row. */
export interface PlanCloneRow {
  source_plan_id: string;
  cloning_coach_id: string;
  cloning_team_id: string;
  cloning_org_id: string | null;
  created_at: string;
}

/** Minimal drill-clone row shape. Maps to a `drill_share_clones` row;
 *  `cloning_org_id` is resolved by the caller. */
export interface DrillCloneRow {
  source_drill_share_id: string;
  cloning_coach_id: string;
  cloning_team_id: string;
  cloning_org_id: string | null;
  created_at: string;
}

/** The reputation shape rendered under each discovery card and the
 *  threshold input for the milestone hook. */
export interface CoachReputation {
  cloneCount: number;
  distinctProgramCount: number;
  distinctCoachCount: number;
}

export interface ComputeArgs {
  publishedCoachId: string;
  planClones: PlanCloneRow[];
  drillClones: DrillCloneRow[];
  /** Default 28 — the v1 reputation cadence. */
  windowDays?: number;
  /** "Now" in milliseconds since epoch. Injected so the unit tests
   *  pin the window without freezing the system clock. */
  nowMs: number;
}

/**
 * Aggregate plan + drill clones into a single reputation tuple over
 * the last `windowDays` days. Self-clones (cloning_coach_id ===
 * publishedCoachId) are filtered. A clone with `cloning_org_id ===
 * null` counts toward cloneCount but NOT toward distinctProgramCount.
 *
 * Deterministic across input order — the helper unions plan + drill
 * rows into a single counter and uses Sets for distinctness, so the
 * caller may pass clones in any order.
 */
export function computeCoachReputation(args: ComputeArgs): CoachReputation {
  const {
    publishedCoachId,
    planClones,
    drillClones,
    windowDays = DEFAULT_WINDOW_DAYS,
    nowMs,
  } = args;

  const windowStartMs = nowMs - windowDays * DAY_MS;

  const programs = new Set<string>();
  const coaches = new Set<string>();
  let cloneCount = 0;

  function consume(
    row:
      | (PlanCloneRow & { _kind?: 'plan' })
      | (DrillCloneRow & { _kind?: 'drill' }),
  ) {
    if (!row) return;
    if (row.cloning_coach_id === publishedCoachId) return; // self-clone filter
    const ts = Date.parse(row.created_at);
    if (!Number.isFinite(ts)) return;
    if (ts < windowStartMs) return;
    cloneCount += 1;
    coaches.add(row.cloning_coach_id);
    if (row.cloning_org_id) programs.add(row.cloning_org_id);
  }

  if (Array.isArray(planClones)) for (const r of planClones) consume(r);
  if (Array.isArray(drillClones)) for (const r of drillClones) consume(r);

  return {
    cloneCount,
    distinctProgramCount: programs.size,
    distinctCoachCount: coaches.size,
  };
}

// ─── Milestone thresholds ──────────────────────────────────────────────────
//
// Used by the clone-route's milestone hook. The kinds map 1:1 to the
// CHECK constraint on `coach_reputation_milestones.milestone_kind`
// (migration 065). The set is exhaustive — a future "clones_100" or
// "programs_16" needs both a migration update AND a new entry here.

export type MilestoneKind =
  | 'clones_3'
  | 'clones_10'
  | 'clones_25'
  | 'clones_50'
  | 'programs_2'
  | 'programs_4'
  | 'programs_8';

/** Return the milestone kinds the published coach has CROSSED (i.e.
 *  the threshold at or below the current count). The caller upserts
 *  one row per returned kind; the UNIQUE(published_coach_id,
 *  milestone_kind) constraint makes re-upserts idempotent. */
export function milestonesCrossed(rep: CoachReputation): MilestoneKind[] {
  const out: MilestoneKind[] = [];
  if (rep.cloneCount >= 50) out.push('clones_50');
  else if (rep.cloneCount >= 25) out.push('clones_25');
  else if (rep.cloneCount >= 10) out.push('clones_10');
  else if (rep.cloneCount >= 3) out.push('clones_3');

  if (rep.distinctProgramCount >= 8) out.push('programs_8');
  else if (rep.distinctProgramCount >= 4) out.push('programs_4');
  else if (rep.distinctProgramCount >= 2) out.push('programs_2');

  return out;
}

/** Whether a given reputation is above the discovery-surface render
 *  threshold (cloneCount >= 3 AND distinctProgramCount >= 2). Below
 *  that the surface renders NOTHING — silence beats small-number
 *  bragging. */
export function isAboveDiscoveryThreshold(rep: CoachReputation): boolean {
  return rep.cloneCount >= 3 && rep.distinctProgramCount >= 2;
}
