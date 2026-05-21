import { describe, it, expect } from 'vitest';
import {
  calculateCategorySkillScore,
  countObsForPlayerCategory,
  rankPlayersByCategory,
  getGroupCount,
  snakeDraft,
  buildGroupsForDrill,
  formatGroupPlayerLabel,
  hasSkillDataForGrouping,
  buildGroupingBasisLabel,
  countPlayersInGroups,
  type GroupablePlayer,
} from '@/lib/player-grouping-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const players: GroupablePlayer[] = [
  { id: 'p1', name: 'Marcus Johnson', jersey_number: 7 },
  { id: 'p2', name: 'Jordan Smith', jersey_number: 12 },
  { id: 'p3', name: 'Tyler Brown', jersey_number: null },
  { id: 'p4', name: 'Sam Davis', jersey_number: 4 },
  { id: 'p5', name: 'Alex Wilson', jersey_number: null },
  { id: 'p6', name: 'Chris Lee', jersey_number: 9 },
];

const obs = [
  // Marcus: 3 positive, 1 needs-work in dribbling → score 75
  { player_id: 'p1', category: 'dribbling', sentiment: 'positive' },
  { player_id: 'p1', category: 'dribbling', sentiment: 'positive' },
  { player_id: 'p1', category: 'dribbling', sentiment: 'positive' },
  { player_id: 'p1', category: 'dribbling', sentiment: 'needs-work' },
  // Jordan: 1 positive, 3 needs-work in dribbling → score 25
  { player_id: 'p2', category: 'dribbling', sentiment: 'positive' },
  { player_id: 'p2', category: 'dribbling', sentiment: 'needs-work' },
  { player_id: 'p2', category: 'dribbling', sentiment: 'needs-work' },
  { player_id: 'p2', category: 'dribbling', sentiment: 'needs-work' },
  // Tyler: 2 positive, 0 needs-work → score 100
  { player_id: 'p3', category: 'dribbling', sentiment: 'positive' },
  { player_id: 'p3', category: 'dribbling', sentiment: 'positive' },
  // Sam: no dribbling obs → score 50
  { player_id: 'p4', category: 'defense', sentiment: 'positive' },
  // Alex: 0 positive, 2 needs-work → score 0
  { player_id: 'p5', category: 'dribbling', sentiment: 'needs-work' },
  { player_id: 'p5', category: 'dribbling', sentiment: 'needs-work' },
  // Chris: 1 positive, 1 needs-work → score 50
  { player_id: 'p6', category: 'dribbling', sentiment: 'positive' },
  { player_id: 'p6', category: 'dribbling', sentiment: 'needs-work' },
  // some defense obs to test category isolation
  { player_id: 'p1', category: 'defense', sentiment: 'needs-work' },
  { player_id: 'p2', category: 'defense', sentiment: 'positive' },
];

// ─── calculateCategorySkillScore ─────────────────────────────────────────────

describe('calculateCategorySkillScore', () => {
  it('returns 50 when no observations', () => {
    expect(calculateCategorySkillScore(0, 0)).toBe(50);
  });

  it('returns 100 when all positive', () => {
    expect(calculateCategorySkillScore(5, 0)).toBe(100);
  });

  it('returns 0 when all needs-work', () => {
    expect(calculateCategorySkillScore(0, 4)).toBe(0);
  });

  it('returns 75 for 3 positive and 1 needs-work', () => {
    expect(calculateCategorySkillScore(3, 1)).toBe(75);
  });

  it('returns 25 for 1 positive and 3 needs-work', () => {
    expect(calculateCategorySkillScore(1, 3)).toBe(25);
  });

  it('returns 50 for equal positive and needs-work', () => {
    expect(calculateCategorySkillScore(2, 2)).toBe(50);
  });

  it('rounds to nearest integer', () => {
    // 2/3 = 66.67 → rounds to 67
    expect(calculateCategorySkillScore(2, 1)).toBe(67);
  });
});

// ─── countObsForPlayerCategory ───────────────────────────────────────────────

describe('countObsForPlayerCategory', () => {
  it('returns 0 for empty observations', () => {
    expect(countObsForPlayerCategory('p1', 'dribbling', 'positive', [])).toBe(0);
  });

  it('counts positive obs correctly', () => {
    expect(countObsForPlayerCategory('p1', 'dribbling', 'positive', obs)).toBe(3);
  });

  it('counts needs-work obs correctly', () => {
    expect(countObsForPlayerCategory('p2', 'dribbling', 'needs-work', obs)).toBe(3);
  });

  it('returns 0 for wrong player', () => {
    expect(countObsForPlayerCategory('p99', 'dribbling', 'positive', obs)).toBe(0);
  });

  it('returns 0 for wrong category', () => {
    expect(countObsForPlayerCategory('p1', 'shooting', 'positive', obs)).toBe(0);
  });

  it('is case-insensitive for category', () => {
    const mixedCase = [{ player_id: 'p1', category: 'Dribbling', sentiment: 'positive' }];
    expect(countObsForPlayerCategory('p1', 'dribbling', 'positive', mixedCase)).toBe(1);
    expect(countObsForPlayerCategory('p1', 'DRIBBLING', 'positive', mixedCase)).toBe(1);
  });

  it('does not count wrong sentiment', () => {
    expect(countObsForPlayerCategory('p1', 'dribbling', 'needs-work', obs)).toBe(1);
  });
});

// ─── rankPlayersByCategory ───────────────────────────────────────────────────

describe('rankPlayersByCategory', () => {
  it('returns empty array for empty players', () => {
    expect(rankPlayersByCategory([], 'dribbling', obs)).toHaveLength(0);
  });

  it('returns all players with score 50 when no category', () => {
    const result = rankPlayersByCategory(players, undefined, obs);
    expect(result).toHaveLength(players.length);
    result.forEach((p) => expect(p.skillScore).toBe(50));
  });

  it('sorts players by skill score descending', () => {
    const result = rankPlayersByCategory(players, 'dribbling', obs);
    // Tyler (100) > Marcus (75) > Sam/Chris (50) > Jordan (25) > Alex (0)
    expect(result[0].id).toBe('p3'); // Tyler: 100
    expect(result[1].id).toBe('p1'); // Marcus: 75
    expect(result[result.length - 1].id).toBe('p5'); // Alex: 0
  });

  it('populates positiveCount and needsWorkCount', () => {
    const result = rankPlayersByCategory(players, 'dribbling', obs);
    const marcus = result.find((p) => p.id === 'p1')!;
    expect(marcus.positiveCount).toBe(3);
    expect(marcus.needsWorkCount).toBe(1);
  });

  it('gives score 50 to players with no obs in category', () => {
    const result = rankPlayersByCategory(players, 'dribbling', obs);
    const sam = result.find((p) => p.id === 'p4')!;
    expect(sam.skillScore).toBe(50);
  });

  it('does not mix categories', () => {
    const result = rankPlayersByCategory(players, 'defense', obs);
    const marcus = result.find((p) => p.id === 'p1')!;
    // Marcus has 0 positive and 1 needs-work in defense → score 0
    expect(marcus.positiveCount).toBe(0);
    expect(marcus.needsWorkCount).toBe(1);
  });
});

// ─── getGroupCount ───────────────────────────────────────────────────────────

describe('getGroupCount', () => {
  it('returns 1 for 1 player', () => expect(getGroupCount(1)).toBe(1));
  it('returns 1 for 4 players', () => expect(getGroupCount(4)).toBe(1));
  it('returns 2 for 5 players', () => expect(getGroupCount(5)).toBe(2));
  it('returns 2 for 8 players', () => expect(getGroupCount(8)).toBe(2));
  it('returns 3 for 9 players', () => expect(getGroupCount(9)).toBe(3));
  it('returns 3 for 12 players', () => expect(getGroupCount(12)).toBe(3));
  it('returns 4 for 13 players', () => expect(getGroupCount(13)).toBe(4));
  it('returns 4 for 20 players', () => expect(getGroupCount(20)).toBe(4));
});

// ─── snakeDraft ──────────────────────────────────────────────────────────────

describe('snakeDraft', () => {
  it('returns empty groups for empty items', () => {
    const result = snakeDraft([], 3);
    expect(result).toHaveLength(3);
    result.forEach((g) => expect(g).toHaveLength(0));
  });

  it('returns empty array for 0 groups', () => {
    expect(snakeDraft([1, 2, 3], 0)).toHaveLength(0);
  });

  it('distributes 6 players into 3 groups evenly', () => {
    const result = snakeDraft([1, 2, 3, 4, 5, 6], 3);
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toHaveLength(2);
    expect(result[2]).toHaveLength(2);
  });

  it('snake-drafts correctly: best and worst in same group', () => {
    // Players ranked 1-6 into 3 groups → G0:[1,6], G1:[2,5], G2:[3,4]
    const result = snakeDraft([1, 2, 3, 4, 5, 6], 3);
    expect(result[0]).toContain(1);
    expect(result[0]).toContain(6);
    expect(result[1]).toContain(2);
    expect(result[1]).toContain(5);
    expect(result[2]).toContain(3);
    expect(result[2]).toContain(4);
  });

  it('handles uneven distribution', () => {
    // 7 players into 2 groups → G0:[4], G1:[3]
    const result = snakeDraft([1, 2, 3, 4, 5, 6, 7], 2);
    expect(result[0].length + result[1].length).toBe(7);
  });

  it('distributes 12 players into 3 groups of 4', () => {
    const items = Array.from({ length: 12 }, (_, i) => i + 1);
    const result = snakeDraft(items, 3);
    result.forEach((g) => expect(g).toHaveLength(4));
  });

  it('places items in correct snake order (2 groups, 4 items)', () => {
    // → G0:[1,4], G1:[2,3]
    const result = snakeDraft([1, 2, 3, 4], 2);
    expect(result[0]).toContain(1);
    expect(result[0]).toContain(4);
    expect(result[1]).toContain(2);
    expect(result[1]).toContain(3);
  });
});

// ─── buildGroupsForDrill ─────────────────────────────────────────────────────

describe('buildGroupsForDrill', () => {
  it('returns empty array for empty players', () => {
    expect(buildGroupsForDrill([], 'dribbling', obs)).toHaveLength(0);
  });

  it('returns 1 group labeled "Full Team" for 4 or fewer players', () => {
    const result = buildGroupsForDrill(players.slice(0, 4), 'dribbling', obs);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Full Team');
    expect(result[0].players).toHaveLength(4);
  });

  it('returns 2 groups for 6 players', () => {
    const result = buildGroupsForDrill(players, 'dribbling', obs);
    expect(result).toHaveLength(2);
  });

  it('labels groups A and B for 2 groups', () => {
    const result = buildGroupsForDrill(players, 'dribbling', obs);
    expect(result[0].label).toBe('Group A');
    expect(result[1].label).toBe('Group B');
  });

  it('assigns colorClass to each group', () => {
    const result = buildGroupsForDrill(players, 'dribbling', obs);
    result.forEach((g) => expect(g.colorClass).toBeTruthy());
  });

  it('each player appears exactly once across all groups', () => {
    const result = buildGroupsForDrill(players, 'dribbling', obs);
    const allIds = result.flatMap((g) => g.players.map((p) => p.id));
    expect(allIds).toHaveLength(players.length);
    expect(new Set(allIds).size).toBe(players.length);
  });

  it('works without a category (no crash)', () => {
    const result = buildGroupsForDrill(players, undefined, obs);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns 3 groups for 9 players', () => {
    const ninePlayers: GroupablePlayer[] = Array.from({ length: 9 }, (_, i) => ({
      id: `player-${i}`,
      name: `Player ${i}`,
      jersey_number: i + 1,
    }));
    const result = buildGroupsForDrill(ninePlayers, 'dribbling', []);
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe('Group A');
    expect(result[1].label).toBe('Group B');
    expect(result[2].label).toBe('Group C');
  });
});

// ─── formatGroupPlayerLabel ───────────────────────────────────────────────────

describe('formatGroupPlayerLabel', () => {
  it('includes jersey number when set', () => {
    const p = { id: 'x', name: 'Marcus Johnson', jersey_number: 7 };
    expect(formatGroupPlayerLabel(p)).toBe('#7 Marcus');
  });

  it('uses first name only when jersey is null', () => {
    const p = { id: 'x', name: 'Tyler Brown', jersey_number: null };
    expect(formatGroupPlayerLabel(p)).toBe('Tyler');
  });

  it('works for single-word names', () => {
    const p = { id: 'x', name: 'Marcus', jersey_number: null };
    expect(formatGroupPlayerLabel(p)).toBe('Marcus');
  });

  it('uses jersey 0 correctly', () => {
    const p = { id: 'x', name: 'Jordan Smith', jersey_number: 0 };
    expect(formatGroupPlayerLabel(p)).toBe('#0 Jordan');
  });
});

// ─── hasSkillDataForGrouping ──────────────────────────────────────────────────

describe('hasSkillDataForGrouping', () => {
  it('returns false when no category', () => {
    expect(hasSkillDataForGrouping(players, undefined, obs)).toBe(false);
  });

  it('returns false when fewer than 2 players', () => {
    expect(hasSkillDataForGrouping([players[0]], 'dribbling', obs)).toBe(false);
  });

  it('returns false when fewer than 2 players have category obs', () => {
    // Only p1 has dribbling obs → false
    const singleObs = [{ player_id: 'p1', category: 'dribbling', sentiment: 'positive' }];
    expect(hasSkillDataForGrouping(players, 'dribbling', singleObs)).toBe(false);
  });

  it('returns true when ≥2 players have category obs', () => {
    expect(hasSkillDataForGrouping(players, 'dribbling', obs)).toBe(true);
  });

  it('is case-insensitive for category', () => {
    expect(hasSkillDataForGrouping(players, 'DRIBBLING', obs)).toBe(true);
  });

  it('only counts players in the provided players array', () => {
    const onePlayer = [players[0]]; // only p1
    // p1 and p2 both have dribbling obs, but p2 is not in players array
    expect(hasSkillDataForGrouping(onePlayer, 'dribbling', obs)).toBe(false);
  });
});

// ─── buildGroupingBasisLabel ──────────────────────────────────────────────────

describe('buildGroupingBasisLabel', () => {
  it('returns "Balanced evenly" when no category', () => {
    expect(buildGroupingBasisLabel(undefined, false)).toBe('Balanced evenly');
  });

  it('returns "Balanced evenly" when no data despite having category', () => {
    expect(buildGroupingBasisLabel('dribbling', false)).toBe('Balanced evenly');
  });

  it('returns "Balanced by Dribbling history" when data exists', () => {
    expect(buildGroupingBasisLabel('dribbling', true)).toBe('Balanced by Dribbling history');
  });

  it('capitalizes first letter of category', () => {
    expect(buildGroupingBasisLabel('defense', true)).toBe('Balanced by Defense history');
  });
});

// ─── countPlayersInGroups ─────────────────────────────────────────────────────

describe('countPlayersInGroups', () => {
  it('returns 0 for empty groups', () => {
    expect(countPlayersInGroups([])).toBe(0);
  });

  it('counts players across all groups', () => {
    const groups = buildGroupsForDrill(players, 'dribbling', obs);
    expect(countPlayersInGroups(groups)).toBe(players.length);
  });
});
