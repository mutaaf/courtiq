// ─── Ticket 0071 — emergent focus aggregator ───────────────────────────────
//
// Pure helper that walks the org's recent practice plans and surfaces the
// skills that 3+ DISTINCT teams have organically targeted in the same window.
// This is the BOTTOM-UP counterpart to the top-down program weekly focus
// (ticket 0031): the director never set this — the convergence emerged from
// what each coach quietly planned in their own gym.
//
// Reads no DB. Writes no AI. Mirrors `src/lib/season-momentum-utils.ts` —
// a tiny pure module with a single exported function the route + the
// component test can both pin without a Supabase mock.
//
// Skills are CONTROLLED VOCABULARY pulled from the team's drill library /
// coach-input categories — they are not free-text — so the LESSONS#0023
// banned-word scan and the LESSONS#0061 surname guard are NOT needed here.

/** Minimal `plans` row shape the aggregator reads. `team_id` is the dedup
 *  key (so a team running 5 plans this week on the same skill counts ONCE);
 *  `skills_targeted` is the underlying postgres `text[]` (string[] | null
 *  in TS — confirmed against migration 001_schema.sql at pickup); created_at
 *  is the windowDays filter. */
export interface PlanRow {
  /** Optional plan id — not required by the aggregation; tolerated so
   *  callers can pass through the live row shape without remapping. */
  id?: string;
  team_id: string;
  skills_targeted: string[] | null;
  created_at: string;
}

/** Surfaceable record: a skill the focus card renders + the teams that
 *  rallied around it. */
export interface EmergentFocus {
  skill: string;
  teamIds: string[];
  teamCount: number;
}

export interface ComputeOpts {
  /** Minimum distinct teams that must target the skill — default 3. */
  minConvergence?: number;
  /** Window of plans to consider — default 14 days (one fortnightly bucket). */
  windowDays?: number;
  /** Hard cap on returned focuses — default 2 (v1 card renders ONE; the
   *  second is reserved for a v2 "second emergent focus" follow-on). */
  maxFocuses?: number;
}

const DEFAULTS: Required<ComputeOpts> = {
  minConvergence: 3,
  windowDays: 14,
  maxFocuses: 2,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Aggregate plan-level `skills_targeted` across teams. Returns the top
 * `maxFocuses` skills that ≥ `minConvergence` DISTINCT teams have targeted
 * inside the last `windowDays` days, sorted by team count descending.
 *
 * Deterministic across input order: a tie on team count breaks by the
 * skill string's natural sort so the same input ALWAYS produces the
 * same output (the card's copy is then stable run-to-run).
 */
export function computeEmergentFocus(
  plans: PlanRow[],
  opts: ComputeOpts = {}
): EmergentFocus[] {
  const { minConvergence, windowDays, maxFocuses } = { ...DEFAULTS, ...opts };

  if (!Array.isArray(plans) || plans.length === 0) return [];

  const windowStart = Date.now() - windowDays * DAY_MS;

  // skill → set of team_ids that targeted it in-window.
  const bySkill = new Map<string, Set<string>>();

  for (const plan of plans) {
    if (!plan || !plan.team_id || !plan.skills_targeted) continue;
    const ts = Date.parse(plan.created_at);
    if (!Number.isFinite(ts) || ts < windowStart) continue;

    // A team is unioned ONCE per skill, even if they ran 5 plans this week.
    for (const rawSkill of plan.skills_targeted) {
      if (typeof rawSkill !== 'string') continue;
      const skill = rawSkill.trim();
      if (!skill) continue;
      let teams = bySkill.get(skill);
      if (!teams) {
        teams = new Set<string>();
        bySkill.set(skill, teams);
      }
      teams.add(plan.team_id);
    }
  }

  const results: EmergentFocus[] = [];
  for (const [skill, teams] of bySkill.entries()) {
    if (teams.size < minConvergence) continue;
    const teamIds = Array.from(teams).sort();
    results.push({ skill, teamIds, teamCount: teams.size });
  }

  // Sort by team count desc, then skill name asc — deterministic tiebreak.
  results.sort((a, b) => {
    if (b.teamCount !== a.teamCount) return b.teamCount - a.teamCount;
    return a.skill.localeCompare(b.skill);
  });

  return results.slice(0, maxFocuses);
}

// ─── Ticket 0075 — cross-program (sport-wide) emergent focus ───────────────
//
// Pure helper that walks a sport's recent practice plans and surfaces ONE
// skill that 3+ DISTINCT PROGRAMS (orgs) have organically targeted in the
// same window. This is the COACH-side CROSS-PROGRAM counterpart to the 0071
// director-side IN-PROGRAM signal (which keys on team_id within a single
// org). The compounding dynamic: 0071 surfaces convergence to a director;
// THIS surfaces convergence to every coach in the sport, at the moment they
// open Capture.
//
// Per LESSONS#0103 — this helper is ADDITIVE. The existing
// `computeEmergentFocus` and its 0071 callers stay BYTE-IDENTICAL: zero
// changes to that function's signature, defaults, or call paths.
//
// Reads no DB. Writes no AI. The caller (the /api/sport/emergent-focus
// route) is responsible for the EXCLUDE-OWN-ORG contract — this helper just
// dedupes on the `org_id` it is given.

/** Minimal plan-row shape for the cross-program aggregator. Each plan
 *  carries the ORG that owns the team that owns the plan; cross-program
 *  dedup is on `org_id` (a program), NOT `team_id`. The route resolves
 *  team→org via a join before handing rows to this helper. */
export interface CrossProgramPlanRow {
  org_id: string;
  skills_targeted: string[] | null;
  created_at: string;
}

/** Surfaceable record: a skill 3+ distinct orgs rallied around + the org ids
 *  that did so (the route uses orgIds.length as `distinctProgramCount`). */
export interface CrossProgramEmergentFocus {
  skill: string;
  orgIds: string[];
  distinctProgramCount: number;
}

export interface CrossProgramComputeOpts {
  /** Minimum DISTINCT orgs that must target the skill — default 3 (the
   *  ticket's cross-program scarcity bar; below that, silence). */
  minPrograms?: number;
  /** Window of plans to consider — default 14 days (matches 0071's window
   *  so the two surfaces share a temporal frame). */
  windowDays?: number;
  /** Hard cap on returned focuses — default 1 (the Capture surface renders
   *  AT MOST ONE line; multi-focus is explicitly out-of-scope per the
   *  ticket's Out-of-scope section). */
  maxFocuses?: number;
}

const CP_DEFAULTS: Required<CrossProgramComputeOpts> = {
  minPrograms: 3,
  windowDays: 14,
  maxFocuses: 1,
};

/**
 * Aggregate plan-level `skills_targeted` across DISTINCT orgs. Returns the
 * top `maxFocuses` skills that ≥ `minPrograms` distinct orgs have targeted
 * inside the last `windowDays` days, sorted by program count descending,
 * then skill name ascending for a deterministic tiebreak.
 *
 * The caller is responsible for the EXCLUDE-OWN-ORG contract — this helper
 * just dedupes on the `org_id` it is given. Pass in plans from teams whose
 * `org_id !== caller's org`.
 */
export function computeCrossProgramEmergentFocus(
  plans: CrossProgramPlanRow[],
  opts: CrossProgramComputeOpts = {}
): CrossProgramEmergentFocus[] {
  const { minPrograms, windowDays, maxFocuses } = { ...CP_DEFAULTS, ...opts };

  if (!Array.isArray(plans) || plans.length === 0) return [];

  const windowStart = Date.now() - windowDays * DAY_MS;

  // skill → set of org_ids that targeted it in-window.
  const bySkill = new Map<string, Set<string>>();

  for (const plan of plans) {
    if (!plan || !plan.org_id || !plan.skills_targeted) continue;
    const ts = Date.parse(plan.created_at);
    if (!Number.isFinite(ts) || ts < windowStart) continue;

    // An org is unioned ONCE per skill, even if 5 of its teams ran 5 plans.
    for (const rawSkill of plan.skills_targeted) {
      if (typeof rawSkill !== 'string') continue;
      const skill = rawSkill.trim();
      if (!skill) continue;
      let orgs = bySkill.get(skill);
      if (!orgs) {
        orgs = new Set<string>();
        bySkill.set(skill, orgs);
      }
      orgs.add(plan.org_id);
    }
  }

  const results: CrossProgramEmergentFocus[] = [];
  for (const [skill, orgs] of bySkill.entries()) {
    if (orgs.size < minPrograms) continue;
    const orgIds = Array.from(orgs).sort();
    results.push({ skill, orgIds, distinctProgramCount: orgs.size });
  }

  // Sort by program count desc, then skill name asc.
  results.sort((a, b) => {
    if (b.distinctProgramCount !== a.distinctProgramCount) {
      return b.distinctProgramCount - a.distinctProgramCount;
    }
    return a.skill.localeCompare(b.skill);
  });

  return results.slice(0, maxFocuses);
}
