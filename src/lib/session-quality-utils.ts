/**
 * session-quality-utils.ts
 *
 * Pure utilities for the Session Quality Rating feature.
 * Coaches rate each session 1–5 stars. These functions compute
 * averages, trends, and distribution stats for the analytics view.
 */

export type QualityRating = 1 | 2 | 3 | 4 | 5;

export interface RatedSession {
  id: string;
  date: string;
  type: string;
  quality_rating: number | null;
}

export type QualityTrend = 'improving' | 'declining' | 'stable';

// ─── Validation ──────────────────────────────────────────────────────────────

export function isValidRating(v: unknown): v is QualityRating {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

// ─── Labels & Colours ────────────────────────────────────────────────────────

const RATING_LABELS: Record<QualityRating, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Great',
  5: 'Excellent',
};

export function getRatingLabel(rating: QualityRating): string {
  return RATING_LABELS[rating];
}

/** Tailwind text colour for a given rating (1 = red, 5 = emerald). */
export function getRatingColor(rating: number): string {
  if (rating >= 5) return 'text-emerald-400';
  if (rating >= 4) return 'text-green-400';
  if (rating >= 3) return 'text-amber-400';
  if (rating >= 2) return 'text-orange-400';
  return 'text-red-400';
}

/** Tailwind background colour for a given rating. */
export function getRatingBgColor(rating: number): string {
  if (rating >= 5) return 'bg-emerald-500/10';
  if (rating >= 4) return 'bg-green-500/10';
  if (rating >= 3) return 'bg-amber-500/10';
  if (rating >= 2) return 'bg-orange-500/10';
  return 'bg-red-500/10';
}

// ─── Filtering ───────────────────────────────────────────────────────────────

/** Return only sessions that have been rated. */
export function filterRated(sessions: RatedSession[]): RatedSession[] {
  return sessions.filter((s) => isValidRating(s.quality_rating));
}

/** Return sessions of a specific session type. */
export function filterByType(sessions: RatedSession[], type: string): RatedSession[] {
  return sessions.filter((s) => s.type === type);
}

// ─── Aggregates ──────────────────────────────────────────────────────────────

/**
 * Average quality rating across rated sessions.
 * Returns null when there are no rated sessions.
 */
export function calculateAverageRating(sessions: RatedSession[]): number | null {
  const rated = filterRated(sessions);
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, s) => acc + (s.quality_rating as number), 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

/**
 * Count of sessions per rating value (1–5).
 * Returns a full record even for missing rating values (count = 0).
 */
export function countByRating(sessions: RatedSession[]): Record<QualityRating, number> {
  const result: Record<QualityRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of filterRated(sessions)) {
    const r = s.quality_rating as QualityRating;
    result[r] = (result[r] ?? 0) + 1;
  }
  return result;
}

/**
 * Percentage of rated sessions that scored 4 or 5 (high quality).
 * Returns 0 when there are no rated sessions.
 */
export function getHighQualityRate(sessions: RatedSession[]): number {
  const rated = filterRated(sessions);
  if (rated.length === 0) return 0;
  const high = rated.filter((s) => (s.quality_rating as number) >= 4).length;
  return Math.round((high / rated.length) * 100);
}

/** Return the highest-rated session, or null if none are rated. */
export function getBestSession(sessions: RatedSession[]): RatedSession | null {
  const rated = filterRated(sessions);
  if (rated.length === 0) return null;
  return rated.reduce((best, s) =>
    (s.quality_rating as number) > (best.quality_rating as number) ? s : best
  );
}

// ─── Trend ───────────────────────────────────────────────────────────────────

/**
 * Compare the average of the most-recent `windowSize` rated sessions to the
 * prior `windowSize` sessions.  Requires at least 2×windowSize rated sessions.
 *
 * "Improving"  → recent avg > prior avg + 0.3
 * "Declining"  → recent avg < prior avg − 0.3
 * "Stable"     → within ±0.3
 */
export function getQualityTrend(
  sessions: RatedSession[],
  windowSize = 5
): QualityTrend {
  const sorted = filterRated(sessions).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  if (sorted.length < windowSize * 2) return 'stable';

  const recent = sorted.slice(0, windowSize);
  const prior = sorted.slice(windowSize, windowSize * 2);

  const avgRecent = recent.reduce((a, s) => a + (s.quality_rating as number), 0) / windowSize;
  const avgPrior = prior.reduce((a, s) => a + (s.quality_rating as number), 0) / windowSize;
  const delta = avgRecent - avgPrior;

  if (delta > 0.3) return 'improving';
  if (delta < -0.3) return 'declining';
  return 'stable';
}

/** Human-readable trend delta string, e.g. "+0.4" or "−0.6". */
export function formatTrendDelta(sessions: RatedSession[], windowSize = 5): string | null {
  const sorted = filterRated(sessions).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  if (sorted.length < windowSize * 2) return null;

  const recent = sorted.slice(0, windowSize);
  const prior = sorted.slice(windowSize, windowSize * 2);

  const avgRecent = recent.reduce((a, s) => a + (s.quality_rating as number), 0) / windowSize;
  const avgPrior = prior.reduce((a, s) => a + (s.quality_rating as number), 0) / windowSize;
  const delta = Math.round((avgRecent - avgPrior) * 10) / 10;

  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '0';
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

/** Sort rated sessions highest-rating first; unrated go to the end. */
export function sortByQuality(sessions: RatedSession[]): RatedSession[] {
  return [...sessions].sort((a, b) => {
    const ra = a.quality_rating ?? 0;
    const rb = b.quality_rating ?? 0;
    return rb - ra;
  });
}

// ─── Chart data ──────────────────────────────────────────────────────────────

/**
 * Produce an array of `{ date, avg }` points for a rolling average chart.
 * Sessions are sorted ascending by date. Each entry has the rolling average
 * over the past `window` rated sessions (or null if insufficient data).
 */
export function getRollingAverageQuality(
  sessions: RatedSession[],
  window = 5
): Array<{ date: string; avg: number | null }> {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const result: Array<{ date: string; avg: number | null }> = [];
  const ratedSoFar: number[] = [];

  for (const s of sorted) {
    if (isValidRating(s.quality_rating)) {
      ratedSoFar.push(s.quality_rating);
    }
    const slice = ratedSoFar.slice(-window);
    const avg =
      slice.length > 0
        ? Math.round((slice.reduce((a, v) => a + v, 0) / slice.length) * 10) / 10
        : null;
    result.push({ date: s.date, avg });
  }

  return result;
}

// ─── Motivation message ──────────────────────────────────────────────────────

/**
 * Return a short motivational message based on the average rating.
 * Used as a subtitle under the star display in the analytics card.
 */
export function getQualityMotivationMessage(avg: number | null): string {
  if (avg === null) return 'Rate your sessions to track practice quality over time.';
  if (avg >= 4.5) return 'Outstanding — your practices are firing on all cylinders!';
  if (avg >= 4.0) return 'Great work — consistently high-quality sessions.';
  if (avg >= 3.0) return 'Solid foundation — a few tweaks could push sessions higher.';
  if (avg >= 2.0) return "Room to grow — identify what's holding sessions back.";
  return 'Focus on session structure and energy to lift practice quality.';
}

// ─── Summary text ────────────────────────────────────────────────────────────

/**
 * Build a one-line summary string for sharing or display.
 * e.g. "Avg 4.2★ across 12 rated sessions (75% high quality)"
 */
export function buildQualitySummary(sessions: RatedSession[]): string {
  const rated = filterRated(sessions);
  if (rated.length === 0) return 'No sessions rated yet.';
  const avg = calculateAverageRating(sessions)!;
  const pct = getHighQualityRate(sessions);
  return `Avg ${avg}★ across ${rated.length} rated session${rated.length === 1 ? '' : 's'} (${pct}% high quality)`;
}

// ─── Percentage helpers ───────────────────────────────────────────────────────

/** What fraction of total sessions have been rated? Returns 0–100. */
export function getRatedFraction(sessions: RatedSession[]): number {
  if (sessions.length === 0) return 0;
  return Math.round((filterRated(sessions).length / sessions.length) * 100);
}
