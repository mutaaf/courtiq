// ─── Ticket 0091 — sport-wide skill-convergence helper ────────────────────
//
// Pure helper. Given (a) a union of recent plans across an entire sport
// targeting a specific skill, and (b) metadata for the programs that own
// those plans, returns the count of distinct programs (orgs) shipping the
// skill in the last 7 days, the total plan count, and the TOP-N programs
// by plan count (with director first name attached) — but ONLY when the
// distinctProgramCount meets the `minPrograms` floor (default 25). Below
// that floor, the response is `{ eligible: false, eligibilityReason:
// 'too_few_programs' }` and the Capture surface stays silent.
//
// This is the SPORT-WIDE counterpart to the 0075 cross-program
// `computeCrossProgramEmergentFocus`. The 0075 helper fires at the
// 3-coach scale (one row per OTHER coach in the same sport on the same
// skill); THIS helper fires at the 25-PROGRAM scale (one row per
// distinct org across the sport on the same skill) — a structurally
// different signal that requires the platform to have that much supply
// in a single sport, which is the moat.
//
// Per LESSONS#0103 — this helper is ADDITIVE. The existing 0075 helper
// is BYTE-IDENTICAL — zero changes to its signature, defaults, or call
// paths. The two helpers can fire independently or together.
//
// Reads no DB. Writes no AI. Mirrors `src/lib/program-drill-canon.ts`
// (0090), `src/lib/program-tier-state.ts` (0087) — a small pure module
// with a single exported function the route + the component test + the
// e2e seed all pin without a Supabase mock.
//
// Voice posture (LESSONS#0023): the helper output is numbers + program
// names + first names + structural age-group metadata; the rendered
// string carries no AGENTS.md banned word. The line variants jsdoc in
// the component instructs positively.
//
// LESSONS#0061 — literal-space defensive surname scan on director names.
// LESSONS#0070 — never mutate the input arrays.
// LESSONS#0115 — when comparing plan.created_at to nowMs, ensure the
// timestamp string has a UTC suffix so Date.parse reads it as UTC.

/** Default minimum number of DISTINCT programs (orgs) required for the
 *  sport-wide pulse to fire. Below this floor, silence beats nag — the
 *  bar is structurally meaningful (25 programs = supply density only
 *  SportsIQ has in a saturated sport). */
const DEFAULT_MIN_PROGRAMS = 25;

/** Default cap on named programs in the rendered list. The line surfaces
 *  the TOP-2 most-shipping programs by plan count; ties break
 *  alphabetically by program name for determinism. */
const DEFAULT_MAX_NAMED_PROGRAMS = 2;

/** 7-day window. The pulse is "what is my sport working on THIS week" —
 *  a longer window would dilute the real-time signal, a shorter window
 *  would miss programs that ship a single plan early in the week. */
const WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimal plan-row shape for the sport-wide aggregator. The caller (the
 *  route) is responsible for joining `plans.team_id → teams.{org_id,
 *  sport_id, age_group}` BEFORE handing rows to this helper — the
 *  helper dedupes on the `org_id` it is given. The shape mirrors what
 *  the ticket prose calls `planRows` so the route signature and the
 *  helper signature line up cleanly. */
export interface SportWidePlanRow {
  id: string;
  org_id: string;
  /** ISO-8601 timestamp; the caller appends a `Z` suffix when composing
   *  from a bare SQL date (LESSONS#0115). */
  created_at: string;
  skills_targeted: string[] | null;
  /** Sport this plan targets — derived from the team's sport_id by the
   *  caller. Plans in another sport are filtered out. */
  sport_id: string;
  /** Age groups served by the team that owns this plan; not part of the
   *  aggregation but the helper passes the named program's age groups
   *  through unchanged. */
  age_groups: string[];
}

/** Minimal program-row shape. The caller resolves `director_first_name`
 *  from the program's admin coach (LESSONS#0087 — `coaches.role ===
 *  'admin'`) and strips the surname via literal space (LESSONS#0061)
 *  upstream. */
export interface SportWideProgramRow {
  id: string;
  name: string;
  /** Director's first name (surname-stripped). When absent, the program
   *  is excluded from `namedPrograms` (no naming without a director).
   *  The program is still counted in `distinctProgramCount`. */
  director_first_name?: string;
  /** When TRUE, the program is honored in the count aggregate but
   *  excluded from the rendered `namedPrograms` list. The opt-out is
   *  program-scoped only (the director owns the program's appearance);
   *  the quantity signal (distinctProgramCount) remains honest. */
  opted_out: boolean;
  /** Age groups served — passed through into the named entry so the
   *  overlay can render "Hawks Basketball — U10 / U12". */
  age_groups_served: string[];
}

/** One named program in the rendered list. The line copy is shaped
 *  around `programName` + `directorFirstName`; the overlay surfaces
 *  `planCount` + `ageGroupsServed`. */
export interface NamedProgram {
  orgId: string;
  programName: string;
  directorFirstName: string;
  planCount: number;
  ageGroupsServed: string[];
}

export interface SportWideConvergenceArgs {
  skillId: string;
  sportId: string;
  planRows: SportWidePlanRow[];
  programRows: SportWideProgramRow[];
  nowMs: number;
  /** Default 25. The cross-LEAGUE / cross-REGION scarcity floor. */
  minPrograms?: number;
  /** Default 2. The TOP-N programs surfaced by name. */
  maxNamedPrograms?: number;
}

export interface SportWideConvergenceResult {
  eligible: boolean;
  distinctProgramCount: number;
  totalPlanCount: number;
  namedPrograms: NamedProgram[];
  /** Only populated when `eligible: false`. */
  eligibilityReason?: 'too_few_programs' | 'no_skill_match';
}

/**
 * Aggregate plan-level activity across an entire sport in the last 7
 * days targeting a specific skill. Pure: deterministic, no I/O, never
 * mutates the input arrays (LESSONS#0070).
 *
 * Steps:
 *  (1) Filter `planRows` to plans where `sport_id === sportId` AND
 *      `skills_targeted` includes `skillId` AND `created_at` is within
 *      the last 7 days of `nowMs`.
 *  (2) Group by `org_id`; count distinct orgs (the program count) AND
 *      total plans. A duplicate (org, skill, day) row inflates the
 *      total but not the distinct count.
 *  (3) Below `minPrograms` (default 25) → eligible: false, reason:
 *      'too_few_programs'. The Capture surface stays silent.
 *  (4) Resolve each org to its program row; exclude opted-out programs
 *      from the named list (still count them in distinctProgramCount).
 *  (5) Sort the named candidates by planCount descending, then
 *      programName ascending (deterministic tiebreak).
 *  (6) Take the TOP `maxNamedPrograms` (default 2). Exclude any program
 *      whose `director_first_name` is missing — no naming without a
 *      director (the privacy floor).
 */
export function computeSportWideConvergence(
  args: SportWideConvergenceArgs,
): SportWideConvergenceResult {
  const {
    skillId,
    sportId,
    planRows,
    programRows,
    nowMs,
    minPrograms = DEFAULT_MIN_PROGRAMS,
    maxNamedPrograms = DEFAULT_MAX_NAMED_PROGRAMS,
  } = args;

  if (!Array.isArray(planRows) || planRows.length === 0) {
    return {
      eligible: false,
      distinctProgramCount: 0,
      totalPlanCount: 0,
      namedPrograms: [],
    };
  }

  // (1) Filter to in-sport + in-skill + in-window plans.
  const windowStart = nowMs - WINDOW_DAYS * DAY_MS;
  const planCountByOrg = new Map<string, number>();
  let totalPlanCount = 0;
  for (const row of planRows) {
    if (!row || typeof row.org_id !== 'string') continue;
    if (row.sport_id !== sportId) continue;
    if (!Array.isArray(row.skills_targeted) || !row.skills_targeted.includes(skillId)) {
      continue;
    }
    const ts = Date.parse(row.created_at);
    if (!Number.isFinite(ts) || ts < windowStart || ts > nowMs) continue;
    totalPlanCount += 1;
    planCountByOrg.set(row.org_id, (planCountByOrg.get(row.org_id) ?? 0) + 1);
  }

  const distinctProgramCount = planCountByOrg.size;

  // (3) Below the cross-LEAGUE / cross-REGION floor → silence.
  if (distinctProgramCount < minPrograms) {
    return {
      eligible: false,
      distinctProgramCount,
      totalPlanCount,
      namedPrograms: [],
      eligibilityReason: 'too_few_programs',
    };
  }

  // (4) Resolve each org to its program row; exclude opted-out from
  //     the named list. Defensive shallow copy of `age_groups_served`
  //     so the helper never returns a reference into the caller's
  //     input array (LESSONS#0070).
  const programById = new Map<string, SportWideProgramRow>();
  for (const p of programRows) {
    if (p && typeof p.id === 'string') programById.set(p.id, p);
  }

  const candidates: NamedProgram[] = [];
  for (const [orgId, planCount] of planCountByOrg.entries()) {
    const program = programById.get(orgId);
    if (!program) continue;
    if (program.opted_out) continue;
    const rawDirector = typeof program.director_first_name === 'string'
      ? program.director_first_name.trim()
      : '';
    if (!rawDirector) continue;
    // Strip surname via literal space (LESSONS#0061).
    const spaceIdx = rawDirector.indexOf(' ');
    const directorFirstName = spaceIdx === -1
      ? rawDirector
      : rawDirector.slice(0, spaceIdx);
    if (!directorFirstName) continue;
    candidates.push({
      orgId,
      programName: program.name,
      directorFirstName,
      planCount,
      ageGroupsServed: Array.isArray(program.age_groups_served)
        ? [...program.age_groups_served]
        : [],
    });
  }

  // (5) Sort: planCount desc, then programName asc for determinism.
  candidates.sort((a, b) => {
    if (b.planCount !== a.planCount) return b.planCount - a.planCount;
    return a.programName.localeCompare(b.programName);
  });

  // (6) Cap.
  const namedPrograms = candidates.slice(0, maxNamedPrograms);

  return {
    eligible: true,
    distinctProgramCount,
    totalPlanCount,
    namedPrograms,
  };
}

/** Exported for the route / component / e2e so the three never drift. */
export const SPORT_WIDE_CONVERGENCE_DEFAULTS = {
  minPrograms: DEFAULT_MIN_PROGRAMS,
  maxNamedPrograms: DEFAULT_MAX_NAMED_PROGRAMS,
  windowDays: WINDOW_DAYS,
} as const;
