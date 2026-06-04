/**
 * Ticket 0066 — pure helpers behind the second-week parent-report safety net.
 *
 * The parent-report route uses these to decide whether to BRANCH the prompt
 * into a thin-week shape (artifact >= 2, fewer than 4 new observations since
 * the last report, last report within 21 days) and, if the AI's output trips
 * the banned-word scan, to render a coach-clipboard plain fallback paragraph
 * WITHOUT a second AI call. Both helpers are PURE — no DB access, no clock
 * reads, no I/O — so the route is the only place the three inputs get
 * resolved.
 *
 * Voice POSITIVELY per LESSONS#0023 — banned tokens are NEVER enumerated in
 * the template body. The scan + banned-word fallback live in the route; this
 * module only provides the deterministic template.
 */

export const THIN_WEEK_THRESHOLDS = {
  /** Smallest artifact count that can be a "second+" report. */
  minArtifactCount: 2,
  /** Strictly-less-than this many new observations in the window = thin. */
  thinObservationCount: 4,
  /**
   * Inclusive upper bound on days since the last report. Past this, the
   * scenario is a cross-season catch-up (0034 territory), not a thin week.
   */
  maxDaysSinceLastReport: 21,
} as const;

export interface ThinWeekDetectionInput {
  /**
   * The number of parent reports the player will have AFTER the route
   * finishes generating the next one. The route computes this as
   * `existing_parent_reports_for_player + 1` so the first-ever report is
   * always artifactCount = 1.
   */
  artifactCount: number;
  /**
   * Count of NEW observations on the player since the previous parent
   * report's `created_at` (or all observations, if there is no prior).
   */
  newObservationCount: number;
  /**
   * Whole-day distance from the previous report's `created_at` to now.
   * Routes can floor a fractional duration; the helper accepts any number
   * and compares against the constant.
   */
  daysSinceLastReport: number;
}

export function isThinSecondPlusReport(input: ThinWeekDetectionInput): boolean {
  const { artifactCount, newObservationCount, daysSinceLastReport } = input;
  if (artifactCount < 0 || newObservationCount < 0 || daysSinceLastReport < 0) {
    return false;
  }
  if (artifactCount < THIN_WEEK_THRESHOLDS.minArtifactCount) return false;
  if (newObservationCount >= THIN_WEEK_THRESHOLDS.thinObservationCount) return false;
  if (daysSinceLastReport > THIN_WEEK_THRESHOLDS.maxDaysSinceLastReport) return false;
  return true;
}

export interface ThinWeekFallbackInput {
  /**
   * The player's FIRST name only (per COPPA — same constraint the route
   * already applies on the input edge).
   */
  playerFirstName: string;
  /**
   * Three coach-named focus areas from the previous report — the strings the
   * route derives from the previous report's existing structure (its
   * `skill_progress[].skill_name`, `highlights[]`, or `coach_note`). Up to
   * three are rendered.
   */
  previousCommitments: string[];
  /**
   * Coach-authored short observation strings from this window that touch the
   * same skill families. Empty means "zero carry-forward" — the template
   * falls back to the single honest sentence.
   */
  carryForwardObservations: string[];
  /** What the report points the parent at for next time. */
  upcomingFocus: string;
}

/**
 * Coach-clipboard plain rendering of the thin-week paragraph. Used by the
 * route ONLY when the AI's output trips the banned-word scan — the template
 * is deterministic, free of breathless tokens, and grounded entirely in the
 * structured inputs the route already has.
 *
 * Voice POSITIVELY per LESSONS#0023: short opening that names the lighter
 * week, one short paragraph anchored to the previous report's focus and what
 * carried forward, one line on what we're watching next. Zero carry-forward
 * falls back to one honest sentence + the watching-next line so the parent
 * still gets a real artifact.
 */
export function renderThinWeekFallback(input: ThinWeekFallbackInput): string {
  const { playerFirstName, previousCommitments, carryForwardObservations, upcomingFocus } = input;

  // Zero-carry-forward path: one honest sentence + watching-next line.
  if (carryForwardObservations.length === 0) {
    const honest = `${playerFirstName} didn't get much on-court time this week.`;
    const watching = `We're watching ${upcomingFocus}.`;
    return [honest, watching].join(' ');
  }

  // Standard thin-week paragraph.
  const opener = `This was a lighter week for ${playerFirstName}.`;
  const commits = previousCommitments.slice(0, 3);
  const carry = carryForwardObservations.slice(0, 2);

  const carryLine = commits.length > 0
    ? `From what we told you last time — ${commits.join(', ')} — here's what carried forward: ${carry.join('; ')}.`
    : `Here's what carried forward this week: ${carry.join('; ')}.`;

  const watching = `What we're watching next: ${upcomingFocus}.`;

  return [opener, carryLine, watching].join(' ');
}

/**
 * The AGENTS.md banned tokens, exposed for the route's rendered-output scan.
 * Defined here (not enumerated in the prompt body) so the prompt itself
 * never trips its own scan — LESSONS#0023's documented trap.
 */
export const PARENT_REPORT_BANNED_TOKENS = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
] as const;

/**
 * True if the rendered-text body contains ANY banned token. Case-insensitive
 * substring scan; the caller decides what to do with the boolean (the route
 * falls back to `renderThinWeekFallback`).
 */
export function containsBannedToken(s: string): boolean {
  const lower = s.toLowerCase();
  for (const t of PARENT_REPORT_BANNED_TOKENS) {
    if (lower.includes(t)) return true;
  }
  return false;
}
