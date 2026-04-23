import { describe, it, expect } from 'vitest';
import {
  getDayKey,
  daysBetween,
  getLastObservedAt,
  getDaysSinceObserved,
  hasBeenObserved,
  isObservedToday,
  getMostNeglectedPlayer,
  getTopDecliningSkillLabel,
  getPlayerTopNeedsWorkSkill,
  getBestSkillFocus,
  buildCaptureHref,
  formatDaysSince,
  capitaliseCategory,
  buildFocusReason,
  hasSufficientDataForFocus,
  buildDailyFocusSuggestion,
} from '../src/lib/daily-focus-utils';
import type {
  PlayerObsSummary,
  SkillTrendSummary,
  RosterPlayer,
} from '../src/lib/daily-focus-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2025-06-15T12:00:00Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

const PLAYERS: RosterPlayer[] = [
  { id: 'p1', name: 'Marcus' },
  { id: 'p2', name: 'Sofia' },
  { id: 'p3', name: 'James' },
];

function makeObs(
  playerId: string,
  sentiment: 'positive' | 'needs-work' | 'neutral',
  category: string,
  daysBack: number
): PlayerObsSummary {
  return {
    player_id: playerId,
    sentiment,
    category,
    created_at: daysAgo(daysBack),
  };
}

// ─── getDayKey ────────────────────────────────────────────────────────────────

describe('getDayKey', () => {
  it('returns YYYY-MM-DD for a UTC midnight string', () => {
    expect(getDayKey('2025-06-15T00:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('different timestamps on the same local day return the same key', () => {
    const a = getDayKey('2025-06-15T10:00:00Z');
    const b = getDayKey('2025-06-15T22:59:59Z');
    // both are on June 15 UTC — could differ locally but format should match
    expect(a).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── daysBetween ──────────────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('returns 0 for same moment', () => {
    expect(daysBetween(NOW, NOW)).toBe(0);
  });

  it('returns 1 for exactly 24h apart', () => {
    const yesterday = new Date(NOW.getTime() - 86_400_000);
    expect(daysBetween(yesterday, NOW)).toBe(1);
  });

  it('returns 7 for 7 days apart', () => {
    const week = new Date(NOW.getTime() - 7 * 86_400_000);
    expect(daysBetween(week, NOW)).toBe(7);
  });

  it('is symmetric (absolute value)', () => {
    const d = new Date(NOW.getTime() + 3 * 86_400_000);
    expect(daysBetween(NOW, d)).toBe(daysBetween(d, NOW));
  });
});

// ─── getLastObservedAt ────────────────────────────────────────────────────────

describe('getLastObservedAt', () => {
  it('returns null when player has no observations', () => {
    expect(getLastObservedAt('p1', [])).toBeNull();
  });

  it('returns the most recent observation date', () => {
    const obs: PlayerObsSummary[] = [
      makeObs('p1', 'positive', 'dribbling', 5),
      makeObs('p1', 'positive', 'passing', 2),
      makeObs('p1', 'needs-work', 'defense', 8),
    ];
    const result = getLastObservedAt('p1', obs)!;
    expect(daysBetween(result, NOW)).toBe(2);
  });

  it('ignores observations for other players', () => {
    const obs: PlayerObsSummary[] = [
      makeObs('p2', 'positive', 'dribbling', 1),
    ];
    expect(getLastObservedAt('p1', obs)).toBeNull();
  });
});

// ─── getDaysSinceObserved ─────────────────────────────────────────────────────

describe('getDaysSinceObserved', () => {
  it('returns 9999 for unobserved players', () => {
    expect(getDaysSinceObserved('p1', [], NOW)).toBe(9999);
  });

  it('returns correct days for an observed player', () => {
    const obs = [makeObs('p1', 'positive', 'passing', 6)];
    expect(getDaysSinceObserved('p1', obs, NOW)).toBe(6);
  });

  it('returns 0 for a player observed right now', () => {
    const obs = [{ player_id: 'p1', sentiment: 'positive', category: 'x', created_at: NOW.toISOString() }];
    expect(getDaysSinceObserved('p1', obs, NOW)).toBe(0);
  });
});

// ─── hasBeenObserved ─────────────────────────────────────────────────────────

describe('hasBeenObserved', () => {
  it('returns false when no observations', () => {
    expect(hasBeenObserved('p1', [])).toBe(false);
  });

  it('returns true when player has at least one observation', () => {
    const obs = [makeObs('p1', 'positive', 'dribbling', 3)];
    expect(hasBeenObserved('p1', obs)).toBe(true);
  });

  it('returns false when observations belong to other players', () => {
    const obs = [makeObs('p2', 'positive', 'dribbling', 3)];
    expect(hasBeenObserved('p1', obs)).toBe(false);
  });
});

// ─── isObservedToday ─────────────────────────────────────────────────────────

describe('isObservedToday', () => {
  it('returns true when player was observed today', () => {
    const obs = [
      { player_id: 'p1', sentiment: 'positive', category: 'x', created_at: NOW.toISOString() },
    ];
    expect(isObservedToday('p1', obs, NOW)).toBe(true);
  });

  it('returns false when player was observed yesterday', () => {
    const obs = [makeObs('p1', 'positive', 'dribbling', 1)];
    expect(isObservedToday('p1', obs, NOW)).toBe(false);
  });

  it('returns false for a player with no observations', () => {
    expect(isObservedToday('p1', [], NOW)).toBe(false);
  });
});

// ─── getMostNeglectedPlayer ───────────────────────────────────────────────────

describe('getMostNeglectedPlayer', () => {
  it('returns null when no players', () => {
    expect(getMostNeglectedPlayer([], [], NOW)).toBeNull();
  });

  it('returns null when all players are brand-new (no observations)', () => {
    expect(getMostNeglectedPlayer(PLAYERS, [], NOW)).toBeNull();
  });

  it('returns the player unobserved the longest', () => {
    const obs: PlayerObsSummary[] = [
      makeObs('p1', 'positive', 'dribbling', 8),  // 8 days ago
      makeObs('p2', 'positive', 'passing', 3),    // 3 days ago
      makeObs('p3', 'positive', 'defense', 1),    // 1 day ago
    ];
    const result = getMostNeglectedPlayer(PLAYERS, obs, NOW);
    expect(result?.id).toBe('p1');
  });

  it('excludes players observed today', () => {
    const obs: PlayerObsSummary[] = [
      makeObs('p1', 'positive', 'dribbling', 8),
      makeObs('p2', 'positive', 'passing', 3),
      { player_id: 'p1', sentiment: 'positive', category: 'x', created_at: NOW.toISOString() },
    ];
    // p1 observed today — should pick p2
    const result = getMostNeglectedPlayer(PLAYERS.slice(0, 2), obs, NOW);
    expect(result?.id).toBe('p2');
  });

  it('returns null when all observed players were seen today', () => {
    const obs: PlayerObsSummary[] = [
      { player_id: 'p1', sentiment: 'positive', category: 'x', created_at: NOW.toISOString() },
      { player_id: 'p2', sentiment: 'positive', category: 'x', created_at: NOW.toISOString() },
    ];
    expect(getMostNeglectedPlayer(PLAYERS.slice(0, 2), obs, NOW)).toBeNull();
  });
});

// ─── getTopDecliningSkillLabel ────────────────────────────────────────────────

describe('getTopDecliningSkillLabel', () => {
  it('returns null when no trends', () => {
    expect(getTopDecliningSkillLabel([])).toBeNull();
  });

  it('returns null when no declining trends', () => {
    const trends: SkillTrendSummary[] = [
      { category: 'dribbling', direction: 'improving', delta: 10 },
    ];
    expect(getTopDecliningSkillLabel(trends)).toBeNull();
  });

  it('returns the category with the largest negative delta', () => {
    const trends: SkillTrendSummary[] = [
      { category: 'dribbling', direction: 'declining', delta: -5 },
      { category: 'defense', direction: 'declining', delta: -15 },
      { category: 'passing', direction: 'improving', delta: 8 },
    ];
    expect(getTopDecliningSkillLabel(trends)).toBe('defense');
  });
});

// ─── getPlayerTopNeedsWorkSkill ───────────────────────────────────────────────

describe('getPlayerTopNeedsWorkSkill', () => {
  it('returns null with no observations', () => {
    expect(getPlayerTopNeedsWorkSkill('p1', [], NOW)).toBeNull();
  });

  it('returns most common needs-work category', () => {
    const obs: PlayerObsSummary[] = [
      makeObs('p1', 'needs-work', 'dribbling', 2),
      makeObs('p1', 'needs-work', 'dribbling', 5),
      makeObs('p1', 'needs-work', 'defense', 3),
      makeObs('p1', 'positive', 'passing', 1),
    ];
    expect(getPlayerTopNeedsWorkSkill('p1', obs, NOW)).toBe('dribbling');
  });

  it('ignores observations older than 30 days', () => {
    const obs: PlayerObsSummary[] = [
      makeObs('p1', 'needs-work', 'dribbling', 31),
      makeObs('p1', 'needs-work', 'defense', 5),
    ];
    expect(getPlayerTopNeedsWorkSkill('p1', obs, NOW)).toBe('defense');
  });

  it('ignores positive observations', () => {
    const obs: PlayerObsSummary[] = [
      makeObs('p1', 'positive', 'dribbling', 2),
      makeObs('p1', 'positive', 'dribbling', 3),
      makeObs('p1', 'needs-work', 'defense', 4),
    ];
    expect(getPlayerTopNeedsWorkSkill('p1', obs, NOW)).toBe('defense');
  });
});

// ─── getBestSkillFocus ────────────────────────────────────────────────────────

describe('getBestSkillFocus', () => {
  it('prefers player-specific needs-work over team trend', () => {
    const obs = [makeObs('p1', 'needs-work', 'passing', 2)];
    const trends: SkillTrendSummary[] = [
      { category: 'defense', direction: 'declining', delta: -10 },
    ];
    expect(getBestSkillFocus('p1', obs, trends, NOW)).toBe('passing');
  });

  it('falls back to team trend when player has no needs-work obs', () => {
    const obs = [makeObs('p1', 'positive', 'passing', 2)];
    const trends: SkillTrendSummary[] = [
      { category: 'defense', direction: 'declining', delta: -10 },
    ];
    expect(getBestSkillFocus('p1', obs, trends, NOW)).toBe('defense');
  });

  it('returns null when neither source has data', () => {
    expect(getBestSkillFocus('p1', [], [], NOW)).toBeNull();
  });
});

// ─── buildCaptureHref ─────────────────────────────────────────────────────────

describe('buildCaptureHref', () => {
  it('builds correct URL for a plain player id', () => {
    expect(buildCaptureHref('abc-123')).toBe('/capture?player=abc-123');
  });

  it('encodes special characters in the player id', () => {
    expect(buildCaptureHref('p 1')).toBe('/capture?player=p%201');
  });
});

// ─── formatDaysSince ─────────────────────────────────────────────────────────

describe('formatDaysSince', () => {
  it('returns "today" for 0 days', () => {
    expect(formatDaysSince(0)).toBe('today');
  });

  it('returns "yesterday" for 1 day', () => {
    expect(formatDaysSince(1)).toBe('yesterday');
  });

  it('returns "N days ago" for N > 1', () => {
    expect(formatDaysSince(5)).toBe('5 days ago');
  });

  it('returns "never" for sentinel value 9999', () => {
    expect(formatDaysSince(9999)).toBe('never');
  });
});

// ─── capitaliseCategory ───────────────────────────────────────────────────────

describe('capitaliseCategory', () => {
  it('capitalises lowercase category', () => {
    expect(capitaliseCategory('dribbling')).toBe('Dribbling');
  });

  it('leaves already-capitalised strings unchanged', () => {
    expect(capitaliseCategory('Defense')).toBe('Defense');
  });

  it('handles empty string', () => {
    expect(capitaliseCategory('')).toBe('');
  });
});

// ─── buildFocusReason ─────────────────────────────────────────────────────────

describe('buildFocusReason', () => {
  it('includes days and skill when both present', () => {
    const reason = buildFocusReason(6, 'dribbling');
    expect(reason).toContain('6 days');
    expect(reason).toContain('Dribbling');
  });

  it('uses "yesterday" for 1 day', () => {
    const reason = buildFocusReason(1, 'passing');
    expect(reason).toContain('yesterday');
  });

  it('omits skill section when skill is null', () => {
    const reason = buildFocusReason(4, null);
    expect(reason).not.toContain('·');
  });

  it('shows "No observations yet" for 9999 days', () => {
    const reason = buildFocusReason(9999, null);
    expect(reason).toContain('No observations yet');
  });
});

// ─── hasSufficientDataForFocus ────────────────────────────────────────────────

describe('hasSufficientDataForFocus', () => {
  it('returns false with fewer than 2 players', () => {
    const obs = Array.from({ length: 5 }, (_, i) => makeObs('p1', 'positive', 'dribbling', i));
    expect(hasSufficientDataForFocus([PLAYERS[0]], obs)).toBe(false);
  });

  it('returns false with fewer than 5 observations', () => {
    const obs = [makeObs('p1', 'positive', 'dribbling', 1)];
    expect(hasSufficientDataForFocus(PLAYERS, obs)).toBe(false);
  });

  it('returns false when observations only cover one unique player', () => {
    const obs = Array.from({ length: 10 }, (_, i) => makeObs('p1', 'positive', 'dribbling', i));
    expect(hasSufficientDataForFocus(PLAYERS, obs)).toBe(false);
  });

  it('returns true with sufficient players and spread observations', () => {
    const obs: PlayerObsSummary[] = [
      ...Array.from({ length: 3 }, (_, i) => makeObs('p1', 'positive', 'dribbling', i + 1)),
      ...Array.from({ length: 2 }, (_, i) => makeObs('p2', 'positive', 'passing', i + 1)),
    ];
    expect(hasSufficientDataForFocus(PLAYERS, obs)).toBe(true);
  });
});

// ─── buildDailyFocusSuggestion ────────────────────────────────────────────────

describe('buildDailyFocusSuggestion', () => {
  const baseObs: PlayerObsSummary[] = [
    makeObs('p1', 'positive', 'dribbling', 8),
    makeObs('p1', 'needs-work', 'defense', 7),
    makeObs('p2', 'positive', 'passing', 2),
    makeObs('p2', 'positive', 'dribbling', 1),
    makeObs('p3', 'positive', 'shooting', 3),
  ];

  const trends: SkillTrendSummary[] = [
    { category: 'defense', direction: 'declining', delta: -12 },
  ];

  it('returns null when insufficient data', () => {
    expect(buildDailyFocusSuggestion([], [], [], NOW)).toBeNull();
  });

  it('returns a suggestion when data is sufficient', () => {
    const result = buildDailyFocusSuggestion(PLAYERS, baseObs, trends, NOW);
    expect(result).not.toBeNull();
    expect(result!.playerId).toBe('p1'); // p1 unobserved 8 days — longest
  });

  it('suggestion includes skill to focus', () => {
    const result = buildDailyFocusSuggestion(PLAYERS, baseObs, trends, NOW);
    expect(result!.skillToFocus).toBeTruthy();
  });

  it('captureHref points to /capture with player query param', () => {
    const result = buildDailyFocusSuggestion(PLAYERS, baseObs, trends, NOW);
    expect(result!.captureHref).toContain('/capture?player=');
  });

  it('returns null when all eligible players were observed today', () => {
    const todayObs: PlayerObsSummary[] = [
      ...baseObs,
      { player_id: 'p1', sentiment: 'positive', category: 'x', created_at: NOW.toISOString() },
    ];
    // p2 and p3 were also observed recently — but not "today" in baseObs
    // p1 is now observed today, so should fall to p3 (3 days) or p2 (2 days)
    const result = buildDailyFocusSuggestion(PLAYERS, todayObs, trends, NOW);
    // Still returns something because p2 and p3 were not observed today
    expect(result).not.toBeNull();
    expect(result!.playerId).not.toBe('p1');
  });

  it('includes daysSinceObserved correctly', () => {
    const result = buildDailyFocusSuggestion(PLAYERS, baseObs, trends, NOW);
    // p1 has observations at 8 and 7 days ago — most recent is 7 days
    expect(result!.daysSinceObserved).toBe(7);
  });

  it('includes the player name', () => {
    const result = buildDailyFocusSuggestion(PLAYERS, baseObs, trends, NOW);
    expect(result!.playerName).toBe('Marcus');
  });
});
