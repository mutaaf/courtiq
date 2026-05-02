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

export interface StreakWin {
  type: 'streak';
  player_id: string;
  player_name: string;
  player_jersey: number | null;
  streak: number;       // consecutive positive-session count
  streak_at: string;   // ISO timestamp of the most recent positive observation
}

export type TeamWin = BadgeWin | GoalWin | StreakWin;

// ─── Pure utilities ───────────────────────────────────────────────────────────

/** Returns the canonical date string for a win. */
export function getWinDate(win: TeamWin): string {
  if (win.type === 'badge') return win.earned_at;
  if (win.type === 'goal') return win.achieved_at;
  return win.streak_at;
}

/** Returns the emoji for a growth streak count. */
export function getStreakEmoji(streak: number): string {
  return streak >= 5 ? '⚡' : '🔥';
}

/** Returns a short human-readable label for a growth streak. */
export function getStreakLabel(streak: number): string {
  if (streak >= 10) return `${streak} sessions in a row! 🏆`;
  if (streak >= 7)  return `${streak} sessions in a row!`;
  if (streak >= 5)  return `${streak} sessions in a row!`;
  return `${streak} sessions in a row!`;
}

/** Builds a parent-friendly share message for a growth streak. */
export function buildStreakShareText(playerName: string, streak: number, teamName: string): string {
  const emoji = getStreakEmoji(streak);
  const first = playerName.split(' ')[0];
  return `${emoji} ${first} has been amazing at practice — ${streak} sessions in a row with great feedback from Coach! ${teamName} is so proud. — via SportsIQ`;
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
