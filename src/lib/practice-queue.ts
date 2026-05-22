import type { Drill } from '@/types/database';

const KEY_PREFIX = 'practice-timer-queue-v1';

export function getQueueKey(sessionId: string): string {
  return `${KEY_PREFIX}-${sessionId}`;
}

export interface QueueEntry {
  id: string;
  name: string;
  durationSecs: number;
  cues: string[];
  description: string;
  drillId?: string;
  category?: string;
}

export function readQueue(sessionId: string): QueueEntry[] {
  try {
    const raw = localStorage.getItem(getQueueKey(sessionId));
    return raw ? (JSON.parse(raw) as QueueEntry[]) : [];
  } catch {
    return [];
  }
}

export function readQueuedDrillIds(sessionId: string): Set<string> {
  return new Set(readQueue(sessionId).map((q) => q.drillId).filter(Boolean) as string[]);
}

export function addDrillToQueue(sessionId: string, drill: Drill): void {
  const existing = readQueue(sessionId);
  existing.push({
    id: `drill-${drill.id}-${Date.now()}`,
    name: drill.name,
    durationSecs: (drill.duration_minutes ?? 5) * 60,
    cues: drill.teaching_cues ?? [],
    description: drill.description ?? '',
    drillId: drill.id,
    category: drill.category,
  });
  localStorage.setItem(getQueueKey(sessionId), JSON.stringify(existing));
}
