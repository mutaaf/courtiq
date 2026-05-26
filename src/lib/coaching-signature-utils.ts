// ─── Ticket 0037 — coaching-signature helpers ────────────────────────────────────
//
// A pure builder that derives a compact "coaching signature" from a coach's OWN
// persisted `plans` rows (practice plans + practice arcs) across ALL their teams:
// the focus areas they keep coming back to, the drills they reuse, and the session
// length they typically run. Threaded into the practice-plan and practice-arc
// prompts as a SOFT preference so generated plans sound like the practices this
// coach actually runs — without a settings form, learned from what they generated.
//
// This is the unit-testable core (mirrors the pure-helper pattern of
// src/lib/season-momentum-utils.ts). It reads ONLY `plans`-derived fields —
// `skills_targeted` and drill/warmup NAMES from `content_structured`. It never
// touches a `players` row or per-child observation text, so the signature can
// carry no minor data (COPPA / data minimization). The route fetches the coach's
// own rows (scoped `eq('coach_id', coachId)`) and passes them here.

/** The minimal `plans` shape the builder reads. Aggregate plan content only. */
export interface CoachPlanRow {
  type?: string | null;
  skills_targeted?: string[] | null;
  content_structured?: unknown;
}

/** The compact, prompt-safe summary threaded into the plan/arc prompts. */
export interface CoachingSignature {
  /** The coach's most-frequent focus areas, ranked, capped. */
  top_skills: string[];
  /** Drill names the coach reuses across plans, ranked by recurrence, capped. */
  recurring_drills: string[];
  /** The session length the coach typically runs (minutes). */
  typical_session_minutes: number;
}

/** A coach needs at least this many plans before we infer a personal style. */
export const MIN_PLANS_FOR_SIGNATURE = 5;
/** Bound the lists so the prompt block stays small. */
export const MAX_SIGNATURE_SKILLS = 5;
export const MAX_SIGNATURE_DRILLS = 6;

/** A drill name is only "recurring" once it shows up in at least this many plans. */
const MIN_DRILL_RECURRENCE = 2;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A drill/warmup name is usable signal only if it is a non-trivial string. */
function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > 80) return null;
  return t;
}

/**
 * Collect drill + warmup names from one plan's `content_structured`. Handles both
 * shapes deliberately: a practice plan (`warmup.name`, `drills[].name`) and a
 * practice arc (`sessions[].warmup.name`, `sessions[].drills[].name`). Reads ONLY
 * those name fields — never any other key on the structured content — so no minor
 * data a malformed row might carry can leak through.
 */
function namesFromContent(content: unknown): string[] {
  const names: string[] = [];
  if (!isRecord(content)) return names;

  const collectDrillBlock = (block: Record<string, unknown>) => {
    const warmup = block.warmup;
    if (isRecord(warmup)) {
      const n = cleanName(warmup.name);
      if (n) names.push(n);
    }
    const drills = block.drills;
    if (Array.isArray(drills)) {
      for (const d of drills) {
        if (isRecord(d)) {
          const n = cleanName(d.name);
          if (n) names.push(n);
        }
      }
    }
  };

  // Practice-plan shape: top-level warmup + drills.
  collectDrillBlock(content);

  // Practice-arc shape: warmup + drills nested under each session.
  const sessions = content.sessions;
  if (Array.isArray(sessions)) {
    for (const s of sessions) {
      if (isRecord(s)) collectDrillBlock(s);
    }
  }

  return names;
}

/** Pull a session length (minutes) from a plan's structured content, if present. */
function durationFromContent(content: unknown): number | null {
  if (!isRecord(content)) return null;
  const top = content.duration_minutes;
  if (typeof top === 'number' && top > 0) return top;
  // Practice arc: use the first session's duration as the representative length.
  const sessions = content.sessions;
  if (Array.isArray(sessions)) {
    for (const s of sessions) {
      if (isRecord(s) && typeof s.duration_minutes === 'number' && s.duration_minutes > 0) {
        return s.duration_minutes;
      }
    }
  }
  return null;
}

/** Rank entries of a count map by frequency (desc), tie-broken by name for stability. */
function rankByCount(counts: Map<string, number>, minCount: number, cap: number): string[] {
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, cap)
    .map(([name]) => name);
}

/**
 * Ticket 0039 — one of the coach's server-side drill signals (a thumbs-up /
 * thumbs-down on a drill, with the lifetime run count). The 0037 signature
 * extension uses these to RE-RANK `recurring_drills` so an upvoted drill
 * outweighs a high-frequency-but-downvoted one. The signal carries no
 * `team_id`, no player reference, no observation text — only what was needed
 * to rank a drill the coach already chose to run.
 */
export interface CoachDrillRatingInput {
  /** Drill identifier — matches the `drills.id` UUID used in the picker. */
  drill_id: string;
  rating: 'up' | 'down';
  /** Best-effort lifetime count of times the coach has run this drill. */
  run_count: number;
}

/** Optional 0039 inputs threaded alongside the 0037 plans-based history. */
export interface BuildCoachingSignatureOptions {
  /**
   * The coach's own drill signals. When omitted, `buildCoachingSignature`
   * returns BYTE-IDENTICAL output to the original single-argument call so the
   * existing fixture stays a regression pin (LESSONS#39: assert the real
   * contract for cold callers). When provided, the helper re-ranks
   * `recurring_drills`: upvoted drills float up, downvoted drills are
   * suppressed, ties broken by `run_count`.
   *
   * The signals are keyed by `drill_id`, but the 0037 signature stores drill
   * NAMES (the names from `content_structured`). The optional `drill_id_by_name`
   * map (a coach-scoped lookup the route assembles alongside the signals
   * fetch) lets the re-rank match the two surfaces without changing the
   * existing plan-derived data path. When the map is missing or a name has no
   * id entry, that drill stays in its frequency-only position — the re-rank
   * is best-effort, never a regression.
   */
  drillSignals?: CoachDrillRatingInput[];
  /** Optional name → drill_id lookup so signals (by id) align with names. */
  drill_id_by_name?: Record<string, string>;
}

/**
 * Build a coaching signature from the coach's own plans. Returns `null` for a
 * cold-start coach (fewer than MIN_PLANS_FOR_SIGNATURE rows) OR when the rows
 * carry no usable plan signal — in which case the caller threads no block and the
 * generated plan/arc is byte-identical to today's behavior.
 *
 * Ticket 0039 added the optional second argument. When `drillSignals` is
 * omitted (or undefined), the function's output is byte-identical to the
 * original single-argument 0037 implementation — the existing snapshot test
 * pins this. When `drillSignals` is provided, `recurring_drills` is RE-RANKED
 * using the coach's own ratings: up-rated drills outweigh frequency-only
 * matches, down-rated drills are suppressed from the list.
 */
export function buildCoachingSignature(
  plans: CoachPlanRow[],
  options?: BuildCoachingSignatureOptions,
): CoachingSignature | null {
  if (!Array.isArray(plans) || plans.length < MIN_PLANS_FOR_SIGNATURE) return null;

  const skillCounts = new Map<string, number>();
  const drillCounts = new Map<string, number>();
  const durations: number[] = [];

  for (const plan of plans) {
    // Focus areas the coach targeted (count per plan, not per repetition within one).
    const skills = Array.isArray(plan.skills_targeted) ? plan.skills_targeted : [];
    const seenSkills = new Set<string>();
    for (const s of skills) {
      const n = cleanName(s);
      if (n && !seenSkills.has(n)) {
        seenSkills.add(n);
        skillCounts.set(n, (skillCounts.get(n) ?? 0) + 1);
      }
    }

    // Drill names (count once per plan so a single plan listing a drill twice
    // doesn't masquerade as recurrence across the coach's history).
    const drillNames = namesFromContent(plan.content_structured);
    const seenDrills = new Set<string>();
    for (const d of drillNames) {
      if (!seenDrills.has(d)) {
        seenDrills.add(d);
        drillCounts.set(d, (drillCounts.get(d) ?? 0) + 1);
      }
    }

    const dur = durationFromContent(plan.content_structured);
    if (dur != null) durations.push(dur);
  }

  const top_skills = rankByCount(skillCounts, 1, MAX_SIGNATURE_SKILLS);
  // Prefer drills that recur; if none recur, fall back to the most-used single ones
  // so a coach with varied-but-real plans still gets a small drill signal.
  let recurring_drills = rankByCount(drillCounts, MIN_DRILL_RECURRENCE, MAX_SIGNATURE_DRILLS);
  if (recurring_drills.length === 0) {
    recurring_drills = rankByCount(drillCounts, 1, MAX_SIGNATURE_DRILLS);
  }

  // Ticket 0039 — re-rank `recurring_drills` using the coach's own thumbs-up /
  // thumbs-down. The signature's drill list is by NAME, the signals are by id;
  // when an id↔name map is available (the route assembles it from `drills`),
  // the re-rank uses that mapping. When the map is missing, names match the
  // signals by direct id-equality (some surfaces store ids as names) — and
  // when neither matches, the frequency-only order from above is preserved
  // (best-effort: an up-rate that we cannot identify is never an error).
  if (options?.drillSignals && options.drillSignals.length > 0) {
    recurring_drills = applyDrillSignalRerank(
      recurring_drills,
      drillCounts,
      options.drillSignals,
      options.drill_id_by_name,
      MAX_SIGNATURE_DRILLS,
    );
  }

  // No honest signal to offer → no signature (the caller degrades to today).
  if (top_skills.length === 0 && recurring_drills.length === 0) return null;

  return {
    top_skills,
    recurring_drills,
    typical_session_minutes: typicalSessionMinutes(durations),
  };
}

/**
 * Re-rank the frequency-derived `recurring_drills` list using the coach's
 * thumbs-up / thumbs-down. Upvoted drills float up (the coach picked them and
 * keeps liking them), downvoted drills are dropped from the list (a clear
 * negative preference outweighs frequency), and unrated drills keep their
 * frequency order. Up-rated drills the coach has NOT yet folded into recurring
 * plans are surfaced into the list when there is room (capped to the bound)
 * so a coach's preference can compound into future plans even before the
 * frequency-based signal would catch up.
 *
 * Ties between two up-rated drills break on `run_count` desc (the coach has
 * actually used the drill more), then on the original recurrence position so
 * the order stays stable for the same inputs.
 */
function applyDrillSignalRerank(
  baseRecurring: string[],
  drillCounts: Map<string, number>,
  drillSignals: CoachDrillRatingInput[],
  drillIdByName: Record<string, string> | undefined,
  cap: number,
): string[] {
  // Resolve each signal id to a drill NAME the signature uses. If the route
  // didn't supply a map, fall back to a direct id-match (some surfaces store
  // ids as the name) — best-effort, never an error.
  const nameById = new Map<string, string>();
  if (drillIdByName) {
    for (const [name, id] of Object.entries(drillIdByName)) {
      if (typeof name === 'string' && typeof id === 'string') nameById.set(id, name);
    }
  }

  const ratingByName = new Map<string, 'up' | 'down'>();
  const runCountByName = new Map<string, number>();
  for (const s of drillSignals) {
    if (!s || typeof s.drill_id !== 'string') continue;
    const name = nameById.get(s.drill_id) ?? s.drill_id;
    ratingByName.set(name, s.rating);
    if (typeof s.run_count === 'number' && s.run_count >= 0) {
      runCountByName.set(name, s.run_count);
    }
  }

  // Drop downvoted entries from the base list entirely.
  const survivors = baseRecurring.filter((n) => ratingByName.get(n) !== 'down');

  // Pull in up-rated drills that aren't already in the list. They join with
  // priority over unrated survivors (sorted by run_count desc, then name asc
  // for determinism — same stability the frequency ranking uses).
  const present = new Set(survivors);
  const extras: string[] = [];
  for (const [name, rating] of ratingByName.entries()) {
    if (rating === 'up' && !present.has(name)) extras.push(name);
  }
  extras.sort((a, b) => {
    const ra = runCountByName.get(a) ?? 0;
    const rb = runCountByName.get(b) ?? 0;
    if (rb !== ra) return rb - ra;
    return a.localeCompare(b);
  });

  // Promote upvoted-from-list entries to the front, in their original order
  // (the frequency ranking already established stability); unrated stay after;
  // then append the up-rated extras until the cap.
  const upInList: string[] = survivors.filter((n) => ratingByName.get(n) === 'up');
  const neutralInList: string[] = survivors.filter((n) => !ratingByName.has(n));
  // Up-rated drills the coach has actually USED more often outrank lower-use
  // ones; ties keep their frequency-derived order (drillCounts handles that).
  upInList.sort((a, b) => {
    const ra = runCountByName.get(a) ?? drillCounts.get(a) ?? 0;
    const rb = runCountByName.get(b) ?? drillCounts.get(b) ?? 0;
    if (rb !== ra) return rb - ra;
    return 0;
  });

  return [...upInList, ...neutralInList, ...extras].slice(0, cap);
}

/** The most common session length, falling back to a sensible 60-minute default. */
function typicalSessionMinutes(durations: number[]): number {
  if (durations.length === 0) return 60;
  const counts = new Map<number, number>();
  for (const d of durations) counts.set(d, (counts.get(d) ?? 0) + 1);
  // Most frequent wins; ties resolve to the shorter length (the more conservative
  // representative of "what this coach usually runs").
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}
