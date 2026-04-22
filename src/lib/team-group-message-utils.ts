// Pure utility functions for the Team Group Chat Message feature.
// No side effects — safe to test in isolation.

export interface TeamGroupMessage {
  message: string;         // Main shareable text (warm, 2–4 sentences)
  session_label: string;   // e.g. "Tuesday's Practice — Apr 22"
  team_highlight: string;  // Key team moment worth celebrating
  coaching_focus: string[]; // 2-3 skills worked on today
  encouragement: string;   // Closing note for parents
  next_session_note?: string; // Optional hint about next session
}

// ── Session helpers ────────────────────────────────────────────────────────────

export function getSessionEmoji(sessionType: string): string {
  switch (sessionType) {
    case 'game':        return '🏆';
    case 'scrimmage':   return '⚔️';
    case 'tournament':  return '🥇';
    case 'training':    return '💪';
    default:            return '🏀';
  }
}

export function getSessionTypeLabel(sessionType: string): string {
  switch (sessionType) {
    case 'game':        return 'Game';
    case 'scrimmage':   return 'Scrimmage';
    case 'tournament':  return 'Tournament';
    case 'training':    return 'Training';
    default:            return 'Practice';
  }
}

export function buildSessionLabel(
  sessionType: string,
  date: string,
  opponent?: string | null,
): string {
  const d = new Date(date + 'T00:00:00');
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const typeLabel = getSessionTypeLabel(sessionType);
  if (opponent && (sessionType === 'game' || sessionType === 'scrimmage' || sessionType === 'tournament')) {
    return `${weekday}'s ${typeLabel} vs ${opponent} — ${shortDate}`;
  }
  return `${weekday}'s ${typeLabel} — ${shortDate}`;
}

// ── Observation helpers ────────────────────────────────────────────────────────

export function getPositiveObsCount(obs: { sentiment: string }[]): number {
  return obs.filter((o) => o.sentiment === 'positive').length;
}

export function getNeedsWorkObsCount(obs: { sentiment: string }[]): number {
  return obs.filter((o) => o.sentiment === 'needs-work').length;
}

export function extractFocusAreas(obs: { category?: string }[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const o of obs) {
    if (o.category && !seen.has(o.category)) {
      seen.add(o.category);
      result.push(o.category);
    }
  }
  return result.slice(0, 4);
}

export function hasEnoughDataForGroupMessage(observationCount: number): boolean {
  return observationCount >= 1;
}

// ── Message helpers ────────────────────────────────────────────────────────────

export function countChars(message: string): number {
  return message.length;
}

export function truncateMessage(message: string, maxLen: number): string {
  if (message.length <= maxLen) return message;
  return message.slice(0, maxLen - 3) + '...';
}

export function buildPreviewText(message: string, maxLen = 80): string {
  return truncateMessage(message, maxLen);
}

export function isValidGroupMessage(data: unknown): data is TeamGroupMessage {
  if (data === null || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.message === 'string' && d.message.length > 0 &&
    typeof d.session_label === 'string' && d.session_label.length > 0 &&
    typeof d.team_highlight === 'string' &&
    Array.isArray(d.coaching_focus) &&
    typeof d.encouragement === 'string'
  );
}

// ── Formatting & sharing ───────────────────────────────────────────────────────

export function formatGroupMessage(
  data: TeamGroupMessage,
  coachName?: string,
  teamName?: string,
): string {
  const emoji = '🏀';
  const lines: string[] = [];

  lines.push(`${emoji} ${data.session_label}`);
  lines.push('');
  lines.push(data.message);

  if (data.coaching_focus && data.coaching_focus.length > 0) {
    lines.push('');
    lines.push(`Today we focused on: ${data.coaching_focus.join(', ')}`);
  }

  if (data.encouragement) {
    lines.push('');
    lines.push(data.encouragement);
  }

  if (data.next_session_note) {
    lines.push('');
    lines.push(`📅 ${data.next_session_note}`);
  }

  const signoff = coachName ? `Coach ${coachName}` : 'Your Coach';
  lines.push('');
  lines.push(`— ${signoff}${teamName ? ` · ${teamName}` : ''}`);

  return lines.join('\n');
}

export function buildShareText(
  data: TeamGroupMessage,
  coachName?: string,
  teamName?: string,
): string {
  return formatGroupMessage(data, coachName, teamName);
}

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function countFocusAreas(data: TeamGroupMessage): number {
  return (data.coaching_focus ?? []).length;
}

export function hasNextSessionNote(data: TeamGroupMessage): boolean {
  return typeof data.next_session_note === 'string' && data.next_session_note.trim().length > 0;
}
