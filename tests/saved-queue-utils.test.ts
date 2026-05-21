import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildStorageKey,
  generateId,
  listSavedQueues,
  saveQueue,
  deleteQueue,
  renameQueue,
  findQueueById,
  hasSavedQueues,
  countSavedQueues,
  isValidQueueName,
  isEmptyQueue,
  sortByDate,
  formatQueueDuration,
  getQueuePreview,
  countCustomItems,
  countLibraryItems,
  formatSavedAt,
  type SavedQueueItem,
  type SavedQueue,
} from '@/lib/saved-queue-utils';

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
  localStorageMock.clear();
});

afterEach(() => {
  localStorageMock.clear();
});

const TEAM = 'team-xyz';

const ITEM_A: SavedQueueItem = {
  id: 'local-1',
  drillId: 'drill-abc',
  name: 'Figure 8 Dribble',
  durationSecs: 600,
  cues: ['Keep eyes up'],
  description: 'Dribble around cones in a figure-8 pattern',
  category: 'Dribbling',
};

const ITEM_B: SavedQueueItem = {
  id: 'local-2',
  name: 'Custom Shooting Drill',
  durationSecs: 300,
  cues: [],
  description: '',
};

// ── Key helpers ───────────────────────────────────────────────────────────────

describe('buildStorageKey', () => {
  it('contains the teamId', () => {
    expect(buildStorageKey('t1')).toContain('t1');
  });

  it('differs between teams', () => {
    expect(buildStorageKey('t1')).not.toBe(buildStorageKey('t2'));
  });
});

describe('generateId', () => {
  it('starts with sq-', () => {
    expect(generateId()).toMatch(/^sq-/);
  });

  it('produces unique values', () => {
    expect(generateId()).not.toBe(generateId());
  });
});

// ── listSavedQueues ───────────────────────────────────────────────────────────

describe('listSavedQueues', () => {
  it('returns empty array when nothing saved', () => {
    expect(listSavedQueues(TEAM)).toEqual([]);
  });

  it('returns saved queues after saving', () => {
    saveQueue(TEAM, 'My Queue', [ITEM_A]);
    const list = listSavedQueues(TEAM);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('My Queue');
  });

  it('returns newest first', () => {
    // Use explicit timestamps to avoid same-millisecond flakiness
    const key = buildStorageKey(TEAM);
    const entries = [
      { id: 'q1', name: 'Old', items: [ITEM_A], savedAt: 1000 },
      { id: 'q2', name: 'New', items: [ITEM_B], savedAt: 2000 },
    ];
    localStorageMock.setItem(key, JSON.stringify(entries));
    const list = listSavedQueues(TEAM);
    expect(list[0].name).toBe('New');
    expect(list[1].name).toBe('Old');
  });

  it('returns empty array when localStorage has invalid JSON', () => {
    localStorageMock.setItem(buildStorageKey(TEAM), 'not-json');
    expect(listSavedQueues(TEAM)).toEqual([]);
  });

  it('returns empty array when localStorage has non-array JSON', () => {
    localStorageMock.setItem(buildStorageKey(TEAM), '{"id":"x"}');
    expect(listSavedQueues(TEAM)).toEqual([]);
  });
});

// ── saveQueue ─────────────────────────────────────────────────────────────────

describe('saveQueue', () => {
  it('persists the queue and returns it', () => {
    const saved = saveQueue(TEAM, 'Speed Drills', [ITEM_A, ITEM_B]);
    expect(saved.name).toBe('Speed Drills');
    expect(saved.items).toHaveLength(2);
    expect(typeof saved.id).toBe('string');
    expect(saved.savedAt).toBeGreaterThan(0);
  });

  it('trims whitespace from the name', () => {
    const saved = saveQueue(TEAM, '  My Queue  ', [ITEM_A]);
    expect(saved.name).toBe('My Queue');
  });

  it('appends to existing queues rather than replacing', () => {
    saveQueue(TEAM, 'First', [ITEM_A]);
    saveQueue(TEAM, 'Second', [ITEM_B]);
    expect(listSavedQueues(TEAM)).toHaveLength(2);
  });

  it('persists items with all fields intact', () => {
    const saved = saveQueue(TEAM, 'Test', [ITEM_A]);
    const loaded = listSavedQueues(TEAM)[0];
    expect(loaded.items[0]).toEqual(ITEM_A);
  });

  it('can save an empty queue', () => {
    const saved = saveQueue(TEAM, 'Empty', []);
    expect(saved.items).toHaveLength(0);
  });
});

// ── deleteQueue ───────────────────────────────────────────────────────────────

describe('deleteQueue', () => {
  it('removes the queue by id', () => {
    const saved = saveQueue(TEAM, 'To Delete', [ITEM_A]);
    deleteQueue(TEAM, saved.id);
    expect(listSavedQueues(TEAM)).toHaveLength(0);
  });

  it('only removes the targeted queue', () => {
    const a = saveQueue(TEAM, 'A', [ITEM_A]);
    saveQueue(TEAM, 'B', [ITEM_B]);
    deleteQueue(TEAM, a.id);
    const remaining = listSavedQueues(TEAM);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('B');
  });

  it('does not throw when id does not exist', () => {
    expect(() => deleteQueue(TEAM, 'nonexistent')).not.toThrow();
  });
});

// ── renameQueue ───────────────────────────────────────────────────────────────

describe('renameQueue', () => {
  it('renames the queue and returns true', () => {
    const saved = saveQueue(TEAM, 'Old Name', [ITEM_A]);
    const ok = renameQueue(TEAM, saved.id, 'New Name');
    expect(ok).toBe(true);
    expect(listSavedQueues(TEAM)[0].name).toBe('New Name');
  });

  it('returns false when queue does not exist', () => {
    expect(renameQueue(TEAM, 'no-such-id', 'Name')).toBe(false);
  });

  it('trims whitespace from new name', () => {
    const saved = saveQueue(TEAM, 'Old', [ITEM_A]);
    renameQueue(TEAM, saved.id, '  Trimmed  ');
    expect(listSavedQueues(TEAM)[0].name).toBe('Trimmed');
  });
});

// ── findQueueById ─────────────────────────────────────────────────────────────

describe('findQueueById', () => {
  it('returns the matching queue', () => {
    const saved = saveQueue(TEAM, 'Find Me', [ITEM_A]);
    const found = findQueueById(TEAM, saved.id);
    expect(found?.name).toBe('Find Me');
  });

  it('returns null when not found', () => {
    expect(findQueueById(TEAM, 'missing')).toBeNull();
  });
});

// ── Predicates & counts ───────────────────────────────────────────────────────

describe('hasSavedQueues', () => {
  it('returns false when none saved', () => {
    expect(hasSavedQueues(TEAM)).toBe(false);
  });

  it('returns true after saving', () => {
    saveQueue(TEAM, 'Q', [ITEM_A]);
    expect(hasSavedQueues(TEAM)).toBe(true);
  });

  it('returns false after deleting the only queue', () => {
    const saved = saveQueue(TEAM, 'Q', [ITEM_A]);
    deleteQueue(TEAM, saved.id);
    expect(hasSavedQueues(TEAM)).toBe(false);
  });
});

describe('countSavedQueues', () => {
  it('returns 0 when none saved', () => {
    expect(countSavedQueues(TEAM)).toBe(0);
  });

  it('counts correctly after multiple saves', () => {
    saveQueue(TEAM, 'A', [ITEM_A]);
    saveQueue(TEAM, 'B', [ITEM_B]);
    expect(countSavedQueues(TEAM)).toBe(2);
  });
});

describe('isValidQueueName', () => {
  it('returns true for a normal name', () => {
    expect(isValidQueueName('Monday Drills')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidQueueName('')).toBe(false);
  });

  it('returns false for whitespace only', () => {
    expect(isValidQueueName('   ')).toBe(false);
  });

  it('returns false for name longer than 60 chars', () => {
    expect(isValidQueueName('a'.repeat(61))).toBe(false);
  });

  it('returns true for exactly 60 chars', () => {
    expect(isValidQueueName('a'.repeat(60))).toBe(true);
  });

  it('returns true for single character', () => {
    expect(isValidQueueName('A')).toBe(true);
  });
});

describe('isEmptyQueue', () => {
  it('returns true for empty array', () => {
    expect(isEmptyQueue([])).toBe(true);
  });

  it('returns false for non-empty array', () => {
    expect(isEmptyQueue([ITEM_A])).toBe(false);
  });
});

// ── Sorting & display ─────────────────────────────────────────────────────────

describe('sortByDate', () => {
  it('sorts newest first', () => {
    const older: SavedQueue = { id: '1', name: 'Old', items: [], savedAt: 1000 };
    const newer: SavedQueue = { id: '2', name: 'New', items: [], savedAt: 2000 };
    const sorted = sortByDate([older, newer]);
    expect(sorted[0].name).toBe('New');
    expect(sorted[1].name).toBe('Old');
  });

  it('does not mutate the input array', () => {
    const arr: SavedQueue[] = [
      { id: '1', name: 'A', items: [], savedAt: 2000 },
      { id: '2', name: 'B', items: [], savedAt: 1000 },
    ];
    sortByDate(arr);
    expect(arr[0].name).toBe('A');
  });

  it('handles empty array', () => {
    expect(sortByDate([])).toEqual([]);
  });

  it('handles single item', () => {
    const q: SavedQueue = { id: '1', name: 'Solo', items: [], savedAt: 1000 };
    expect(sortByDate([q])).toHaveLength(1);
  });
});

describe('formatQueueDuration', () => {
  it('sums durations and rounds to nearest minute', () => {
    expect(formatQueueDuration([ITEM_A, ITEM_B])).toBe('15m'); // 600+300=900s=15m
  });

  it('returns 0m for empty queue', () => {
    expect(formatQueueDuration([])).toBe('0m');
  });

  it('rounds up correctly', () => {
    const item: SavedQueueItem = { id: 'x', name: 'X', durationSecs: 90, cues: [], description: '' };
    expect(formatQueueDuration([item])).toBe('2m'); // 1.5m rounds to 2m
  });

  it('rounds down correctly', () => {
    const item: SavedQueueItem = { id: 'x', name: 'X', durationSecs: 50, cues: [], description: '' };
    expect(formatQueueDuration([item])).toBe('1m'); // 0.83m rounds to 1m
  });
});

describe('getQueuePreview', () => {
  it('returns first maxItems drill names', () => {
    const queue: SavedQueue = { id: 'q', name: 'Q', savedAt: 0, items: [ITEM_A, ITEM_B] };
    expect(getQueuePreview(queue, 2)).toEqual([ITEM_A.name, ITEM_B.name]);
  });

  it('defaults to first 3 items', () => {
    const items: SavedQueueItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`, name: `Drill ${i}`, durationSecs: 60, cues: [], description: '',
    }));
    const queue: SavedQueue = { id: 'q', name: 'Q', savedAt: 0, items };
    expect(getQueuePreview(queue)).toHaveLength(3);
  });

  it('returns all items when fewer than maxItems', () => {
    const queue: SavedQueue = { id: 'q', name: 'Q', savedAt: 0, items: [ITEM_A] };
    expect(getQueuePreview(queue, 5)).toHaveLength(1);
  });

  it('returns empty array for empty queue', () => {
    const queue: SavedQueue = { id: 'q', name: 'Q', savedAt: 0, items: [] };
    expect(getQueuePreview(queue)).toEqual([]);
  });
});

describe('countCustomItems', () => {
  it('counts items with no drillId', () => {
    expect(countCustomItems([ITEM_A, ITEM_B])).toBe(1); // only ITEM_B has no drillId
  });

  it('returns 0 when all are library drills', () => {
    expect(countCustomItems([ITEM_A])).toBe(0);
  });

  it('returns total when all are custom', () => {
    expect(countCustomItems([ITEM_B])).toBe(1);
  });

  it('handles empty array', () => {
    expect(countCustomItems([])).toBe(0);
  });
});

describe('countLibraryItems', () => {
  it('counts items with a drillId', () => {
    expect(countLibraryItems([ITEM_A, ITEM_B])).toBe(1); // only ITEM_A has drillId
  });

  it('returns 0 when all are custom', () => {
    expect(countLibraryItems([ITEM_B])).toBe(0);
  });

  it('handles empty array', () => {
    expect(countLibraryItems([])).toBe(0);
  });
});

describe('formatSavedAt', () => {
  it('returns a non-empty string for a valid timestamp', () => {
    const ts = new Date('2025-03-15').getTime();
    const result = formatSavedAt(ts);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Mar');
  });

  it('returns a different string for different dates', () => {
    const ts1 = new Date('2025-01-01').getTime();
    const ts2 = new Date('2025-06-01').getTime();
    expect(formatSavedAt(ts1)).not.toBe(formatSavedAt(ts2));
  });
});
