// ─── Ticket 0090 — program-drill-canon helper ───────────────────────────────
//
// Pure helper. Given (a) the union of in-program coaches' thumbed-up drill
// signal rows (the existing 0039 cross-team drill-thumb persistence —
// schema-wins-over-prose deviation per LESSONS#0096; the actual table is
// `coach_drill_signals` from migration 040, filtered by `rating='up'`)
// and (b) the drills metadata for those drill_ids, returns the drills
// thumbed by AT LEAST `minCoaches` (default 3) DISTINCT coaches in the
// program, sorted by coach count descending then drill name ascending
// (deterministic on ties), capped at `maxDrills` (default 10).
//
// Reads no DB. Writes no AI. Mirrors `src/lib/program-tier-state.ts`
// (0087), `src/lib/coach-reputation-utils.ts` (0073) — a small pure
// module with one exported function the route + the component test +
// the e2e seed all pin without a Supabase mock.
//
// Voice posture (LESSONS#0023): the helper output is numbers + ids +
// first names + structural drill metadata; the rendered string carries
// no AGENTS.md banned word. The card jsdoc instructs positively in the
// surrounding component.
//
// LESSONS#0061 — literal-space defensive surname scan on first names.
// LESSONS#0070 — never mutate the input arrays.

/** Default minimum number of DISTINCT coaches required for a drill to
 *  enter the canon. The director can publish below this floor only by
 *  taking the manual-edit path — the threshold is the structural truth
 *  the route enforces, the canon is the deterministic readout. */
const DEFAULT_MIN_COACHES = 3;

/** Default cap on the canon size. The card never scrolls; even when 30
 *  drills qualify, the top 10 by coach count are the canon. */
const DEFAULT_MAX_DRILLS = 10;

/** Cap on the per-drill rendered first-names list. The card surfaces
 *  the top 4 contributing coaches by input order — over 4 we silently
 *  truncate so the line stays a single visual row. */
const MAX_FIRST_NAMES_PER_DRILL = 4;

/** One row from the union of in-program coaches' `coach_drill_signals`
 *  with `rating='up'`. The caller joins to `coaches.full_name` and
 *  splits the FIRST literal-space token off as the coach_first_name. */
export interface CoachThumbRow {
  coach_id: string;
  coach_first_name: string;
  drill_id: string;
}

/** Minimal drill metadata the canon entry carries. `sport_id` and
 *  `age_groups` ride along so the inheritance edge on a new coach can
 *  scope the new coach's library to the program's seeded shape. */
export interface DrillRow {
  id: string;
  name: string;
  sport_id: string;
  age_groups: string[];
}

/** One drill in the canon. The card renders this exactly. */
export interface ProgramDrillCanonEntry {
  drillId: string;
  drillName: string;
  /** DISTINCT coach count for the drill across the program. */
  coachCount: number;
  /** First names of contributing coaches, capped at
   *  `MAX_FIRST_NAMES_PER_DRILL`. Surname-stripped per LESSONS#0061. */
  coachFirstNames: string[];
  sport_id: string;
  age_groups: string[];
}

export interface ProgramDrillCanonArgs {
  coachThumbRows: CoachThumbRow[];
  drillRows: DrillRow[];
  /** Default 3. The route enforces the same floor server-side. */
  minCoaches?: number;
  /** Default 10. The card renders this many rows max. */
  maxDrills?: number;
}

export interface ProgramDrillCanonResult {
  drills: ProgramDrillCanonEntry[];
  /** Distinct coaches who contributed AT LEAST one thumb to AT LEAST
   *  one drill that entered the canon. Surfaces on the card as
   *  "{N} coaches contributed". */
  totalCoachesContributing: number;
}

/**
 * Aggregate the program's drill thumb signal into the canon shape.
 *
 * Pure: deterministic, no I/O, never mutates the input arrays.
 *
 * Steps:
 *  (1) Group `coachThumbRows` by `drill_id`, accumulating the DISTINCT
 *      set of coach_ids per drill (a duplicate (coach,drill) row does
 *      not inflate the count — LESSONS#0072 / #0080 family).
 *  (2) Filter to drills with `coachCount >= minCoaches`.
 *  (3) Join each surviving drill to `drillRows` by id; drop drills
 *      whose metadata is missing (defensive).
 *  (4) Sort by coachCount descending, then drillName ascending for
 *      deterministic tie-breaking.
 *  (5) Cap at `maxDrills`.
 *  (6) For each entry, take the first names of the contributing
 *      coaches in INPUT order (the order they appeared in
 *      `coachThumbRows`) and cap at `MAX_FIRST_NAMES_PER_DRILL`,
 *      surname-stripping each via a literal-space split (LESSONS#0061).
 */
export function computeProgramDrillCanon(
  args: ProgramDrillCanonArgs,
): ProgramDrillCanonResult {
  const {
    coachThumbRows,
    drillRows,
    minCoaches = DEFAULT_MIN_COACHES,
    maxDrills = DEFAULT_MAX_DRILLS,
  } = args;

  if (!Array.isArray(coachThumbRows) || coachThumbRows.length === 0) {
    return { drills: [], totalCoachesContributing: 0 };
  }
  if (!Array.isArray(drillRows) || drillRows.length === 0) {
    return { drills: [], totalCoachesContributing: 0 };
  }

  // (1) Group by drill_id with DISTINCT coach_id sets. The
  //     per-drill first-names list preserves input order so the
  //     rendered output is deterministic across runs.
  const coachSetsByDrill = new Map<string, Set<string>>();
  const namesByDrill = new Map<string, string[]>();
  for (const row of coachThumbRows) {
    if (!row || typeof row.coach_id !== 'string' || typeof row.drill_id !== 'string') {
      continue;
    }
    const drillId = row.drill_id;
    let coachSet = coachSetsByDrill.get(drillId);
    if (!coachSet) {
      coachSet = new Set<string>();
      coachSetsByDrill.set(drillId, coachSet);
      namesByDrill.set(drillId, []);
    }
    if (coachSet.has(row.coach_id)) continue;
    coachSet.add(row.coach_id);
    // Strip surname via literal space (LESSONS#0061).
    const rawName = typeof row.coach_first_name === 'string' ? row.coach_first_name.trim() : '';
    const spaceIdx = rawName.indexOf(' ');
    const first = spaceIdx === -1 ? rawName : rawName.slice(0, spaceIdx);
    if (first) {
      namesByDrill.get(drillId)!.push(first);
    }
  }

  // (2) + (3) Filter + join. Drills without a drillRows entry are
  //     dropped silently (defensive — a stale signal row pointing at
  //     a removed drill never makes the canon).
  const drillById = new Map<string, DrillRow>();
  for (const d of drillRows) {
    if (d && typeof d.id === 'string') drillById.set(d.id, d);
  }

  const candidates: ProgramDrillCanonEntry[] = [];
  for (const [drillId, coachSet] of coachSetsByDrill.entries()) {
    const coachCount = coachSet.size;
    if (coachCount < minCoaches) continue;
    const drill = drillById.get(drillId);
    if (!drill) continue;
    const names = namesByDrill.get(drillId) ?? [];
    candidates.push({
      drillId,
      drillName: drill.name,
      coachCount,
      coachFirstNames: names.slice(0, MAX_FIRST_NAMES_PER_DRILL),
      sport_id: drill.sport_id,
      // Defensive shallow copy so the helper never returns a reference
      // into the caller's input array (LESSONS#0070).
      age_groups: Array.isArray(drill.age_groups) ? [...drill.age_groups] : [],
    });
  }

  // (4) Sort: coachCount desc, then drillName asc for determinism.
  candidates.sort((a, b) => {
    if (b.coachCount !== a.coachCount) return b.coachCount - a.coachCount;
    return a.drillName.localeCompare(b.drillName);
  });

  // (5) Cap.
  const drills = candidates.slice(0, maxDrills);

  // (6) Distinct contributing coaches across the surviving drills.
  const contributingCoachIds = new Set<string>();
  const drillIdSet = new Set(drills.map((d) => d.drillId));
  for (const row of coachThumbRows) {
    if (!row || typeof row.coach_id !== 'string') continue;
    if (drillIdSet.has(row.drill_id)) {
      contributingCoachIds.add(row.coach_id);
    }
  }

  return {
    drills,
    totalCoachesContributing: contributingCoachIds.size,
  };
}

/** Exported for the route / component tier-gate so the two never drift. */
export const PROGRAM_DRILL_CANON_DEFAULTS = {
  minCoaches: DEFAULT_MIN_COACHES,
  maxDrills: DEFAULT_MAX_DRILLS,
  maxFirstNamesPerDrill: MAX_FIRST_NAMES_PER_DRILL,
} as const;
