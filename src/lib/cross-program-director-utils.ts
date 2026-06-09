// ─── Ticket 0077 — director-side cross-program peer pulse ───────────────────
//
// Pure helper that walks the caller's program plans + the plans of OTHER
// programs in the same SPORT, computes each program's TOP skill emphasis in
// a 14-day window, and returns the set of neighboring programs whose top
// skill matches the caller's top skill. The director persona thinks in
// "what my program leaned into this week" — so the comparison is top-skill
// per program, not "skill targeted by N orgs" (that is the 0075 coach-side
// cross-program cut).
//
// Mirrors `src/lib/emergent-focus-utils.ts` (0071 in-program) and the
// cross-program sibling `computeCrossProgramEmergentFocus` (0075 coach
// surface). The director-side analogue: dedup key is `org_id` (a program);
// the comparison is TOP-SKILL-PER-PROGRAM (one signal per neighbor); the
// caller's OWN org is never counted; the cap is TWO neighbor programs
// (LESSONS#0103 — additive widening with a hard cap).
//
// Reads no DB. Writes no AI. The caller (the
// /api/program/cross-program-pulse route) is responsible for:
//   - resolving the caller's sport via teams.sport_id (organizations has
//     no sport_id column — schema wins over the ticket prose, LESSONS#0096)
//   - listing OTHER orgs in the same sport
//   - resolving the neighbor's director (first_name + email) via the
//     org's admin coach (the canonical director identity in this repo)
//
// Per LESSONS#0023 — numbers, not free text. Per LESSONS#0036 — best-effort
// downstream; the helper itself is total.

/** Minimal program-row shape the helper reads. `sport_id` scopes the
 *  comparison; `director_first_name`/`director_contact_email` ride
 *  through to the response so the UI can prefill the invite sheet. */
export interface DirectorPulseProgramRow {
  org_id: string;
  org_name: string;
  sport_id: string;
  director_first_name?: string;
  director_contact_email?: string;
}

/** Minimal plan-row shape for the cross-program director aggregator. The
 *  route resolves team→org via a join before handing rows to this
 *  helper, so each plan already carries its owning `org_id`. */
export interface DirectorPulsePlanRow {
  org_id: string;
  skills_targeted: string[] | null;
  created_at: string;
}

/** Surfaceable neighbor — the program name + the practice_count for the
 *  shared top skill + optional director attribution. */
export interface DirectorPulseNeighbor {
  org_id: string;
  org_name: string;
  practice_count: number;
  director_first_name?: string;
  director_contact_email?: string;
}

export interface ComputeDirectorPulseArgs {
  callerOrgId: string;
  callerSportId: string;
  programs: DirectorPulseProgramRow[];
  plans: DirectorPulsePlanRow[];
  /** Default 14 days — matches 0071/0075 windows. */
  windowDays?: number;
  /** Default 3 — minimum practices the neighbor must have on the shared
   *  top skill for it to surface. */
  minPracticesPerSkill?: number;
  /** Default 2 — the "we're both on this" scarcity bar. Below that, the
   *  helper returns an empty neighborPrograms array (silence beats nag). */
  minNeighborPrograms?: number;
  /** Required for deterministic windowing (the helper is pure). */
  nowMs: number;
}

export interface ComputeDirectorPulseResult {
  topSkill: string | null;
  neighborPrograms: DirectorPulseNeighbor[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_MIN_PRACTICES_PER_SKILL = 3;
const DEFAULT_MIN_NEIGHBOR_PROGRAMS = 2;
const MAX_NEIGHBOR_PROGRAMS = 2; // LESSONS#0103 — hard cap.

/**
 * Aggregate plan-level `skills_targeted` per PROGRAM and return the set of
 * neighboring programs whose top skill matches the caller's top skill.
 *
 * Deterministic across input order. Tie on `practice_count` breaks by
 * program name asc so the same input always produces the same result.
 *
 * Returns `{ topSkill: null, neighborPrograms: [] }` when:
 *   - the caller has zero qualifying plans in the window
 *   - fewer than `minNeighborPrograms` neighbors match the caller's top skill
 */
export function computeCrossProgramDirectorPulse(
  args: ComputeDirectorPulseArgs,
): ComputeDirectorPulseResult {
  const {
    callerOrgId,
    callerSportId,
    programs,
    plans,
    windowDays = DEFAULT_WINDOW_DAYS,
    minPracticesPerSkill = DEFAULT_MIN_PRACTICES_PER_SKILL,
    minNeighborPrograms = DEFAULT_MIN_NEIGHBOR_PROGRAMS,
    nowMs,
  } = args;

  if (!callerOrgId || !callerSportId) {
    return { topSkill: null, neighborPrograms: [] };
  }
  if (!Array.isArray(programs) || programs.length === 0) {
    return { topSkill: null, neighborPrograms: [] };
  }

  // Build the sport-scoped program directory keyed by org_id; the caller
  // is included so its plans are aggregated, but we filter it out of the
  // neighbor list at the end.
  const programsBySport = new Map<string, DirectorPulseProgramRow>();
  for (const p of programs) {
    if (!p || !p.org_id) continue;
    if (p.sport_id !== callerSportId) continue;
    programsBySport.set(p.org_id, p);
  }

  // The caller's OWN program must be in the sport — otherwise we have no
  // top skill to compare against. (The route already verified the
  // caller's org membership before calling here.)
  if (!programsBySport.has(callerOrgId)) {
    return { topSkill: null, neighborPrograms: [] };
  }

  const windowStart = nowMs - windowDays * DAY_MS;

  // org_id -> Map<skill, practice_count>. We count EACH plan once per skill
  // (a plan that lists `['transitions', 'spacing']` counts toward both).
  // The director persona thinks in "what we leaned into this week" so the
  // dedup is plan-level, not team-level — one plan that touched the skill
  // counts as one practice.
  const skillCountsByOrg = new Map<string, Map<string, number>>();

  for (const plan of plans) {
    if (!plan || !plan.org_id || !Array.isArray(plan.skills_targeted)) continue;
    if (!programsBySport.has(plan.org_id)) continue; // out-of-sport bleed guard
    const ts = Date.parse(plan.created_at);
    if (!Number.isFinite(ts) || ts < windowStart) continue;

    let skillMap = skillCountsByOrg.get(plan.org_id);
    if (!skillMap) {
      skillMap = new Map<string, number>();
      skillCountsByOrg.set(plan.org_id, skillMap);
    }
    for (const rawSkill of plan.skills_targeted) {
      if (typeof rawSkill !== 'string') continue;
      const skill = rawSkill.trim();
      if (!skill) continue;
      skillMap.set(skill, (skillMap.get(skill) ?? 0) + 1);
    }
  }

  // The caller's top skill — most-touched skill across its plans in the
  // window. Tie breaks alphabetically for determinism.
  const callerCounts = skillCountsByOrg.get(callerOrgId);
  if (!callerCounts || callerCounts.size === 0) {
    return { topSkill: null, neighborPrograms: [] };
  }
  const callerTopSkill = topSkillOf(callerCounts);
  if (!callerTopSkill) {
    return { topSkill: null, neighborPrograms: [] };
  }

  // For each OTHER program in the same sport, compute its top skill and
  // (if it matches the caller's top skill) gather practice_count.
  const candidates: DirectorPulseNeighbor[] = [];
  for (const [orgId, skillMap] of skillCountsByOrg.entries()) {
    if (orgId === callerOrgId) continue;
    const neighborTop = topSkillOf(skillMap);
    if (!neighborTop) continue;
    if (neighborTop !== callerTopSkill) continue;
    const practiceCount = skillMap.get(callerTopSkill) ?? 0;
    if (practiceCount < minPracticesPerSkill) continue;
    const programRow = programsBySport.get(orgId);
    if (!programRow) continue;
    candidates.push({
      org_id: orgId,
      org_name: programRow.org_name,
      practice_count: practiceCount,
      director_first_name: programRow.director_first_name,
      director_contact_email: programRow.director_contact_email,
    });
  }

  if (candidates.length < minNeighborPrograms) {
    return { topSkill: callerTopSkill, neighborPrograms: [] };
  }

  // Deterministic sort: practice_count desc, then org_name asc.
  candidates.sort((a, b) => {
    if (b.practice_count !== a.practice_count) return b.practice_count - a.practice_count;
    return a.org_name.localeCompare(b.org_name);
  });

  return {
    topSkill: callerTopSkill,
    neighborPrograms: candidates.slice(0, MAX_NEIGHBOR_PROGRAMS),
  };
}

/**
 * Pick the top skill in a count map. Deterministic tiebreak: highest
 * count wins; equal counts break by skill name ascending. Returns null
 * for an empty map.
 */
function topSkillOf(counts: Map<string, number>): string | null {
  let topSkill: string | null = null;
  let topCount = -1;
  for (const [skill, count] of counts.entries()) {
    if (count > topCount || (count === topCount && topSkill && skill.localeCompare(topSkill) < 0)) {
      topSkill = skill;
      topCount = count;
    }
  }
  return topSkill;
}
