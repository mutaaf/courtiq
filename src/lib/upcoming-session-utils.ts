/**
 * Helpers for the "Upcoming Sessions" card on the parent share portal.
 *
 * NOTE: `formatSessionDate` anchors the parsed date at T12:00:00 (local noon)
 * to avoid YYYY-MM-DD strings being shifted to the previous day by UTC parsing.
 * "Today" / "Tomorrow" labels are computed against the *server's* local midnight,
 * not the parent's browser timezone — acceptable for SSR v1.
 */

export const SESSION_EMOJI: Record<string, string> = {
  practice: '🏀',
  game: '🏆',
  scrimmage: '⚔️',
  tournament: '🥇',
  training: '💪',
};

export const SESSION_LABEL: Record<string, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

/**
 * Formats a YYYY-MM-DD date string and optional HH:MM[:SS] time string into a
 * human-friendly label like:
 *   "Today"
 *   "Tomorrow · 4 PM"
 *   "Wednesday, May 14 · 10:30 AM"
 */
export function formatSessionDate(dateStr: string, timeStr: string | null): string {
  // Parse at noon to avoid TZ off-by-one on YYYY-MM-DD strings
  const d = new Date(`${dateStr}T12:00:00`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const sessionDay = new Date(d);
  sessionDay.setHours(0, 0, 0, 0);

  let dayLabel: string;
  if (sessionDay.getTime() === today.getTime()) {
    dayLabel = 'Today';
  } else if (sessionDay.getTime() === tomorrow.getTime()) {
    dayLabel = 'Tomorrow';
  } else {
    dayLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  if (!timeStr) return dayLabel;

  // timeStr is "HH:MM:SS" or "HH:MM"
  const [hh, mm] = timeStr.split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 || 12;
  const minPart = mm > 0 ? `:${String(mm).padStart(2, '0')}` : '';
  return `${dayLabel} · ${hour12}${minPart} ${period}`;
}

/** Returns true if the session type has an opponent (game, scrimmage, tournament). */
export function isCompetitiveSession(type: string): boolean {
  return type === 'game' || type === 'scrimmage' || type === 'tournament';
}

/** Returns the emoji for a session type, defaulting to 📅. */
export function getSessionEmoji(type: string): string {
  return SESSION_EMOJI[type] ?? '📅';
}

/** Returns the human label for a session type, defaulting to the raw type. */
export function getSessionLabel(type: string): string {
  return SESSION_LABEL[type] ?? type;
}
