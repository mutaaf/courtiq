// Pure utilities for the Game Day Card — surface game/scrimmage/tournament readiness on home dashboard

export type GameLikeType = 'game' | 'scrimmage' | 'tournament';

export interface GameSession {
  id: string;
  type: string;
  date: string;
  start_time: string | null;
  opponent: string | null;
  location: string | null;
}

export function isGameLike(type: string): type is GameLikeType {
  return type === 'game' || type === 'scrimmage' || type === 'tournament';
}

export function getGameTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    game: 'Game',
    scrimmage: 'Scrimmage',
    tournament: 'Tournament',
  };
  return labels[type] ?? type;
}

export function getGameTypeEmoji(type: string): string {
  const emojis: Record<string, string> = {
    game: '🏆',
    scrimmage: '⚡',
    tournament: '🏅',
  };
  return emojis[type] ?? '🎮';
}

// Returns the earliest game-like session that falls on todayStr or tomorrowStr.
export function findUpcomingGameSession(
  sessions: GameSession[],
  todayStr: string,
  tomorrowStr: string,
): GameSession | null {
  const candidates = sessions.filter(
    (s) => isGameLike(s.type) && (s.date === todayStr || s.date === tomorrowStr),
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (!a.start_time && !b.start_time) return 0;
    if (!a.start_time) return 1;
    if (!b.start_time) return -1;
    return a.start_time < b.start_time ? -1 : 1;
  })[0];
}

export type GameUrgency = 'imminent' | 'today' | 'tomorrow';

// 'imminent' = today, start_time within 2 hours; 'today' = today but not imminent; 'tomorrow' = not today
export function getGameUrgency(
  session: GameSession,
  todayStr: string,
  now: Date = new Date(),
): GameUrgency {
  if (session.date !== todayStr) return 'tomorrow';
  if (!session.start_time) return 'today';
  const [h, m] = session.start_time.split(':').map(Number);
  const gameMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0).getTime();
  const diffHours = (gameMs - now.getTime()) / (1000 * 60 * 60);
  return diffHours <= 2 ? 'imminent' : 'today';
}

// Formats "14:30" → "2:30 PM"
export function formatGameTime(startTime: string | null): string {
  if (!startTime) return '';
  const parts = startTime.split(':').map(Number);
  const h = parts[0];
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Human-readable countdown: "in 2h 30m", "in 45m", "Tomorrow at 2:30 PM", "Today at 6:00 PM"
export function getCountdownLabel(
  session: GameSession,
  todayStr: string,
  now: Date = new Date(),
): string {
  if (session.date !== todayStr) {
    return session.start_time
      ? `Tomorrow at ${formatGameTime(session.start_time)}`
      : 'Tomorrow';
  }
  if (!session.start_time) return `Today`;
  const [h, m] = session.start_time.split(':').map(Number);
  const gameMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0).getTime();
  const diffMs = gameMs - now.getTime();
  if (diffMs <= 0) return `Today at ${formatGameTime(session.start_time)}`;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMin / 60);
  const remainMin = diffMin % 60;
  if (diffHours === 0) return `in ${diffMin}m`;
  if (remainMin === 0) return `in ${diffHours}h`;
  return `in ${diffHours}h ${remainMin}m`;
}

// Pre-written parent reminder message for Web Share API / clipboard
export function buildGameReminderMsg(
  session: GameSession,
  teamName: string,
  coachName?: string | null,
): string {
  const typeLabel = getGameTypeLabel(session.type);
  const emoji = getGameTypeEmoji(session.type);
  const d = new Date(session.date + 'T12:00:00');
  const dayLabel = d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  let msg = `${emoji} ${typeLabel} — ${dayLabel}`;
  if (session.start_time) msg += ` at ${formatGameTime(session.start_time)}`;
  if (session.opponent) msg += `\nvs ${session.opponent}`;
  if (session.location) msg += `\n📍 ${session.location}`;
  const sig = [teamName, coachName ? `— ${coachName}` : ''].filter(Boolean).join(' ');
  if (sig) msg += `\n${sig}`;
  return msg;
}

// Count players whose availability would affect game-day roster
export function countAvailabilityIssues(
  playerAvailability: Record<string, { status: string }>,
): number {
  return Object.values(playerAvailability).filter(
    (v) => v.status === 'injured' || v.status === 'sick' || v.status === 'unavailable',
  ).length;
}
