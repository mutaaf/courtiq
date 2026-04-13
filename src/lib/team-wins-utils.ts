// ─── Shared types ─────────────────────────────────────────────────────────────

export interface BadgeWin {
  type: 'badge';
  player_id: string;
  player_name: string;
  player_jersey: number | null;
  badge_type: string;
  badge_name: string;
  badge_description: string;
  note: string | null;
  earned_at: string;
}

export interface GoalWin {
  type: 'goal';
  player_id: string;
  player_name: string;
  player_jersey: number | null;
  skill: string;
  goal_text: string;
  achieved_at: string;
}

export type TeamWin = BadgeWin | GoalWin;

// ─── Pure utilities ───────────────────────────────────────────────────────────

/** Returns the canonical date string for a win (earned_at for badge, achieved_at for goal). */
export function getWinDate(win: TeamWin): string {
  return win.type === 'badge' ? win.earned_at : win.achieved_at;
}

/** Sorts wins newest-first. Returns a new array. */
export function sortWins(wins: TeamWin[]): TeamWin[] {
  return [...wins].sort(
    (a, b) => new Date(getWinDate(b)).getTime() - new Date(getWinDate(a)).getTime()
  );
}

/**
 * Returns a human-readable relative time string.
 * The `now` parameter defaults to Date.now() but can be overridden for testing.
 */
export function formatTimeAgo(dateStr: string, now = Date.now()): string {
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
