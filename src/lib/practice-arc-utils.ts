import type { PracticeArc, PracticeArcSession } from '@/lib/ai/schemas';

// ── Validation ────────────────────────────────────────────────────────────────

export function isValidSessionCount(n: unknown): n is 2 | 3 {
  return n === 2 || n === 3;
}

export function isValidSessionDuration(minutes: unknown): minutes is number {
  return typeof minutes === 'number' && [30, 45, 60, 75, 90].includes(minutes);
}

export function hasEnoughDataForArc(totalObs: number): boolean {
  return totalObs >= 5;
}

export function isValidArcTitle(title: unknown): boolean {
  return typeof title === 'string' && title.length >= 5 && title.length <= 100;
}

export function isValidArcSession(session: unknown): session is PracticeArcSession {
  if (!session || typeof session !== 'object') return false;
  const s = session as Record<string, unknown>;
  return (
    typeof s.session_number === 'number' &&
    typeof s.title === 'string' &&
    typeof s.theme === 'string' &&
    typeof s.session_goal === 'string' &&
    Array.isArray(s.drills) &&
    s.drills.length >= 2
  );
}

export function hasGameDayTip(arc: PracticeArc): boolean {
  return typeof arc.game_day_tip === 'string' && arc.game_day_tip.length > 5;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export function countTotalDrills(arc: PracticeArc): number {
  return arc.sessions.reduce((sum, s) => sum + s.drills.length, 0);
}

export function getTotalArcMinutes(arc: PracticeArc): number {
  if (!arc.sessions.length) return 0;
  return arc.sessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
}

export function getSessionDrillCount(session: PracticeArcSession): number {
  return session.drills.length;
}

export function getSessionTotalDrillMinutes(session: PracticeArcSession): number {
  return (
    (session.warmup?.duration_minutes ?? 0) +
    session.drills.reduce((sum, d) => sum + d.duration_minutes, 0) +
    (session.cooldown?.duration_minutes ?? 0)
  );
}

// ── Labels ───────────────────────────────────────────────────────────────────

export function getSessionLabel(sessionNumber: number): string {
  return `Practice ${sessionNumber}`;
}

export function getProgressionLabel(sessionNumber: number, totalSessions: number): string {
  if (totalSessions === 2) {
    return sessionNumber === 1 ? 'Fundamentals' : 'Application';
  }
  if (sessionNumber === 1) return 'Introduce';
  if (sessionNumber === 2) return 'Develop';
  return 'Apply';
}

export function formatArcDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m total`;
  if (mins === 0) return `${hours}h total`;
  return `${hours}h ${mins}m total`;
}

export function formatSessionDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── Styling ───────────────────────────────────────────────────────────────────

export function getSessionAccentColor(sessionNumber: number): string {
  const colors: Record<number, string> = {
    1: 'text-sky-400',
    2: 'text-violet-400',
    3: 'text-emerald-400',
  };
  return colors[sessionNumber] ?? 'text-orange-400';
}

export function getSessionBorderColor(sessionNumber: number): string {
  const colors: Record<number, string> = {
    1: 'border-sky-500/30',
    2: 'border-violet-500/30',
    3: 'border-emerald-500/30',
  };
  return colors[sessionNumber] ?? 'border-orange-500/30';
}

export function getSessionBgColor(sessionNumber: number): string {
  const colors: Record<number, string> = {
    1: 'bg-sky-500/5',
    2: 'bg-violet-500/5',
    3: 'bg-emerald-500/5',
  };
  return colors[sessionNumber] ?? 'bg-orange-500/5';
}

// ── Data helpers ──────────────────────────────────────────────────────────────

export function extractPrimaryFocusFromNeedsWork(topNeedsWork: string[]): string[] {
  return topNeedsWork.slice(0, 2);
}

export function buildArcTitle(numSessions: number, upcomingEvent: string | undefined, focus: string[]): string {
  const focusPart = focus.length > 0 ? focus.slice(0, 2).join(' & ') : 'Team Development';
  const suffix = `${numSessions}-Practice Arc`;
  if (upcomingEvent) {
    return `${upcomingEvent} Prep — ${suffix}`;
  }
  return `${focusPart} — ${suffix}`;
}

export function buildArcShareText(arc: PracticeArc): string {
  const lines = [
    `🏀 ${arc.arc_title}`,
    `Goal: ${arc.arc_goal}`,
    '',
    ...arc.sessions.map((s) => `Practice ${s.session_number}: ${s.theme}`),
  ];
  if (arc.game_day_tip) {
    lines.push('', `Game day tip: ${arc.game_day_tip}`);
  }
  return lines.join('\n');
}

export function isLastSession(sessionNumber: number, totalSessions: number): boolean {
  return sessionNumber === totalSessions;
}

export function countSessionsWithCarriesForward(arc: PracticeArc): number {
  return arc.sessions.filter((s) => s.carries_forward && s.carries_forward.length > 0).length;
}

export function getPrimaryFocusLabel(arc: PracticeArc): string {
  return arc.primary_focus.join(' · ');
}
