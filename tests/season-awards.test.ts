import { describe, it, expect } from 'vitest';
import {
  getPlayerObsMap,
  countPlayerObs,
  countPlayerPositiveObs,
  countPlayerNeedsWorkObs,
  getPlayerPositiveRatio,
  getPlayerTopCategory,
  getPlayerBestObs,
  countPlayersWithObs,
  sortPlayersByEngagement,
  buildPlayerAwardData,
  buildAwardsPayload,
  hasEnoughDataForAwards,
  buildAwardShareText,
  buildAllAwardsShareText,
  getAwardAccentClasses,
  isValidAwardTitle,
  isValidAwardEntry,
  countAwards,
  hasAwards,
  getPlayerAward,
  getUniqueAwardTitles,
  allAwardTitlesUnique,
  buildAwardsSummaryLabel,
  type AwardObservation,
  type AwardPlayer,
  type SeasonAwards,
} from '../src/lib/season-awards-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const player1: AwardPlayer = { id: 'p1', name: 'Marcus' };
const player2: AwardPlayer = { id: 'p2', name: 'Sofia' };
const player3: AwardPlayer = { id: 'p3', name: 'Jayden' };
const playerNoObs: AwardPlayer = { id: 'p4', name: 'Riley' };

const obs: AwardObservation[] = [
  { player_id: 'p1', category: 'Defense', sentiment: 'positive', text: 'Great defense', created_at: '2025-01-01T10:00:00Z' },
  { player_id: 'p1', category: 'Defense', sentiment: 'positive', text: 'Locked down his man effectively all practice long', created_at: '2025-01-02T10:00:00Z' },
  { player_id: 'p1', category: 'Offense', sentiment: 'needs-work', text: 'Shooting off', created_at: '2025-01-03T10:00:00Z' },
  { player_id: 'p2', category: 'Passing', sentiment: 'positive', text: 'Excellent vision and creative passing', created_at: '2025-01-01T10:00:00Z' },
  { player_id: 'p2', category: 'Passing', sentiment: 'positive', text: 'Another great pass', created_at: '2025-01-02T10:00:00Z' },
  { player_id: 'p3', category: 'Hustle', sentiment: 'positive', text: 'Never stopped running', created_at: '2025-01-01T10:00:00Z' },
  { player_id: 'p3', category: 'Hustle', sentiment: 'needs-work', text: 'Lost focus briefly', created_at: '2025-01-02T10:00:00Z' },
  { player_id: 'p3', category: 'Defense', sentiment: 'neutral', text: 'Average coverage', created_at: '2025-01-03T10:00:00Z' },
];

const players = [player1, player2, player3, playerNoObs];

const sampleStructured: SeasonAwards = {
  season_label: 'Spring 2025 Season Awards',
  ceremony_intro: 'What a season it has been!',
  awards: [
    { player_name: 'Marcus', award_title: 'Defensive Anchor Award', emoji: '🛡️', description: 'Marcus was a wall.', standout_moment: 'Locked down his man.' },
    { player_name: 'Sofia', award_title: 'Creative Passer Award', emoji: '🎯', description: 'Sofia saw passes others missed.', standout_moment: 'Brilliant dish in the final game.' },
    { player_name: 'Jayden', award_title: 'Hustle Heart Award', emoji: '💪', description: 'Jayden never quit.', standout_moment: 'Sprinted back on defense every time.' },
  ],
  team_message: 'Together you achieved something special.',
};

// ─── getPlayerObsMap ──────────────────────────────────────────────────────────

describe('getPlayerObsMap', () => {
  it('groups observations by player_id', () => {
    const map = getPlayerObsMap(obs);
    expect(map.get('p1')).toHaveLength(3);
    expect(map.get('p2')).toHaveLength(2);
    expect(map.get('p3')).toHaveLength(3);
  });

  it('returns empty map for empty input', () => {
    expect(getPlayerObsMap([])).toEqual(new Map());
  });

  it('does not include players without observations', () => {
    const map = getPlayerObsMap(obs);
    expect(map.has('p4')).toBe(false);
  });
});

// ─── countPlayerObs ───────────────────────────────────────────────────────────

describe('countPlayerObs', () => {
  it('counts all observations', () => {
    const map = getPlayerObsMap(obs);
    expect(countPlayerObs(map.get('p1')!)).toBe(3);
    expect(countPlayerObs(map.get('p2')!)).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countPlayerObs([])).toBe(0);
  });
});

// ─── countPlayerPositiveObs / countPlayerNeedsWorkObs ─────────────────────────

describe('countPlayerPositiveObs', () => {
  it('counts positive only', () => {
    const map = getPlayerObsMap(obs);
    expect(countPlayerPositiveObs(map.get('p1')!)).toBe(2);
    expect(countPlayerPositiveObs(map.get('p2')!)).toBe(2);
  });
});

describe('countPlayerNeedsWorkObs', () => {
  it('counts needs-work only', () => {
    const map = getPlayerObsMap(obs);
    expect(countPlayerNeedsWorkObs(map.get('p1')!)).toBe(1);
    expect(countPlayerNeedsWorkObs(map.get('p3')!)).toBe(1);
  });
});

// ─── getPlayerPositiveRatio ───────────────────────────────────────────────────

describe('getPlayerPositiveRatio', () => {
  it('calculates positive ratio excluding neutral', () => {
    const p3Obs = obs.filter((o) => o.player_id === 'p3');
    // scored = 2 (1 positive, 1 needs-work); ratio = 0.5
    expect(getPlayerPositiveRatio(p3Obs)).toBeCloseTo(0.5);
  });

  it('returns 0 for empty', () => {
    expect(getPlayerPositiveRatio([])).toBe(0);
  });

  it('returns 0 for all-neutral observations', () => {
    const neutral: AwardObservation[] = [
      { player_id: 'px', category: 'General', sentiment: 'neutral', text: 'ok', created_at: '2025-01-01T00:00:00Z' },
    ];
    expect(getPlayerPositiveRatio(neutral)).toBe(0);
  });

  it('returns 1 for all-positive', () => {
    const positive: AwardObservation[] = [
      { player_id: 'p2', category: 'Passing', sentiment: 'positive', text: 'Great', created_at: '2025-01-01T00:00:00Z' },
    ];
    expect(getPlayerPositiveRatio(positive)).toBe(1);
  });
});

// ─── getPlayerTopCategory ─────────────────────────────────────────────────────

describe('getPlayerTopCategory', () => {
  it('returns most frequent category', () => {
    const p1Obs = obs.filter((o) => o.player_id === 'p1');
    expect(getPlayerTopCategory(p1Obs)).toBe('Defense');
  });

  it('returns General for empty', () => {
    expect(getPlayerTopCategory([])).toBe('General');
  });
});

// ─── getPlayerBestObs ────────────────────────────────────────────────────────

describe('getPlayerBestObs', () => {
  it('returns longest positive observation', () => {
    const p1Obs = obs.filter((o) => o.player_id === 'p1');
    // Longer positive: "Locked down his man effectively all practice long"
    expect(getPlayerBestObs(p1Obs)).toBe('Locked down his man effectively all practice long');
  });

  it('falls back to first obs when no positive', () => {
    const neutralObs: AwardObservation[] = [
      { player_id: 'px', category: 'General', sentiment: 'neutral', text: 'Average', created_at: '2025-01-01T00:00:00Z' },
    ];
    expect(getPlayerBestObs(neutralObs)).toBe('Average');
  });

  it('returns empty string for empty input', () => {
    expect(getPlayerBestObs([])).toBe('');
  });
});

// ─── countPlayersWithObs ─────────────────────────────────────────────────────

describe('countPlayersWithObs', () => {
  it('counts players with at least one observation', () => {
    const map = getPlayerObsMap(obs);
    expect(countPlayersWithObs(players, map)).toBe(3); // p4 has no obs
  });

  it('returns 0 when no observations', () => {
    expect(countPlayersWithObs(players, new Map())).toBe(0);
  });
});

// ─── sortPlayersByEngagement ──────────────────────────────────────────────────

describe('sortPlayersByEngagement', () => {
  it('sorts by observation count descending', () => {
    const map = getPlayerObsMap(obs);
    const sorted = sortPlayersByEngagement([player1, player2, player3], map);
    // p1=3, p3=3, p2=2 — tied by count, original order preserved
    expect(sorted.map((p) => p.id)).toEqual(['p1', 'p3', 'p2']);
  });

  it('players with no obs sort last', () => {
    const map = getPlayerObsMap(obs);
    const sorted = sortPlayersByEngagement(players, map);
    expect(sorted[sorted.length - 1].id).toBe('p4');
  });
});

// ─── buildPlayerAwardData ────────────────────────────────────────────────────

describe('buildPlayerAwardData', () => {
  it('builds correct data object', () => {
    const p1Obs = obs.filter((o) => o.player_id === 'p1');
    const data = buildPlayerAwardData(player1, p1Obs);
    expect(data.name).toBe('Marcus');
    expect(data.totalObs).toBe(3);
    expect(data.positiveObs).toBe(2);
    expect(data.needsWorkObs).toBe(1);
    expect(data.topCategory).toBe('Defense');
    expect(data.positiveRatio).toBeCloseTo(2 / 3);
  });
});

// ─── buildAwardsPayload ───────────────────────────────────────────────────────

describe('buildAwardsPayload', () => {
  it('excludes players with no observations', () => {
    const map = getPlayerObsMap(obs);
    const payload = buildAwardsPayload(players, map);
    expect(payload.map((p) => p.name)).not.toContain('Riley');
    expect(payload).toHaveLength(3);
  });

  it('sorts by engagement (most observed first)', () => {
    const map = getPlayerObsMap(obs);
    const payload = buildAwardsPayload(players, map);
    // p1 and p3 both have 3; p2 has 2
    expect(payload[payload.length - 1].name).toBe('Sofia');
  });
});

// ─── hasEnoughDataForAwards ───────────────────────────────────────────────────

describe('hasEnoughDataForAwards', () => {
  it('returns true when ≥2 players and ≥5 total observations', () => {
    const map = getPlayerObsMap(obs);
    expect(hasEnoughDataForAwards([player1, player2, player3], map)).toBe(true);
  });

  it('returns false when fewer than 2 players have observations', () => {
    const singlePlayerObs = obs.filter((o) => o.player_id === 'p1');
    const map = getPlayerObsMap(singlePlayerObs);
    expect(hasEnoughDataForAwards(players, map)).toBe(false);
  });

  it('returns false when fewer than 5 total observations', () => {
    const fewObs = obs.slice(0, 3);
    const map = getPlayerObsMap(fewObs);
    expect(hasEnoughDataForAwards(players, map)).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(hasEnoughDataForAwards([], new Map())).toBe(false);
  });
});

// ─── buildAwardShareText ──────────────────────────────────────────────────────

describe('buildAwardShareText', () => {
  it('includes award title, player name, description, and standout moment', () => {
    const award = sampleStructured.awards[0];
    const text = buildAwardShareText(award, 'Smith', 'Lakers U12');
    expect(text).toContain('Defensive Anchor Award');
    expect(text).toContain('Marcus');
    expect(text).toContain('Marcus was a wall.');
    expect(text).toContain('Locked down his man.');
  });

  it('includes coach and team name when provided', () => {
    const award = sampleStructured.awards[0];
    const text = buildAwardShareText(award, 'Smith', 'Lakers U12');
    expect(text).toContain('Coach Smith');
    expect(text).toContain('Lakers U12');
  });

  it('works without optional coach/team name', () => {
    const award = sampleStructured.awards[0];
    const text = buildAwardShareText(award);
    expect(text).toContain('SportsIQ');
  });
});

// ─── buildAllAwardsShareText ──────────────────────────────────────────────────

describe('buildAllAwardsShareText', () => {
  it('includes all player names and award titles', () => {
    const text = buildAllAwardsShareText(sampleStructured, 'Lakers U12');
    expect(text).toContain('Marcus');
    expect(text).toContain('Sofia');
    expect(text).toContain('Jayden');
    expect(text).toContain('Defensive Anchor Award');
    expect(text).toContain('Creative Passer Award');
  });

  it('includes ceremony intro and team message', () => {
    const text = buildAllAwardsShareText(sampleStructured);
    expect(text).toContain(sampleStructured.ceremony_intro);
    expect(text).toContain(sampleStructured.team_message);
  });

  it('includes SportsIQ branding', () => {
    const text = buildAllAwardsShareText(sampleStructured);
    expect(text).toContain('SportsIQ');
  });
});

// ─── getAwardAccentClasses ────────────────────────────────────────────────────

describe('getAwardAccentClasses', () => {
  it('returns valid class object', () => {
    const classes = getAwardAccentClasses(0);
    expect(classes).toHaveProperty('border');
    expect(classes).toHaveProperty('bg');
    expect(classes).toHaveProperty('text');
    expect(classes).toHaveProperty('emojiRing');
  });

  it('cycles through palette with modulo', () => {
    const c0 = getAwardAccentClasses(0);
    const c8 = getAwardAccentClasses(8); // 8 palettes, wraps back
    expect(c0).toEqual(c8);
  });

  it('produces different classes for different indices', () => {
    const c0 = getAwardAccentClasses(0);
    const c1 = getAwardAccentClasses(1);
    expect(c0.border).not.toBe(c1.border);
  });
});

// ─── isValidAwardTitle ────────────────────────────────────────────────────────

describe('isValidAwardTitle', () => {
  it('accepts valid titles', () => {
    expect(isValidAwardTitle('Defensive Anchor Award')).toBe(true);
    expect(isValidAwardTitle('MVP')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidAwardTitle('')).toBe(false);
  });

  it('rejects strings that are too long', () => {
    expect(isValidAwardTitle('A'.repeat(81))).toBe(false);
  });

  it('accepts exactly 3 chars', () => {
    expect(isValidAwardTitle('MVP')).toBe(true);
  });
});

// ─── isValidAwardEntry ────────────────────────────────────────────────────────

describe('isValidAwardEntry', () => {
  it('returns true for valid entry', () => {
    expect(isValidAwardEntry(sampleStructured.awards[0])).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidAwardEntry(null)).toBe(false);
  });

  it('returns false for missing player_name', () => {
    const bad = { ...sampleStructured.awards[0], player_name: '' };
    expect(isValidAwardEntry(bad)).toBe(false);
  });

  it('returns false for short description', () => {
    const bad = { ...sampleStructured.awards[0], description: 'Hi' };
    expect(isValidAwardEntry(bad)).toBe(false);
  });
});

// ─── countAwards / hasAwards ─────────────────────────────────────────────────

describe('countAwards', () => {
  it('counts awards correctly', () => {
    expect(countAwards(sampleStructured)).toBe(3);
  });

  it('returns 0 for empty awards', () => {
    const empty: SeasonAwards = { ...sampleStructured, awards: [] };
    expect(countAwards(empty)).toBe(0);
  });
});

describe('hasAwards', () => {
  it('returns true when awards exist', () => {
    expect(hasAwards(sampleStructured)).toBe(true);
  });

  it('returns false when no awards', () => {
    const empty: SeasonAwards = { ...sampleStructured, awards: [] };
    expect(hasAwards(empty)).toBe(false);
  });
});

// ─── getPlayerAward ───────────────────────────────────────────────────────────

describe('getPlayerAward', () => {
  it('finds player award by name', () => {
    const award = getPlayerAward(sampleStructured, 'Marcus');
    expect(award?.award_title).toBe('Defensive Anchor Award');
  });

  it('is case-insensitive', () => {
    const award = getPlayerAward(sampleStructured, 'marcus');
    expect(award).toBeDefined();
  });

  it('returns undefined for unknown player', () => {
    expect(getPlayerAward(sampleStructured, 'Unknown')).toBeUndefined();
  });
});

// ─── getUniqueAwardTitles / allAwardTitlesUnique ──────────────────────────────

describe('getUniqueAwardTitles', () => {
  it('returns unique titles in lowercase', () => {
    const titles = getUniqueAwardTitles(sampleStructured);
    expect(titles).toHaveLength(3);
  });
});

describe('allAwardTitlesUnique', () => {
  it('returns true when all titles are unique', () => {
    expect(allAwardTitlesUnique(sampleStructured)).toBe(true);
  });

  it('returns false when titles are duplicated', () => {
    const withDuplicate: SeasonAwards = {
      ...sampleStructured,
      awards: [
        ...sampleStructured.awards,
        { player_name: 'Extra', award_title: 'Defensive Anchor Award', emoji: '🎯', description: 'Duplicate award.', standout_moment: 'Great moment.' },
      ],
    };
    expect(allAwardTitlesUnique(withDuplicate)).toBe(false);
  });
});

// ─── buildAwardsSummaryLabel ──────────────────────────────────────────────────

describe('buildAwardsSummaryLabel', () => {
  it('returns singular label for 1 award', () => {
    const single: SeasonAwards = { ...sampleStructured, awards: [sampleStructured.awards[0]] };
    expect(buildAwardsSummaryLabel(single)).toBe('1 player award');
  });

  it('returns plural label for multiple awards', () => {
    expect(buildAwardsSummaryLabel(sampleStructured)).toBe('3 player awards');
  });

  it('returns "No awards" for empty', () => {
    const empty: SeasonAwards = { ...sampleStructured, awards: [] };
    expect(buildAwardsSummaryLabel(empty)).toBe('No awards');
  });
});
