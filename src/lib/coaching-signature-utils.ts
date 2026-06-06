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
  /**
   * Ticket 0070 — short phrasings the coach has used across their OWN prior
   * `parent_report` plans, ranked by recurrence, capped at
   * MAX_SIGNATURE_VOICE_ANCHORS. Threaded into the parentReport prompt as a
   * SOFT preference so the generated report sounds like THIS coach's voice
   * across every team they have ever coached.
   *
   * Declared OPTIONAL per LESSONS#0103 so every existing call site (the 0037
   * practicePlan / practiceArc / pregame / newsletter / pulse routes) stays
   * byte-identical without a sweep. The builder always surfaces it as `[]`
   * when no `priorParentReports` are passed — the prompt's `.length > 0`
   * branch then evaluates false and the prompt body is byte-identical to the
   * post-0066 baseline.
   */
  voice_anchors?: string[];
}

/** A coach needs at least this many plans before we infer a personal style. */
export const MIN_PLANS_FOR_SIGNATURE = 5;
/** Bound the lists so the prompt block stays small. */
export const MAX_SIGNATURE_SKILLS = 5;
export const MAX_SIGNATURE_DRILLS = 6;
/**
 * Ticket 0070 — bound the voice-anchor list so the prompt block stays small.
 * Mirrors `MAX_SIGNATURE_DRILLS = 6`.
 */
export const MAX_SIGNATURE_VOICE_ANCHORS = 6;
/**
 * Ticket 0070 — a phrase is only a "voice anchor" once it shows up across at
 * least this many of the coach's own prior parent reports. Mirrors
 * `MIN_DRILL_RECURRENCE = 2`.
 */
export const MIN_VOICE_ANCHOR_RECURRENCE = 2;
/**
 * Ticket 0070 — cold-start cap: the coach needs at least this many prior
 * parent reports before voice-anchor extraction is meaningful. Fewer than this
 * → `voice_anchors: []` and the prompt branch falls back to the post-0066
 * byte-identical body.
 */
const MIN_PRIOR_REPORTS_FOR_VOICE = 3;
/** Voice-anchor phrases must be at least 8 characters (avoid noise like "great"). */
const MIN_VOICE_ANCHOR_LENGTH = 8;
/** Voice-anchor phrases cap at 80 characters (mirrors `cleanName` for drill names). */
const MAX_VOICE_ANCHOR_LENGTH = 80;

/**
 * Ticket 0070 — AGENTS.md banned tokens (mirrors the load-bearing list in
 * `src/lib/thin-week-utils.ts`). A phrase containing ANY of these is filtered
 * during extraction, so the prompt's soft-preference block can be instructed
 * positively (LESSONS#0023) — the block never re-enumerates the ban-list.
 *
 * Kept lowercase; the extractor compares against the phrase's lowercased form.
 */
const BANNED_VOICE_TOKENS = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

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
  /**
   * Ticket 0070 — the coach's OWN prior `parent_report`-typed plan rows across
   * ALL their teams. The builder walks each report's
   * `content_structured.highlights[]` array AND `content_structured.coach_note`
   * string, extracts short phrasings (8–80 chars), ranks by recurrence across
   * reports, and surfaces them as `voice_anchors` on the returned signature.
   *
   * When omitted (or fewer than MIN_PRIOR_REPORTS_FOR_VOICE rows), the
   * builder's output remains byte-identical to today's behavior (LESSONS#0103
   * optional widening); existing 0037 / 0039 callers that don't pass this
   * field get `voice_anchors: []` and otherwise unchanged output.
   *
   * The builder reads ONLY `content_structured.highlights` and
   * `content_structured.coach_note` — never `observations`, never any field
   * on the `players` row, never `parent_*`, never `date_of_birth`,
   * `medical_notes`, or any other minor data. The COPPA boundary is the same
   * as the 0037 plan-rows-in / signature-out contract (per the ticket).
   */
  priorParentReports?: CoachPlanRow[];
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

  // Ticket 0070 — extract voice anchors from the coach's OWN prior parent
  // reports. The widening is additive (LESSONS#0103): when no priorParentReports
  // are passed, voice_anchors surfaces as [] and every other key on the
  // returned signature is byte-identical to today's output. When ≥ MIN
  // reports are provided, the extractor walks the coach-authored fields and
  // ranks short phrasings by recurrence.
  const voice_anchors = extractVoiceAnchors(options?.priorParentReports ?? []);

  return {
    top_skills,
    recurring_drills,
    typical_session_minutes: typicalSessionMinutes(durations),
    voice_anchors,
  };
}

// ─── Ticket 0070 — voice-anchor extraction ────────────────────────────────────

/**
 * Walk the coach's OWN prior parent-report plan rows, extract short phrasings
 * the coach has used more than once, rank by recurrence across reports, cap at
 * MAX_SIGNATURE_VOICE_ANCHORS. Returns `[]` for the cold-start case (fewer
 * than MIN_PRIOR_REPORTS_FOR_VOICE rows) and for the no-recurrence case.
 *
 * Reads ONLY `content_structured.highlights[]` and `content_structured.coach_note`
 * — never any other key on the structured content, never any minor data the
 * row might carry alongside. The COPPA boundary is the same as the 0037
 * plan-rows-in / signature-out contract.
 *
 * Per LESSONS#0061 — surname-guard uses a LITERAL SPACE (not `\s+`) so a
 * labelled-key newline ("Maya\nAge group:") cannot false-positive as a
 * "FirstName LastName" pair.
 *
 * Per LESSONS#0023 — phrases containing AGENTS.md banned tokens are dropped
 * during extraction so the prompt's soft-preference block can be instructed
 * positively (never enumerates the ban-list).
 *
 * Per LESSONS#0034 — `--`-comment lines are stripped from any scanned
 * `coach_note` content before phrase extraction so documentation comments in
 * a coach's note never become voice anchors.
 *
 * Exported so the parent-report route (and tests) can derive a voice-only
 * signature without forcing the `plans`-based MIN_PLANS_FOR_SIGNATURE gate
 * (the prompt only consumes `voice_anchors` from the signature).
 */
export function extractVoiceAnchors(priorParentReports: CoachPlanRow[]): string[] {
  if (!Array.isArray(priorParentReports) || priorParentReports.length < MIN_PRIOR_REPORTS_FOR_VOICE) {
    return [];
  }

  const phraseCounts = new Map<string, number>();

  for (const report of priorParentReports) {
    const content = report?.content_structured;
    if (!isRecord(content)) continue;

    // Track phrases unique to THIS report so a single report mentioning the
    // same phrase twice doesn't masquerade as recurrence across reports
    // (mirrors the drill-recurrence semantics).
    const seenInThisReport = new Set<string>();

    // ── highlights[] : each entry is one candidate phrase ─────────────
    const highlights = (content as { highlights?: unknown }).highlights;
    if (Array.isArray(highlights)) {
      for (const raw of highlights) {
        if (typeof raw !== 'string') continue;
        const cleaned = cleanVoicePhrase(raw);
        if (!cleaned) continue;
        if (seenInThisReport.has(cleaned)) continue;
        seenInThisReport.add(cleaned);
        phraseCounts.set(cleaned, (phraseCounts.get(cleaned) ?? 0) + 1);
      }
    }

    // ── coach_note : split into sentences/lines, treat each as a candidate ────
    const coachNote = (content as { coach_note?: unknown }).coach_note;
    if (typeof coachNote === 'string' && coachNote.length > 0) {
      // Strip `--`-comment lines (LESSONS#0034) before phrase extraction.
      const noteWithoutComments = coachNote
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      // Split on sentence terminators + newlines so each candidate is a
      // self-contained short phrase.
      const fragments = noteWithoutComments.split(/[.!?\n]+/);
      for (const raw of fragments) {
        const cleaned = cleanVoicePhrase(raw);
        if (!cleaned) continue;
        if (seenInThisReport.has(cleaned)) continue;
        seenInThisReport.add(cleaned);
        phraseCounts.set(cleaned, (phraseCounts.get(cleaned) ?? 0) + 1);
      }
    }
  }

  // Rank by recurrence (desc), tie-broken by phrase (asc) for determinism.
  return [...phraseCounts.entries()]
    .filter(([, n]) => n >= MIN_VOICE_ANCHOR_RECURRENCE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_SIGNATURE_VOICE_ANCHORS)
    .map(([phrase]) => phrase);
}

/**
 * Normalize and validate a candidate voice-anchor phrase. Returns `null` for
 * any phrase that's too short, too long, contains a surname-shape, or carries
 * a banned token. The surname guard uses a LITERAL SPACE per LESSONS#0061.
 *
 * Returns the surname-stripped form on success: "Maya Walker is finding the
 * ball" → "Maya is finding the ball" (the surname-shape — a capitalized word
 * preceded by a single space and another capitalized word — is replaced with
 * just the first word). First names alone are kept because the phrase loses
 * meaning without them.
 */
function cleanVoicePhrase(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  // Strip outer whitespace and normalize repeated whitespace runs to single
  // spaces (preserves intentional content; we don't squash newlines because
  // candidates already arrived line-by-line / sentence-by-sentence).
  let phrase = raw.trim().replace(/[ \t]+/g, ' ');
  if (!phrase) return null;

  // Strip FirstName LastName pairs: a capitalized word followed by a LITERAL
  // SPACE followed by another capitalized word. Replace with just the first
  // capitalized word (the first name) so the phrase retains its subject. Per
  // LESSONS#0061 — using a LITERAL SPACE here (not `\s+`) so a labelled-key
  // newline like "Maya\nAge group:" cannot false-positive as "Maya Age".
  // Repeat to handle middle-name shapes (rare but possible).
  let prev: string;
  do {
    prev = phrase;
    phrase = phrase.replace(/([A-Z][a-z]+) ([A-Z][a-z]+)/g, '$1');
  } while (phrase !== prev);
  // Re-normalize whitespace introduced by replacement.
  phrase = phrase.replace(/[ \t]+/g, ' ').trim();

  if (phrase.length < MIN_VOICE_ANCHOR_LENGTH) return null;
  if (phrase.length > MAX_VOICE_ANCHOR_LENGTH) return null;

  // Banned-token pre-filter (LESSONS#0023). Lowercase comparison so case
  // variants (e.g. "Amazing!") are caught.
  const lowered = phrase.toLowerCase();
  for (const banned of BANNED_VOICE_TOKENS) {
    if (lowered.includes(banned)) return null;
  }

  return phrase;
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
