import { describe, it, expect } from 'vitest';
import {
  countBySentiment,
  countScored,
  getPositiveRatio,
  getUniqueObservedPlayerCount,
  getCategoryCounts,
  getTopCategoriesBySentiment,
  getPlayerObsCounts,
  getStandoutPlayer,
  hasEnoughDataForSnapshot,
  formatSnapshotCategory,
  getHealthLabel,
  getHealthColor,
  getHealthBarColor,
  buildSessionSnapshot,
  type SnapshotObs,
} from '../src/lib/session-snapshot-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const pos = (category: string, playerId?: string, playerName?: string): SnapshotObs => ({
  player_id: playerId ?? 'p1',
  sentiment: 'positive',
  category,
  text: `Good ${category}`,
  players: playerName ? { name: playerName } : { name: 'Alice' },
});

const neg = (category: string, playerId?: string, playerName?: string): SnapshotObs => ({
  player_id: playerId ?? 'p1',
  sentiment: 'needs-work',
  category,
  text: `Needs work on ${category}`,
  players: playerName ? { name: playerName } : { name: 'Alice' },
});

const neutral = (category = 'general'): SnapshotObs => ({
  player_id: null,
  sentiment: 'neutral',
  category,
  text: 'General note',
  players: null,
});

const MIX: SnapshotObs[] = [
  pos('defense', 'p1', 'Alice'),
  pos('defense', 'p1', 'Alice'),
  pos('passing', 'p2', 'Bob'),
  neg('shooting', 'p1', 'Alice'),
  neg('dribbling', 'p2', 'Bob'),
  neutral(),
];

// ─── countBySentiment ────────────────────────────────────────────────────────

describe('countBySentiment', () => {
  it('counts positive obs', () => {
    expect(countBySentiment(MIX, 'positive')).toBe(3);
  });
  it('counts needs-work obs', () => {
    expect(countBySentiment(MIX, 'needs-work')).toBe(2);
  });
  it('counts neutral obs', () => {
    expect(countBySentiment(MIX, 'neutral')).toBe(1);
  });
  it('returns 0 for unknown sentiment', () => {
    expect(countBySentiment(MIX, 'unknown')).toBe(0);
  });
  it('returns 0 for empty array', () => {
    expect(countBySentiment([], 'positive')).toBe(0);
  });
});

// ─── countScored ─────────────────────────────────────────────────────────────

describe('countScored', () => {
  it('counts only positive + needs-work', () => {
    expect(countScored(MIX)).toBe(5);
  });
  it('returns 0 for all-neutral', () => {
    expect(countScored([neutral(), neutral()])).toBe(0);
  });
  it('returns 0 for empty', () => {
    expect(countScored([])).toBe(0);
  });
});

// ─── getPositiveRatio ─────────────────────────────────────────────────────────

describe('getPositiveRatio', () => {
  it('returns 3/5 for MIX', () => {
    expect(getPositiveRatio(MIX)).toBeCloseTo(0.6);
  });
  it('returns 0 for empty', () => {
    expect(getPositiveRatio([])).toBe(0);
  });
  it('returns 0 when no scored obs', () => {
    expect(getPositiveRatio([neutral()])).toBe(0);
  });
  it('returns 1.0 for all-positive', () => {
    const all = [pos('defense'), pos('passing')];
    expect(getPositiveRatio(all)).toBe(1);
  });
  it('returns 0 for all-needs-work', () => {
    const all = [neg('shooting'), neg('dribbling')];
    expect(getPositiveRatio(all)).toBe(0);
  });
});

// ─── getUniqueObservedPlayerCount ─────────────────────────────────────────────

describe('getUniqueObservedPlayerCount', () => {
  it('counts distinct player_ids', () => {
    expect(getUniqueObservedPlayerCount(MIX)).toBe(2);
  });
  it('excludes null player_id (team obs)', () => {
    expect(getUniqueObservedPlayerCount([neutral()])).toBe(0);
  });
  it('returns 0 for empty', () => {
    expect(getUniqueObservedPlayerCount([])).toBe(0);
  });
  it('deduplicates same player', () => {
    const obs = [pos('defense', 'p1'), pos('passing', 'p1'), neg('shooting', 'p1')];
    expect(getUniqueObservedPlayerCount(obs)).toBe(1);
  });
});

// ─── getCategoryCounts ────────────────────────────────────────────────────────

describe('getCategoryCounts', () => {
  it('counts positive categories correctly', () => {
    const counts = getCategoryCounts(MIX, 'positive');
    expect(counts.get('defense')).toBe(2);
    expect(counts.get('passing')).toBe(1);
    expect(counts.has('shooting')).toBe(false);
  });
  it('counts needs-work categories correctly', () => {
    const counts = getCategoryCounts(MIX, 'needs-work');
    expect(counts.get('shooting')).toBe(1);
    expect(counts.get('dribbling')).toBe(1);
  });
  it('skips general category', () => {
    const obs = [
      { ...pos('general'), player_id: 'p1' },
      { ...pos('defense'), player_id: 'p1' },
    ];
    const counts = getCategoryCounts(obs, 'positive');
    expect(counts.has('general')).toBe(false);
    expect(counts.get('defense')).toBe(1);
  });
  it('returns empty map for empty obs', () => {
    expect(getCategoryCounts([], 'positive').size).toBe(0);
  });
});

// ─── getTopCategoriesBySentiment ──────────────────────────────────────────────

describe('getTopCategoriesBySentiment', () => {
  it('returns top 2 positive categories sorted by count', () => {
    const tops = getTopCategoriesBySentiment(MIX, 'positive', 2);
    expect(tops).toHaveLength(2);
    expect(tops[0].category).toBe('defense');
    expect(tops[0].count).toBe(2);
    expect(tops[1].category).toBe('passing');
    expect(tops[1].count).toBe(1);
  });
  it('limits results', () => {
    const tops = getTopCategoriesBySentiment(MIX, 'positive', 1);
    expect(tops).toHaveLength(1);
    expect(tops[0].category).toBe('defense');
  });
  it('returns empty array for no matching obs', () => {
    expect(getTopCategoriesBySentiment([neutral()], 'positive', 2)).toHaveLength(0);
  });
  it('returns needs-work categories correctly', () => {
    const tops = getTopCategoriesBySentiment(MIX, 'needs-work', 2);
    expect(tops).toHaveLength(2);
    const cats = tops.map((t) => t.category);
    expect(cats).toContain('shooting');
    expect(cats).toContain('dribbling');
  });
});

// ─── getPlayerObsCounts ───────────────────────────────────────────────────────

describe('getPlayerObsCounts', () => {
  it('aggregates per-player correctly', () => {
    const players = getPlayerObsCounts(MIX);
    const alice = players.find((p) => p.name === 'Alice');
    const bob = players.find((p) => p.name === 'Bob');
    expect(alice).toBeDefined();
    expect(alice!.totalCount).toBe(3);
    expect(alice!.positiveCount).toBe(2);
    expect(bob).toBeDefined();
    expect(bob!.totalCount).toBe(2);
    expect(bob!.positiveCount).toBe(1);
  });
  it('excludes team obs (null player_id)', () => {
    const players = getPlayerObsCounts(MIX);
    expect(players.every((p) => p.name !== 'Team / General')).toBe(true);
  });
  it('returns empty array for no player obs', () => {
    expect(getPlayerObsCounts([neutral()])).toHaveLength(0);
  });
  it('excludes obs with no players object', () => {
    const obs: SnapshotObs[] = [
      { player_id: 'p1', sentiment: 'positive', category: 'defense', text: 'Good', players: null },
    ];
    expect(getPlayerObsCounts(obs)).toHaveLength(0);
  });
});

// ─── getStandoutPlayer ────────────────────────────────────────────────────────

describe('getStandoutPlayer', () => {
  it('returns player with most positive obs (min 2)', () => {
    const standout = getStandoutPlayer(MIX);
    expect(standout).not.toBeNull();
    expect(standout!.name).toBe('Alice');
    expect(standout!.positiveCount).toBe(2);
  });
  it('returns null when no player has ≥2 positive obs', () => {
    const obs = [
      pos('defense', 'p1', 'Alice'),
      neg('shooting', 'p1', 'Alice'),
    ];
    expect(getStandoutPlayer(obs)).toBeNull();
  });
  it('returns null for empty', () => {
    expect(getStandoutPlayer([])).toBeNull();
  });
  it('prefers higher positive count over higher total', () => {
    const obs: SnapshotObs[] = [
      pos('defense', 'p1', 'Alice'),
      pos('passing', 'p1', 'Alice'),
      pos('defense', 'p2', 'Bob'),
      pos('passing', 'p2', 'Bob'),
      pos('hustle', 'p2', 'Bob'),
      neg('shooting', 'p1', 'Alice'),
      neg('shooting', 'p1', 'Alice'),
    ];
    const standout = getStandoutPlayer(obs);
    expect(standout!.name).toBe('Bob');
    expect(standout!.positiveCount).toBe(3);
  });
});

// ─── hasEnoughDataForSnapshot ─────────────────────────────────────────────────

describe('hasEnoughDataForSnapshot', () => {
  it('returns true for 3 or more obs', () => {
    expect(hasEnoughDataForSnapshot(MIX)).toBe(true);
    const three = [pos('defense'), pos('passing'), neg('shooting')];
    expect(hasEnoughDataForSnapshot(three)).toBe(true);
  });
  it('returns false for fewer than 3 obs', () => {
    expect(hasEnoughDataForSnapshot([])).toBe(false);
    expect(hasEnoughDataForSnapshot([pos('defense')])).toBe(false);
    expect(hasEnoughDataForSnapshot([pos('defense'), neg('shooting')])).toBe(false);
  });
});

// ─── formatSnapshotCategory ───────────────────────────────────────────────────

describe('formatSnapshotCategory', () => {
  it('formats known categories', () => {
    expect(formatSnapshotCategory('dribbling')).toBe('Dribbling');
    expect(formatSnapshotCategory('defense')).toBe('Defense');
    expect(formatSnapshotCategory('hustle')).toBe('Hustle');
    expect(formatSnapshotCategory('teamwork')).toBe('Teamwork');
  });
  it('capitalizes unknown categories', () => {
    expect(formatSnapshotCategory('volleyball')).toBe('Volleyball');
  });
  it('handles empty string', () => {
    expect(formatSnapshotCategory('')).toBe('General');
  });
});

// ─── getHealthLabel ───────────────────────────────────────────────────────────

describe('getHealthLabel', () => {
  it('returns Excellent for ratio ≥0.8', () => {
    expect(getHealthLabel(1)).toBe('Excellent');
    expect(getHealthLabel(0.8)).toBe('Excellent');
  });
  it('returns Good for ratio ≥0.65', () => {
    expect(getHealthLabel(0.7)).toBe('Good');
    expect(getHealthLabel(0.65)).toBe('Good');
  });
  it('returns Mixed for ratio ≥0.5', () => {
    expect(getHealthLabel(0.6)).toBe('Mixed');
    expect(getHealthLabel(0.5)).toBe('Mixed');
  });
  it('returns Needs Work for ratio ≥0.35', () => {
    expect(getHealthLabel(0.4)).toBe('Needs Work');
    expect(getHealthLabel(0.35)).toBe('Needs Work');
  });
  it('returns Tough Day for ratio <0.35', () => {
    expect(getHealthLabel(0.2)).toBe('Tough Day');
    expect(getHealthLabel(0)).toBe('Tough Day');
  });
});

// ─── getHealthColor ───────────────────────────────────────────────────────────

describe('getHealthColor', () => {
  it('returns emerald for high ratios', () => {
    expect(getHealthColor(0.9)).toBe('text-emerald-400');
    expect(getHealthColor(0.65)).toBe('text-emerald-400');
  });
  it('returns amber for mixed', () => {
    expect(getHealthColor(0.55)).toBe('text-amber-400');
  });
  it('returns orange for needs work', () => {
    expect(getHealthColor(0.4)).toBe('text-orange-400');
  });
  it('returns red for tough day', () => {
    expect(getHealthColor(0.1)).toBe('text-red-400');
  });
});

// ─── getHealthBarColor ────────────────────────────────────────────────────────

describe('getHealthBarColor', () => {
  it('returns emerald for ratio ≥0.65', () => {
    expect(getHealthBarColor(0.8)).toBe('bg-emerald-500');
    expect(getHealthBarColor(0.65)).toBe('bg-emerald-500');
  });
  it('returns amber for mixed', () => {
    expect(getHealthBarColor(0.55)).toBe('bg-amber-500');
  });
  it('returns orange for low ratios', () => {
    expect(getHealthBarColor(0.3)).toBe('bg-orange-500');
  });
});

// ─── buildSessionSnapshot ─────────────────────────────────────────────────────

describe('buildSessionSnapshot', () => {
  it('builds correct snapshot for MIX', () => {
    const snap = buildSessionSnapshot(MIX);
    expect(snap.totalObs).toBe(6);
    expect(snap.positiveCount).toBe(3);
    expect(snap.needsWorkCount).toBe(2);
    expect(snap.neutralCount).toBe(1);
    expect(snap.scoredCount).toBe(5);
    expect(snap.positiveRatio).toBeCloseTo(0.6);
    expect(snap.topStrengths[0].category).toBe('defense');
    expect(snap.topGaps).toHaveLength(2);
    expect(snap.standout?.name).toBe('Alice');
    expect(snap.uniquePlayersObserved).toBe(2);
  });

  it('handles all-neutral obs', () => {
    const snap = buildSessionSnapshot([neutral(), neutral(), neutral()]);
    expect(snap.positiveRatio).toBe(0);
    expect(snap.scoredCount).toBe(0);
    expect(snap.standout).toBeNull();
    expect(snap.topStrengths).toHaveLength(0);
    expect(snap.topGaps).toHaveLength(0);
  });

  it('handles empty obs', () => {
    const snap = buildSessionSnapshot([]);
    expect(snap.totalObs).toBe(0);
    expect(snap.positiveRatio).toBe(0);
    expect(snap.standout).toBeNull();
  });

  it('handles all-positive obs', () => {
    const all = [
      pos('defense', 'p1', 'Alice'),
      pos('defense', 'p1', 'Alice'),
      pos('passing', 'p2', 'Bob'),
    ];
    const snap = buildSessionSnapshot(all);
    expect(snap.positiveRatio).toBe(1);
    expect(snap.needsWorkCount).toBe(0);
    expect(snap.topGaps).toHaveLength(0);
    expect(snap.topStrengths[0].category).toBe('defense');
  });

  it('correctly computes uniquePlayersObserved', () => {
    const obs = [
      pos('defense', 'p1', 'Alice'),
      pos('passing', 'p2', 'Bob'),
      pos('hustle', 'p3', 'Carol'),
    ];
    const snap = buildSessionSnapshot(obs);
    expect(snap.uniquePlayersObserved).toBe(3);
  });
});
