import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildHistoryKey,
  recordDrillRun,
  getDrillRunRecord,
  hasBeenRun,
  wasRunWithinDays,
  getRecentlyRunDrillIds,
  getMostRunDrillIds,
  countTotalRuns,
  clearDrillRunHistory,
  clearAllRunHistory,
  formatLastRun,
  buildRunCountLabel,
  sortDrillsByFreshness,
} from '@/lib/drill-run-history-utils';

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

const TEAM = 'team-abc';
const DRILL_A = 'drill-001';
const DRILL_B = 'drill-002';

// ── buildHistoryKey ───────────────────────────────────────────────────────────

describe('buildHistoryKey', () => {
  it('includes teamId', () => {
    expect(buildHistoryKey('t1')).toContain('t1');
  });

  it('differs between teams', () => {
    expect(buildHistoryKey('t1')).not.toBe(buildHistoryKey('t2'));
  });
});

// ── recordDrillRun ────────────────────────────────────────────────────────────

describe('recordDrillRun', () => {
  it('creates a new record with count 1 on first run', () => {
    recordDrillRun(TEAM, DRILL_A);
    const record = getDrillRunRecord(TEAM, DRILL_A);
    expect(record?.count).toBe(1);
    expect(record?.lastUsedAt).toBeGreaterThan(0);
  });

  it('increments count on subsequent runs', () => {
    recordDrillRun(TEAM, DRILL_A);
    recordDrillRun(TEAM, DRILL_A);
    recordDrillRun(TEAM, DRILL_A);
    expect(getDrillRunRecord(TEAM, DRILL_A)?.count).toBe(3);
  });

  it('tracks different drills independently', () => {
    recordDrillRun(TEAM, DRILL_A);
    recordDrillRun(TEAM, DRILL_B);
    recordDrillRun(TEAM, DRILL_B);
    expect(getDrillRunRecord(TEAM, DRILL_A)?.count).toBe(1);
    expect(getDrillRunRecord(TEAM, DRILL_B)?.count).toBe(2);
  });

  it('updates lastUsedAt on each run', () => {
    recordDrillRun(TEAM, DRILL_A);
    const first = getDrillRunRecord(TEAM, DRILL_A)?.lastUsedAt ?? 0;
    recordDrillRun(TEAM, DRILL_A);
    const second = getDrillRunRecord(TEAM, DRILL_A)?.lastUsedAt ?? 0;
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

// ── getDrillRunRecord ─────────────────────────────────────────────────────────

describe('getDrillRunRecord', () => {
  it('returns null when drill has never been run', () => {
    expect(getDrillRunRecord(TEAM, DRILL_A)).toBeNull();
  });

  it('returns record after running', () => {
    recordDrillRun(TEAM, DRILL_A);
    expect(getDrillRunRecord(TEAM, DRILL_A)).not.toBeNull();
  });

  it('returns null when localStorage has invalid JSON', () => {
    localStorageMock.setItem(buildHistoryKey(TEAM), 'not-json');
    expect(getDrillRunRecord(TEAM, DRILL_A)).toBeNull();
  });

  it('returns null when localStorage has non-object JSON', () => {
    localStorageMock.setItem(buildHistoryKey(TEAM), '[1,2,3]');
    expect(getDrillRunRecord(TEAM, DRILL_A)).toBeNull();
  });
});

// ── hasBeenRun ────────────────────────────────────────────────────────────────

describe('hasBeenRun', () => {
  it('returns false before any run', () => {
    expect(hasBeenRun(TEAM, DRILL_A)).toBe(false);
  });

  it('returns true after a run', () => {
    recordDrillRun(TEAM, DRILL_A);
    expect(hasBeenRun(TEAM, DRILL_A)).toBe(true);
  });
});

// ── wasRunWithinDays ──────────────────────────────────────────────────────────

describe('wasRunWithinDays', () => {
  it('returns false when drill has never been run', () => {
    expect(wasRunWithinDays(TEAM, DRILL_A, 7)).toBe(false);
  });

  it('returns true when run very recently', () => {
    recordDrillRun(TEAM, DRILL_A);
    expect(wasRunWithinDays(TEAM, DRILL_A, 1)).toBe(true);
  });

  it('returns false when run longer ago than the window', () => {
    const pastTs = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
    localStorageMock.setItem(
      buildHistoryKey(TEAM),
      JSON.stringify({ [DRILL_A]: { count: 1, lastUsedAt: pastTs } }),
    );
    expect(wasRunWithinDays(TEAM, DRILL_A, 7)).toBe(false);
  });

  it('returns true when run within the window', () => {
    const pastTs = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago
    localStorageMock.setItem(
      buildHistoryKey(TEAM),
      JSON.stringify({ [DRILL_A]: { count: 1, lastUsedAt: pastTs } }),
    );
    expect(wasRunWithinDays(TEAM, DRILL_A, 7)).toBe(true);
  });
});

// ── getRecentlyRunDrillIds ────────────────────────────────────────────────────

describe('getRecentlyRunDrillIds', () => {
  it('returns empty array when nothing run', () => {
    expect(getRecentlyRunDrillIds(TEAM, 7 * 86400000)).toEqual([]);
  });

  it('returns drills run within the window', () => {
    recordDrillRun(TEAM, DRILL_A);
    const ids = getRecentlyRunDrillIds(TEAM, 24 * 60 * 60 * 1000);
    expect(ids).toContain(DRILL_A);
  });

  it('excludes drills run before the window', () => {
    const oldTs = Date.now() - 10 * 86400000; // 10 days ago
    localStorageMock.setItem(
      buildHistoryKey(TEAM),
      JSON.stringify({ [DRILL_A]: { count: 1, lastUsedAt: oldTs } }),
    );
    const ids = getRecentlyRunDrillIds(TEAM, 7 * 86400000); // within 7 days
    expect(ids).not.toContain(DRILL_A);
  });

  it('returns newest first', () => {
    const now = Date.now();
    localStorageMock.setItem(
      buildHistoryKey(TEAM),
      JSON.stringify({
        [DRILL_A]: { count: 1, lastUsedAt: now - 1000 },
        [DRILL_B]: { count: 1, lastUsedAt: now - 500 },
      }),
    );
    const ids = getRecentlyRunDrillIds(TEAM, 86400000);
    expect(ids[0]).toBe(DRILL_B); // more recent first
  });
});

// ── getMostRunDrillIds ────────────────────────────────────────────────────────

describe('getMostRunDrillIds', () => {
  it('returns empty array when nothing run', () => {
    expect(getMostRunDrillIds(TEAM, 5)).toEqual([]);
  });

  it('returns drills sorted by count descending', () => {
    localStorageMock.setItem(
      buildHistoryKey(TEAM),
      JSON.stringify({
        [DRILL_A]: { count: 3, lastUsedAt: 1000 },
        [DRILL_B]: { count: 7, lastUsedAt: 1000 },
      }),
    );
    const ids = getMostRunDrillIds(TEAM, 5);
    expect(ids[0]).toBe(DRILL_B);
    expect(ids[1]).toBe(DRILL_A);
  });

  it('respects the limit', () => {
    localStorageMock.setItem(
      buildHistoryKey(TEAM),
      JSON.stringify({
        a: { count: 5, lastUsedAt: 0 },
        b: { count: 4, lastUsedAt: 0 },
        c: { count: 3, lastUsedAt: 0 },
      }),
    );
    expect(getMostRunDrillIds(TEAM, 2)).toHaveLength(2);
  });
});

// ── countTotalRuns ────────────────────────────────────────────────────────────

describe('countTotalRuns', () => {
  it('returns 0 when nothing run', () => {
    expect(countTotalRuns(TEAM)).toBe(0);
  });

  it('sums across all drills', () => {
    recordDrillRun(TEAM, DRILL_A);
    recordDrillRun(TEAM, DRILL_A);
    recordDrillRun(TEAM, DRILL_B);
    expect(countTotalRuns(TEAM)).toBe(3);
  });
});

// ── clearDrillRunHistory ──────────────────────────────────────────────────────

describe('clearDrillRunHistory', () => {
  it('removes the targeted drill', () => {
    recordDrillRun(TEAM, DRILL_A);
    recordDrillRun(TEAM, DRILL_B);
    clearDrillRunHistory(TEAM, DRILL_A);
    expect(hasBeenRun(TEAM, DRILL_A)).toBe(false);
    expect(hasBeenRun(TEAM, DRILL_B)).toBe(true);
  });

  it('does not throw when drill does not exist', () => {
    expect(() => clearDrillRunHistory(TEAM, 'nonexistent')).not.toThrow();
  });
});

// ── clearAllRunHistory ────────────────────────────────────────────────────────

describe('clearAllRunHistory', () => {
  it('removes all records for the team', () => {
    recordDrillRun(TEAM, DRILL_A);
    recordDrillRun(TEAM, DRILL_B);
    clearAllRunHistory(TEAM);
    expect(countTotalRuns(TEAM)).toBe(0);
  });

  it('does not throw when nothing stored', () => {
    expect(() => clearAllRunHistory(TEAM)).not.toThrow();
  });
});

// ── formatLastRun ─────────────────────────────────────────────────────────────

describe('formatLastRun', () => {
  it('returns "Today" for very recent timestamps', () => {
    expect(formatLastRun(Date.now() - 1000)).toBe('Today');
  });

  it('returns "Yesterday" for ~24h ago', () => {
    expect(formatLastRun(Date.now() - 25 * 60 * 60 * 1000)).toBe('Yesterday');
  });

  it('returns "Xd ago" for 2-6 days ago', () => {
    expect(formatLastRun(Date.now() - 3 * 24 * 60 * 60 * 1000)).toBe('3d ago');
    expect(formatLastRun(Date.now() - 6 * 24 * 60 * 60 * 1000)).toBe('6d ago');
  });

  it('returns "1 week ago" for 7-13 days ago', () => {
    expect(formatLastRun(Date.now() - 8 * 24 * 60 * 60 * 1000)).toBe('1 week ago');
  });

  it('returns "Xw ago" for 2-4 weeks ago', () => {
    expect(formatLastRun(Date.now() - 14 * 24 * 60 * 60 * 1000)).toBe('2w ago');
    expect(formatLastRun(Date.now() - 21 * 24 * 60 * 60 * 1000)).toBe('3w ago');
  });

  it('returns "Over a month ago" for 30+ days ago', () => {
    expect(formatLastRun(Date.now() - 31 * 24 * 60 * 60 * 1000)).toBe('Over a month ago');
  });
});

// ── buildRunCountLabel ────────────────────────────────────────────────────────

describe('buildRunCountLabel', () => {
  it('returns "Run once" for count 1', () => {
    expect(buildRunCountLabel(1)).toBe('Run once');
  });

  it('returns "Run N×" for count > 1', () => {
    expect(buildRunCountLabel(5)).toBe('Run 5×');
    expect(buildRunCountLabel(2)).toBe('Run 2×');
  });
});

// ── sortDrillsByFreshness ─────────────────────────────────────────────────────

describe('sortDrillsByFreshness', () => {
  it('places never-run drills first', () => {
    recordDrillRun(TEAM, DRILL_A);
    const drills = [{ id: DRILL_A }, { id: DRILL_B }];
    const sorted = sortDrillsByFreshness(drills, TEAM);
    expect(sorted[0].id).toBe(DRILL_B); // never run
  });

  it('sorts by oldest last-run ascending among run drills', () => {
    const now = Date.now();
    localStorageMock.setItem(
      buildHistoryKey(TEAM),
      JSON.stringify({
        [DRILL_A]: { count: 1, lastUsedAt: now - 5000 }, // older
        [DRILL_B]: { count: 1, lastUsedAt: now - 1000 }, // newer
      }),
    );
    const drills = [{ id: DRILL_B }, { id: DRILL_A }];
    const sorted = sortDrillsByFreshness(drills, TEAM);
    expect(sorted[0].id).toBe(DRILL_A); // older = fresher for variety
  });

  it('does not mutate the input array', () => {
    recordDrillRun(TEAM, DRILL_A);
    const drills = [{ id: DRILL_A }, { id: DRILL_B }];
    sortDrillsByFreshness(drills, TEAM);
    expect(drills[0].id).toBe(DRILL_A);
  });

  it('handles empty array', () => {
    expect(sortDrillsByFreshness([], TEAM)).toHaveLength(0);
  });

  it('returns same order for two never-run drills', () => {
    const drills = [{ id: DRILL_A }, { id: DRILL_B }];
    const sorted = sortDrillsByFreshness(drills, TEAM);
    expect(sorted.map((d) => d.id)).toEqual([DRILL_A, DRILL_B]);
  });
});
