// Coaching Streak — consecutive-day activity tracking
// Activity = any observation created OR session logged for the team

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null; // ISO date string YYYY-MM-DD
  todayHasActivity: boolean;
  atRisk: boolean; // today has no activity yet
}

export interface StreakMilestone {
  days: number;
  label: string;
  icon: string;
}

const MILESTONES: StreakMilestone[] = [
  { days: 3, label: 'Getting Started', icon: '🔥' },
  { days: 7, label: 'Week Warrior', icon: '⚡' },
  { days: 14, label: 'Two-Week Run', icon: '💪' },
  { days: 30, label: 'Monthly Grinder', icon: '🏆' },
  { days: 60, label: 'Elite Coach', icon: '👑' },
  { days: 100, label: 'Century Club', icon: '🌟' },
];

export function getDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayKey(): string {
  return getDayKey(new Date());
}

// Deduplicate and sort dates descending (most-recent first)
export function normalizeDates(dates: string[]): string[] {
  return [...new Set(dates)].sort().reverse();
}

export function calculateCurrentStreak(activityDates: string[], today: string): number {
  const dates = normalizeDates(activityDates);
  if (dates.length === 0) return 0;

  // Streak must include today or yesterday (we don't break a streak mid-day)
  const todayMs = new Date(today + 'T00:00:00Z').getTime();
  const yesterdayKey = getDayKey(new Date(todayMs - 86400000));

  const mostRecent = dates[0];
  if (mostRecent !== today && mostRecent !== yesterdayKey) return 0;

  let streak = 0;
  let expected = mostRecent;

  for (const d of dates) {
    if (d === expected) {
      streak++;
      const expectedMs = new Date(expected + 'T00:00:00Z').getTime();
      expected = getDayKey(new Date(expectedMs - 86400000));
    } else {
      break;
    }
  }

  return streak;
}

export function calculateLongestStreak(activityDates: string[]): number {
  const dates = normalizeDates(activityDates);
  if (dates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < dates.length; i++) {
    const prevMs = new Date(dates[i - 1] + 'T00:00:00Z').getTime();
    const currMs = new Date(dates[i] + 'T00:00:00Z').getTime();
    // dates are descending, so prev is newer; diff should be 1 day
    if (prevMs - currMs === 86400000) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }

  return longest;
}

export function getEarnedMilestones(streak: number): StreakMilestone[] {
  return MILESTONES.filter((m) => streak >= m.days);
}

export function getNextMilestone(streak: number): StreakMilestone | null {
  return MILESTONES.find((m) => streak < m.days) ?? null;
}

export function getDaysToNextMilestone(streak: number): number | null {
  const next = getNextMilestone(streak);
  return next ? next.days - streak : null;
}

export function getStreakMessage(streak: number, atRisk: boolean): string {
  if (streak === 0) return 'Start your coaching streak today!';
  if (atRisk) return `${streak}-day streak — observe a player to keep it alive!`;
  if (streak === 1) return 'Day 1 — great start!';
  if (streak < 7) return `${streak}-day streak — keep it going!`;
  if (streak < 30) return `${streak}-day streak — you're on fire!`;
  if (streak < 100) return `${streak}-day streak — incredible consistency!`;
  return `${streak}-day streak — you're a coaching legend!`;
}

export function buildStreakData(
  activityDates: string[],
  today: string
): StreakData {
  const dates = normalizeDates(activityDates);
  const todayHasActivity = dates.includes(today);
  const currentStreak = calculateCurrentStreak(activityDates, today);
  const longestStreak = calculateLongestStreak(activityDates);
  const lastActivityDate = dates[0] ?? null;

  // At risk = today has no activity AND there was a streak running (yesterday had activity)
  const todayMs = new Date(today + 'T00:00:00Z').getTime();
  const yesterdayKey = getDayKey(new Date(todayMs - 86400000));
  const atRisk = !todayHasActivity && dates[0] === yesterdayKey && currentStreak > 0;

  return {
    currentStreak,
    longestStreak,
    lastActivityDate,
    todayHasActivity,
    atRisk,
  };
}

export function formatStreakCount(n: number): string {
  return n.toString();
}

export function isNewRecord(currentStreak: number, longestStreak: number): boolean {
  return currentStreak > 0 && currentStreak >= longestStreak;
}

export function streakPercentToNextMilestone(streak: number): number {
  const next = getNextMilestone(streak);
  if (!next) return 100;
  const prev = [...MILESTONES].reverse().find((m) => m.days <= streak);
  const base = prev ? prev.days : 0;
  return Math.round(((streak - base) / (next.days - base)) * 100);
}
