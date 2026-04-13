// Shared types, constants, and helpers for analytics chart components.
// Imported by analytics/page.tsx and each chart component so that dynamic()
// boundaries don't pull in the same code twice.

export function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function weekLabel(weekKey: string): string {
  const [year, w] = weekKey.split('-W');
  const jan4 = new Date(Number(year), 0, 4);
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (Number(w) - 1) * 7);
  return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface WeekBucket {
  weekKey: string;
  positive: number;
  neutral: number;
  needsWork: number;
  total: number;
  healthScore: number | null;
}

export interface SessionBucket {
  sessionId: string;
  date: string;
  type: string;
  positive: number;
  needsWork: number;
  neutral: number;
  total: number;
  healthScore: number | null;
}

export interface TransferStats {
  playerId: string;
  playerName: string;
  practiceScore: number | null;
  gameScore: number | null;
  delta: number | null;
}

export const SESSION_TYPE_COLORS: Record<string, string> = {
  practice: '#F97316',
  game: '#3b82f6',
  scrimmage: '#8b5cf6',
  tournament: '#f59e0b',
  training: '#14b8a6',
};

export const PRACTICE_SESSION_TYPES = new Set(['practice', 'training']);
export const GAME_SESSION_TYPES = new Set(['game', 'scrimmage', 'tournament']);
