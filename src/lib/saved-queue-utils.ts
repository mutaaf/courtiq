// User-saved drill queue templates stored per-team in localStorage.
// Coaches save a named snapshot of their current drill queue and reload it
// in future practices — especially useful for weekly repeat sessions.

export interface SavedQueueItem {
  id: string;
  drillId?: string;
  name: string;
  durationSecs: number;
  cues: string[];
  description: string;
  category?: string;
}

export interface SavedQueue {
  id: string;
  name: string;
  items: SavedQueueItem[];
  savedAt: number; // Date.now() timestamp
}

// ── Storage helpers ───────────────────────────────────────────────────────────

export function buildStorageKey(teamId: string): string {
  return `saved-queue:${teamId}`;
}

export function generateId(): string {
  return `sq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function readAll(teamId: string): SavedQueue[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(buildStorageKey(teamId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedQueue[]) : [];
  } catch {
    return [];
  }
}

function writeAll(teamId: string, queues: SavedQueue[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(buildStorageKey(teamId), JSON.stringify(queues));
  } catch {
    // localStorage quota errors are non-fatal
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function listSavedQueues(teamId: string): SavedQueue[] {
  return sortByDate(readAll(teamId));
}

export function saveQueue(
  teamId: string,
  name: string,
  items: SavedQueueItem[],
): SavedQueue {
  const entry: SavedQueue = {
    id: generateId(),
    name: name.trim(),
    items,
    savedAt: Date.now(),
  };
  writeAll(teamId, [...readAll(teamId), entry]);
  return entry;
}

export function deleteQueue(teamId: string, queueId: string): void {
  writeAll(teamId, readAll(teamId).filter((q) => q.id !== queueId));
}

export function renameQueue(
  teamId: string,
  queueId: string,
  newName: string,
): boolean {
  const all = readAll(teamId);
  const idx = all.findIndex((q) => q.id === queueId);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], name: newName.trim() };
  writeAll(teamId, all);
  return true;
}

export function findQueueById(
  teamId: string,
  queueId: string,
): SavedQueue | null {
  return readAll(teamId).find((q) => q.id === queueId) ?? null;
}

// ── Predicates & counts ───────────────────────────────────────────────────────

export function hasSavedQueues(teamId: string): boolean {
  return readAll(teamId).length > 0;
}

export function countSavedQueues(teamId: string): number {
  return readAll(teamId).length;
}

export function isValidQueueName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 60;
}

export function isEmptyQueue(items: SavedQueueItem[]): boolean {
  return items.length === 0;
}

// ── Sorting & display ─────────────────────────────────────────────────────────

export function sortByDate(queues: SavedQueue[]): SavedQueue[] {
  return [...queues].sort((a, b) => b.savedAt - a.savedAt);
}

export function formatQueueDuration(items: SavedQueueItem[]): string {
  const totalSecs = items.reduce((sum, i) => sum + i.durationSecs, 0);
  const mins = Math.round(totalSecs / 60);
  return `${mins}m`;
}

export function getQueuePreview(queue: SavedQueue, maxItems = 3): string[] {
  return queue.items.slice(0, maxItems).map((i) => i.name);
}

export function countCustomItems(items: SavedQueueItem[]): number {
  return items.filter((i) => !i.drillId).length;
}

export function countLibraryItems(items: SavedQueueItem[]): number {
  return items.filter((i) => !!i.drillId).length;
}

export function formatSavedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
