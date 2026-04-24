import type { SessionType } from '@/types/database';

export interface RecordSession {
  id: string;
  type: SessionType;
  date: string;
  result: string | null;
  opponent: string | null;
}

export interface SeasonRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface StreakData {
  type: 'win' | 'loss' | 'tie';
  count: number;
}

export type ResultValue = 'win' | 'loss' | 'tie';

const GAME_SESSION_TYPES: SessionType[] = ['game', 'scrimmage', 'tournament'];

// ─── Type guards / validators ────────────────────────────────────────────────

export function isGameType(type: string): boolean {
  return GAME_SESSION_TYPES.includes(type as SessionType);
}

export function parseResult(result: string | null): ResultValue | null {
  if (!result) return null;
  const lower = result.toLowerCase().trim();
  if (lower === 'win' || lower === 'w' || lower.startsWith('win ') || lower.startsWith('w ')) return 'win';
  if (lower === 'loss' || lower === 'l' || lower === 'lose' || lower.startsWith('loss ') || lower.startsWith('l ') || lower.startsWith('lose ')) return 'loss';
  if (lower === 'tie' || lower === 't' || lower === 'draw' || lower === 'd' || lower.startsWith('tie ') || lower.startsWith('t ') || lower.startsWith('draw ')) return 'tie';
  return null;
}

/** Extracts the optional score string from a result value like "win 42-38" → "42-38". */
export function extractScore(result: string | null): string | null {
  if (!result) return null;
  const parts = result.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const score = parts.slice(1).join(' ');
  return score || null;
}

/** Builds the stored result string: "win", "loss", "tie" or "win 42-38" etc. */
export function buildResultString(outcome: ResultValue, score?: string): string {
  const trimmed = score?.trim();
  return trimmed ? `${outcome} ${trimmed}` : outcome;
}

// ─── Filtering / sorting ─────────────────────────────────────────────────────

export function filterGameSessions(sessions: RecordSession[]): RecordSession[] {
  return sessions.filter((s) => isGameType(s.type));
}

export function filterSessionsWithResults(sessions: RecordSession[]): RecordSession[] {
  return filterGameSessions(sessions).filter((s) => parseResult(s.result) !== null);
}

export function sortSessionsByDate(sessions: RecordSession[]): RecordSession[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date));
}

export function getLastNGameSessions(sessions: RecordSession[], n: number): RecordSession[] {
  const sorted = sortSessionsByDate(filterSessionsWithResults(sessions));
  return sorted.slice(-n);
}

// ─── Record calculation ──────────────────────────────────────────────────────

export function calculateSeasonRecord(sessions: RecordSession[]): SeasonRecord {
  const record: SeasonRecord = { wins: 0, losses: 0, ties: 0 };
  for (const s of filterSessionsWithResults(sessions)) {
    const r = parseResult(s.result);
    if (r === 'win') record.wins++;
    else if (r === 'loss') record.losses++;
    else if (r === 'tie') record.ties++;
  }
  return record;
}

export function totalGamesPlayed(record: SeasonRecord): number {
  return record.wins + record.losses + record.ties;
}

export function getWinPct(record: SeasonRecord): number {
  const total = totalGamesPlayed(record);
  if (total === 0) return 0;
  return record.wins / total;
}

export function getWinPctLabel(pct: number): string {
  return `${Math.round(pct * 100)}%`;
}

export function hasEnoughDataForRecord(sessions: RecordSession[]): boolean {
  return filterSessionsWithResults(sessions).length > 0;
}

// ─── Boolean checks ──────────────────────────────────────────────────────────

export function isWinningRecord(record: SeasonRecord): boolean {
  return record.wins > record.losses;
}

export function isUnbeatenRecord(record: SeasonRecord): boolean {
  return record.losses === 0 && totalGamesPlayed(record) > 0;
}

export function hasTies(record: SeasonRecord): boolean {
  return record.ties > 0;
}

// ─── String formatting ────────────────────────────────────────────────────────

export function formatRecordString(record: SeasonRecord, includeTies = true): string {
  if (includeTies && hasTies(record)) {
    return `${record.wins}-${record.losses}-${record.ties}`;
  }
  return `${record.wins}-${record.losses}`;
}

export function getRecentFormArray(sessions: RecordSession[], n = 5): ResultValue[] {
  return getLastNGameSessions(sessions, n).map((s) => parseResult(s.result) as ResultValue);
}

export function getRecentFormString(sessions: RecordSession[], n = 5): string {
  return getRecentFormArray(sessions, n)
    .map((r) => (r === 'win' ? 'W' : r === 'loss' ? 'L' : 'T'))
    .join('');
}

export function buildSeasonRecordSummary(record: SeasonRecord): string {
  const total = totalGamesPlayed(record);
  if (total === 0) return 'No games recorded yet';
  const pct = Math.round(getWinPct(record) * 100);
  const base = `${total} game${total !== 1 ? 's' : ''} played, ${pct}% win rate`;
  if (isUnbeatenRecord(record)) return `Unbeaten! ${base}`;
  return base;
}

// ─── Streak ──────────────────────────────────────────────────────────────────

export function getCurrentStreak(sessions: RecordSession[]): StreakData | null {
  const sorted = sortSessionsByDate(filterSessionsWithResults(sessions));
  if (sorted.length === 0) return null;

  const latest = parseResult(sorted[sorted.length - 1].result) as ResultValue;
  let count = 1;
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (parseResult(sorted[i].result) === latest) count++;
    else break;
  }
  return { type: latest, count };
}

export function formatStreakLabel(streak: StreakData | null): string {
  if (!streak) return '';
  const letter = streak.type === 'win' ? 'W' : streak.type === 'loss' ? 'L' : 'T';
  return `${letter}${streak.count}`;
}

// ─── Labels / colors ─────────────────────────────────────────────────────────

export function getRecordLabel(record: SeasonRecord): string {
  const total = totalGamesPlayed(record);
  if (total === 0) return 'No games yet';
  const pct = getWinPct(record);
  if (isUnbeatenRecord(record) && total >= 3) return 'Perfect Season';
  if (pct >= 0.75) return 'Strong Season';
  if (pct >= 0.5) return 'Winning Record';
  if (pct === 0.5 && record.ties === 0) return 'Even Record';
  return 'Building';
}

export function getRecordColor(record: SeasonRecord): string {
  const total = totalGamesPlayed(record);
  if (total === 0) return 'text-zinc-400';
  const pct = getWinPct(record);
  if (pct >= 0.75) return 'text-emerald-400';
  if (pct >= 0.5) return 'text-orange-400';
  return 'text-red-400';
}

export function getResultBadgeClasses(result: ResultValue): string {
  if (result === 'win') return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  if (result === 'loss') return 'bg-red-500/20 text-red-400 border border-red-500/30';
  return 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30';
}

export function getResultLabel(result: ResultValue): string {
  if (result === 'win') return 'W';
  if (result === 'loss') return 'L';
  return 'T';
}

// ─── Breakdown by session type ────────────────────────────────────────────────

export function countBySessionType(
  sessions: RecordSession[],
): Partial<Record<SessionType, SeasonRecord>> {
  const result: Partial<Record<SessionType, SeasonRecord>> = {};
  for (const type of GAME_SESSION_TYPES) {
    const typed = sessions.filter((s) => s.type === type);
    if (filterSessionsWithResults(typed).length > 0) {
      result[type] = calculateSeasonRecord(typed);
    }
  }
  return result;
}
