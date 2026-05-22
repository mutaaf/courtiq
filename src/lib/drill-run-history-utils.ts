// Per-team drill run history stored in localStorage.
// Records each time a drill is started in the Practice Timer so the drill
// picker can show "last used X days ago" and surface under-used drills for
// variety — preventing coaches from defaulting to the same 3 drills every week.

export interface DrillRunRecord {
  count: number;
  lastUsedAt: number; // Date.now() timestamp
}

type RunHistoryMap = Record<string, DrillRunRecord>;

// ── Storage ───────────────────────────────────────────────────────────────────

export function buildHistoryKey(teamId: string): string {
  return `drill-run-history:${teamId}`;
}

function readMap(teamId: string): RunHistoryMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(buildHistoryKey(teamId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as RunHistoryMap)
      : {};
  } catch {
    return {};
  }
}

function writeMap(teamId: string, map: RunHistoryMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(buildHistoryKey(teamId), JSON.stringify(map));
  } catch {
    // quota errors are non-fatal
  }
}

// ── Record & read ─────────────────────────────────────────────────────────────

export function recordDrillRun(teamId: string, drillId: string): void {
  const map = readMap(teamId);
  const prev = map[drillId] ?? { count: 0, lastUsedAt: 0 };
  map[drillId] = { count: prev.count + 1, lastUsedAt: Date.now() };
  writeMap(teamId, map);
}

export function getDrillRunRecord(
  teamId: string,
  drillId: string,
): DrillRunRecord | null {
  return readMap(teamId)[drillId] ?? null;
}

export function hasBeenRun(teamId: string, drillId: string): boolean {
  return getDrillRunRecord(teamId, drillId) !== null;
}

// ── Predicates ────────────────────────────────────────────────────────────────

export function wasRunWithinDays(
  teamId: string,
  drillId: string,
  days: number,
): boolean {
  const record = getDrillRunRecord(teamId, drillId);
  if (!record) return false;
  const daysAgo = (Date.now() - record.lastUsedAt) / (1000 * 60 * 60 * 24);
  return daysAgo <= days;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getRecentlyRunDrillIds(
  teamId: string,
  withinMs: number,
): string[] {
  const map = readMap(teamId);
  const cutoff = Date.now() - withinMs;
  return Object.entries(map)
    .filter(([, v]) => v.lastUsedAt >= cutoff)
    .sort(([, a], [, b]) => b.lastUsedAt - a.lastUsedAt)
    .map(([id]) => id);
}

export function getMostRunDrillIds(teamId: string, limit: number): string[] {
  const map = readMap(teamId);
  return Object.entries(map)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, limit)
    .map(([id]) => id);
}

export function countTotalRuns(teamId: string): number {
  const map = readMap(teamId);
  return Object.values(map).reduce((sum, v) => sum + v.count, 0);
}

// ── Clearing ──────────────────────────────────────────────────────────────────

export function clearDrillRunHistory(teamId: string, drillId: string): void {
  const map = readMap(teamId);
  delete map[drillId];
  writeMap(teamId, map);
}

export function clearAllRunHistory(teamId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(buildHistoryKey(teamId));
  } catch {
    // ignore
  }
}

// ── Display ───────────────────────────────────────────────────────────────────

export function formatLastRun(lastUsedAt: number): string {
  const ageMs = Date.now() - lastUsedAt;
  const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return 'Over a month ago';
}

export function buildRunCountLabel(count: number): string {
  if (count === 1) return 'Run once';
  return `Run ${count}×`;
}

// ── Sorting ───────────────────────────────────────────────────────────────────

// Freshest-first: never-run drills come first, then oldest-last-run, newest-last-run last.
// Coaches benefit from variety — this prevents the same drills dominating every session.
export function sortDrillsByFreshness<T extends { id: string }>(
  drills: T[],
  teamId: string,
): T[] {
  const map = readMap(teamId);
  return [...drills].sort((a, b) => {
    const ra = map[a.id];
    const rb = map[b.id];
    if (!ra && !rb) return 0;   // both never run → keep original order
    if (!ra) return -1;          // a never run → float to top
    if (!rb) return 1;           // b never run → float to top
    return ra.lastUsedAt - rb.lastUsedAt; // least-recently-run floats up
  });
}
