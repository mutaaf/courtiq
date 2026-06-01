/**
 * Ticket 0061 — pure helpers for the player-trajectory route.
 *
 * Pulled out of the route for unit-testability (LESSONS#0060 pattern — extract
 * preview-building logic into pure helpers). NONE of these functions touch
 * the network or the DB.
 */

/** AGENTS.md banned tokens (the rendered-output scan).
 *  LESSONS#0023: the prompt instructs voice POSITIVELY; the render-time scan
 *  is the structural guarantee the AC requires.
 */
export const TRAJECTORY_BANNED_WORDS = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
] as const;

export function containsBannedWord(text: string): boolean {
  const lower = text.toLowerCase();
  return TRAJECTORY_BANNED_WORDS.some((b) => lower.includes(b));
}

/** First-name boundary filter (COPPA). The route NEVER threads a last name
 *  or parent contact into the AI prompt. */
export function firstNameOf(fullName: string): string {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'this player';
  const token = trimmed.split(/\s+/)[0];
  return token || 'this player';
}

/** bucket = floor(observationCount / 3) * 3.
 *  Cache stays valid until the player accrues three more observations. */
export function observationBucket(observationCount: number): number {
  return Math.floor(observationCount / 3) * 3;
}

/** The structured fields the prompt receives — text, sentiment, category,
 *  skill_id, observed_at. NO player_id, NO team_id, NO parent contact. */
export interface TrajectoryPromptObservation {
  id: string;
  text: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  category: string;
  skill_id: string | null;
  observed_at: string;
}

/** The DB row shape the route reads from `observations` (it has many more
 *  columns; this helper picks the five the prompt needs). */
export interface ObservationRow {
  id: string;
  text: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  category: string;
  skill_id: string | null;
  created_at: string;
}

export function toPromptObservations(rows: ObservationRow[]): TrajectoryPromptObservation[] {
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    sentiment: r.sentiment,
    category: r.category,
    skill_id: r.skill_id,
    observed_at: r.created_at,
  }));
}

/** Minimum observations before a trajectory is rendered. Fewer than this,
 *  the UI suppresses the section ("come back after a few more practices"). */
export const MIN_OBSERVATIONS_FOR_TRAJECTORY = 4;

/** Free-tier preview window. One view per (coach, player) per 30 days. */
export const FREE_PREVIEW_WINDOW_DAYS = 30;

/** Weeks-observed display. Ceil the span from first observation to now in
 *  weeks, bounded by 1 below and by the season-length above. */
export function weeksObserved(firstObservedAt: string | null, nowMs = Date.now()): number {
  if (!firstObservedAt) return 0;
  const firstMs = new Date(firstObservedAt).getTime();
  if (!Number.isFinite(firstMs)) return 0;
  const elapsedMs = Math.max(0, nowMs - firstMs);
  const weeks = Math.ceil(elapsedMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, weeks);
}

/** The render-time fallback. When the AI output contains a banned word, the
 *  route swaps in a generic structured-language version anchored on the
 *  observation's sentiment + category (the AC: "an AI output containing a
 *  banned word falls back to a generic structured-language version"). */
export function fallbackSentence(
  kind: 'started' | 'now',
  playerFirstName: string,
  anchorCategory: string | null,
): string {
  const tail = anchorCategory ? ` on ${anchorCategory.toLowerCase()}` : '';
  if (kind === 'started') {
    return `${playerFirstName} started the season working${tail}.`;
  }
  return `${playerFirstName} now shows steady work${tail}.`;
}
