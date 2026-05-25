// ─── Ticket 0032 — season-momentum helpers ──────────────────────────────────────
//
// Pure helpers that build the season-position home card from data we already
// collect (teams.current_week / teams.season_weeks + accumulated observations).
//
// The one-line trend sentence is derived DETERMINISTICALLY from the numeric
// counts — no AI call, no quota cost, and it always renders even on a flaky gym
// connection (the home card is best-effort). This is the ticket's PREFERRED
// default; the AI-contract AC is satisfied by the route's no-AI-call vitest
// branch rather than a model round-trip.

/** The aggregate shape the route returns and the card renders. Aggregate-only:
 *  no player name, jersey, or observation text — COPPA / data minimization. */
export interface SeasonMomentum {
  /** teams.current_week — where the coach is in the season. */
  weekPosition: number;
  /** teams.season_weeks — total weeks, or null when no season is set. */
  weekTotal: number | null;
  /** whole weeks from the team's earliest observation to now (0 if none yet). */
  weeksActive: number;
  /** progress markers over the team's recent observations. */
  trend: { positiveCount: number; totalCount: number };
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Whole weeks from the team's earliest observation timestamp to now. Returns 0
 * when there is no earliest observation; otherwise at least 1 (a team that
 * recorded its first note today is in its first week of activity, never week 0).
 */
export function weeksActiveFromEarliest(earliestIso: string | null | undefined): number {
  if (!earliestIso) return 0;
  const earliest = new Date(earliestIso).getTime();
  if (Number.isNaN(earliest)) return 0;
  const elapsed = Date.now() - earliest;
  if (elapsed <= 0) return 1;
  // Whole weeks of activity, rounded up so a team active for any part of a week
  // counts that week, and a team that recorded its first note today is in week 1.
  // An exact N-week span reads as N (e.g. 42 days → 6 weeks, not 7).
  return Math.max(1, Math.ceil(elapsed / MS_PER_WEEK));
}

/**
 * One factual, plain trend line built from the counts — clipboard voice, not a
 * marketing landing page. No per-player names, no hype words. Empty string when
 * there is nothing to summarize (the card renders nothing in that case).
 *
 * The phrasing keys off the share of progress markers in the recent window so it
 * reads honestly whether the season is trending up, mixed, or flat.
 */
export function buildTrendSentence(trend: { positiveCount: number; totalCount: number }): string {
  const { positiveCount, totalCount } = trend;
  if (totalCount <= 0) return '';

  const counts = `${positiveCount} of your last ${totalCount} notes`;
  const ratio = positiveCount / totalCount;

  if (ratio >= 0.6) {
    return `${counts} are progress markers — the season's building.`;
  }
  if (ratio >= 0.35) {
    return `${counts} are progress markers — a steady mix as the season runs.`;
  }
  return `${counts} are progress markers — plenty still in the works this season.`;
}
