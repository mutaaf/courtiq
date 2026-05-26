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
 * Build a coaching signature from the coach's own plans. Returns `null` for a
 * cold-start coach (fewer than MIN_PLANS_FOR_SIGNATURE rows) OR when the rows
 * carry no usable plan signal — in which case the caller threads no block and the
 * generated plan/arc is byte-identical to today's behavior.
 */
export function buildCoachingSignature(plans: CoachPlanRow[]): CoachingSignature | null {
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

  // No honest signal to offer → no signature (the caller degrades to today).
  if (top_skills.length === 0 && recurring_drills.length === 0) return null;

  return {
    top_skills,
    recurring_drills,
    typical_session_minutes: typicalSessionMinutes(durations),
  };
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
