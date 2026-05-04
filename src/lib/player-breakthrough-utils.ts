// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal observation shape needed for breakthrough detection. */
export interface BTObs {
  player_id: string;
  sentiment: string;
  category: string | null;
  created_at: string;
}

/** A single player-category breakthrough event. */
export interface PlayerBreakthrough {
  player_id: string;
  category: string;
  /** needs_work count in days 8-21 (prior window). */
  priorNeedsWork: number;
  /** positive count in days 0-7 (recent window). */
  recentPositive: number;
  /** ISO string of the most recent positive observation. */
  detectedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum observations in each window before declaring a breakthrough. */
export const BREAKTHROUGH_THRESHOLD = 2;

/** Days in recent window (0 → RECENT_DAYS). */
export const RECENT_DAYS = 7;

/** Days in prior window (RECENT_DAYS → PRIOR_DAYS). */
export const PRIOR_DAYS = 21;

// ─── Window helpers ───────────────────────────────────────────────────────────

/**
 * Splits an observations list into recent (last 7 days) and prior (days 8-21).
 * `now` can be overridden in tests.
 */
export function splitWindows(
  obs: BTObs[],
  now = Date.now()
): { recent: BTObs[]; prior: BTObs[] } {
  const cutRecent = now - RECENT_DAYS * 86_400_000;
  const cutPrior = now - PRIOR_DAYS * 86_400_000;
  return {
    recent: obs.filter((o) => new Date(o.created_at).getTime() >= cutRecent),
    prior: obs.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= cutPrior && t < cutRecent;
    }),
  };
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Groups observations by composite key `player_id::category`.
 * Observations with null/empty category are skipped.
 */
export function groupByPlayerCategory(obs: BTObs[]): Map<string, BTObs[]> {
  const map = new Map<string, BTObs[]>();
  for (const o of obs) {
    if (!o.category) continue;
    const key = `${o.player_id}::${o.category}`;
    const arr = map.get(key);
    if (arr) arr.push(o);
    else map.set(key, [o]);
  }
  return map;
}

// ─── Counting ────────────────────────────────────────────────────────────────

/** Counts observations matching a specific sentiment. */
export function countBySentiment(
  obs: BTObs[],
  sentiment: 'positive' | 'needs_work' | 'neutral'
): number {
  return obs.filter((o) => o.sentiment === sentiment).length;
}

// ─── Core detection ───────────────────────────────────────────────────────────

/**
 * Detects breakthroughs: player-category pairs where the player had
 * ≥BREAKTHROUGH_THRESHOLD needs-work observations in days 8-21 AND
 * ≥BREAKTHROUGH_THRESHOLD positive observations in the last 7 days.
 *
 * Results are sorted by signal strength (recentPositive + priorNeedsWork) desc.
 */
export function buildBreakthroughs(obs: BTObs[], now = Date.now()): PlayerBreakthrough[] {
  const { recent, prior } = splitWindows(obs, now);
  const recentByKey = groupByPlayerCategory(recent);
  const priorByKey = groupByPlayerCategory(prior);

  const results: PlayerBreakthrough[] = [];

  for (const [key, recentObs] of recentByKey) {
    const splitIdx = key.indexOf('::');
    const player_id = key.slice(0, splitIdx);
    const category = key.slice(splitIdx + 2);
    const priorObs = priorByKey.get(key) ?? [];

    const recentPositive = countBySentiment(recentObs, 'positive');
    const priorNeedsWork = countBySentiment(priorObs, 'needs_work');

    if (
      recentPositive >= BREAKTHROUGH_THRESHOLD &&
      priorNeedsWork >= BREAKTHROUGH_THRESHOLD
    ) {
      const latestPositive = recentObs
        .filter((o) => o.sentiment === 'positive')
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

      results.push({
        player_id,
        category,
        priorNeedsWork,
        recentPositive,
        detectedAt: latestPositive?.created_at ?? new Date(now).toISOString(),
      });
    }
  }

  return results.sort(
    (a, b) =>
      b.recentPositive + b.priorNeedsWork - (a.recentPositive + a.priorNeedsWork)
  );
}

/** Returns the strongest breakthrough, or null when none exist. */
export function getBestBreakthrough(bts: PlayerBreakthrough[]): PlayerBreakthrough | null {
  return bts[0] ?? null;
}

// ─── Dismissal (localStorage) ────────────────────────────────────────────────

/** Returns the localStorage key for a weekly dismissal of this breakthrough. */
export function getBreakthroughDismissKey(
  teamId: string,
  playerId: string,
  category: string
): string {
  const week = Math.floor(Date.now() / (RECENT_DAYS * 86_400_000));
  return `bt-dismiss-${teamId}-${playerId}-${category}-w${week}`;
}

/** Returns true when this breakthrough has already been dismissed this week. */
export function isBreakthroughDismissed(
  teamId: string,
  playerId: string,
  category: string
): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(getBreakthroughDismissKey(teamId, playerId, category));
}

/** Persists a per-week dismissal for this breakthrough. */
export function dismissBreakthrough(
  teamId: string,
  playerId: string,
  category: string
): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getBreakthroughDismissKey(teamId, playerId, category), '1');
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Title-cases a category label (e.g. "dribbling" → "Dribbling"). */
export function formatCategory(category: string): string {
  if (!category) return '';
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

/** Returns true when there are enough observations to run breakthrough detection. */
export function hasEnoughDataForBreakthroughs(obs: BTObs[]): boolean {
  return obs.length >= 5;
}

// ─── Sharing helpers ──────────────────────────────────────────────────────────

/**
 * Builds a warm WhatsApp-ready message celebrating the player's breakthrough.
 * `coachName` is optional and falls back to a generic attribution.
 */
export function buildBreakthroughShareText(
  playerName: string,
  category: string,
  coachName?: string
): string {
  const cat = formatCategory(category);
  const coach = coachName ?? 'Your coach';
  return (
    `Hi! 🎉 Just wanted to share some great news — ${playerName} has been making ` +
    `real progress on ${cat} in our recent practices! ${coach} has noticed the hard ` +
    `work paying off. Keep it up! 🏀`
  );
}

/**
 * Returns a wa.me URL pre-filled with the share text.
 * If `phone` is provided the URL is addressed to that number;
 * otherwise it opens the generic WhatsApp share picker.
 */
export function buildBreakthroughWhatsAppUrl(shareText: string, phone?: string): string {
  const encoded = encodeURIComponent(shareText);
  if (phone) {
    const normalized = phone.replace(/\D/g, '');
    return `https://wa.me/${normalized}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

/** Returns the prior-window description label. */
export function buildPriorLabel(priorNeedsWork: number): string {
  return `Needed work ${priorNeedsWork}× before`;
}

/** Returns the recent-window description label. */
export function buildRecentLabel(recentPositive: number): string {
  return `${recentPositive} positive obs this week`;
}
