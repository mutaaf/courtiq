import { describe, it, expect } from 'vitest';
import {
  filterPlayerObs,
  getObservedPlayerIds,
  countObservedPlayers,
  groupObsByPlayer,
  filterObsForPlayer,
  getPositiveObsForPlayer,
  getNeedsWorkObsForPlayer,
  hasEnoughDataForMessages,
  getTopSkillCategory,
  calculatePositiveRatio,
  sortPlayersByMostObserved,
  buildSessionLabel,
  buildPlayerMessageShareText,
  isValidMessageText,
  countMessages,
  truncateMessage,
  extractPlayerNamesFromObs,
  hasGeneratedMessages,
  buildPlayerObsPayload,
  type SessionObservation,
  type PlayerMessageEntry,
  type PlayerWithObs,
} from '@/lib/player-session-messages-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeObs = (overrides: Partial<SessionObservation> = {}): SessionObservation => ({
  player_id: 'p1',
  sentiment: 'positive',
  text: 'Great effort on defense',
  category: 'defense',
  players: { name: 'Marcus' },
  ...overrides,
});

const sampleObs: SessionObservation[] = [
  makeObs({ player_id: 'p1', sentiment: 'positive', category: 'defense', players: { name: 'Marcus' } }),
  makeObs({ player_id: 'p1', sentiment: 'needs-work', category: 'shooting', text: 'Needs to follow through', players: { name: 'Marcus' } }),
  makeObs({ player_id: 'p2', sentiment: 'positive', category: 'passing', text: 'Great passes', players: { name: 'Jordan' } }),
  makeObs({ player_id: null, sentiment: 'positive', category: 'teamwork', text: 'Team played well', players: null }), // team obs
];

// ─── filterPlayerObs ─────────────────────────────────────────────────────────

describe('filterPlayerObs', () => {
  it('excludes observations with no player_id', () => {
    const result = filterPlayerObs(sampleObs);
    expect(result).toHaveLength(3);
    expect(result.every((o) => !!o.player_id)).toBe(true);
  });

  it('returns empty array when no player observations', () => {
    const teamOnlyObs = [makeObs({ player_id: null, players: null })];
    expect(filterPlayerObs(teamOnlyObs)).toHaveLength(0);
  });

  it('returns all when every obs has player_id', () => {
    const obs = [makeObs({ player_id: 'a' }), makeObs({ player_id: 'b' })];
    expect(filterPlayerObs(obs)).toHaveLength(2);
  });
});

// ─── getObservedPlayerIds ────────────────────────────────────────────────────

describe('getObservedPlayerIds', () => {
  it('returns unique player IDs', () => {
    const ids = getObservedPlayerIds(sampleObs);
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
    expect(ids).toHaveLength(2);
  });

  it('deduplicates multiple obs for same player', () => {
    const obs = [makeObs({ player_id: 'p1' }), makeObs({ player_id: 'p1' })];
    expect(getObservedPlayerIds(obs)).toHaveLength(1);
  });

  it('returns empty when no player obs', () => {
    expect(getObservedPlayerIds([makeObs({ player_id: null })])).toHaveLength(0);
  });
});

// ─── countObservedPlayers ────────────────────────────────────────────────────

describe('countObservedPlayers', () => {
  it('counts unique players', () => {
    expect(countObservedPlayers(sampleObs)).toBe(2);
  });

  it('returns 0 with no player obs', () => {
    expect(countObservedPlayers([])).toBe(0);
  });
});

// ─── groupObsByPlayer ────────────────────────────────────────────────────────

describe('groupObsByPlayer', () => {
  it('groups observations by player_id', () => {
    const grouped = groupObsByPlayer(sampleObs);
    expect(grouped['p1']).toHaveLength(2);
    expect(grouped['p2']).toHaveLength(1);
  });

  it('excludes team-level observations', () => {
    const grouped = groupObsByPlayer(sampleObs);
    expect(Object.keys(grouped)).not.toContain('null');
  });

  it('handles empty input', () => {
    expect(groupObsByPlayer([])).toEqual({});
  });
});

// ─── filterObsForPlayer ──────────────────────────────────────────────────────

describe('filterObsForPlayer', () => {
  it('returns only observations for the specified player', () => {
    const p1Obs = filterObsForPlayer(sampleObs, 'p1');
    expect(p1Obs).toHaveLength(2);
    expect(p1Obs.every((o) => o.player_id === 'p1')).toBe(true);
  });

  it('returns empty when player has no observations', () => {
    expect(filterObsForPlayer(sampleObs, 'p999')).toHaveLength(0);
  });
});

// ─── getPositiveObsForPlayer ─────────────────────────────────────────────────

describe('getPositiveObsForPlayer', () => {
  it('returns only positive observations for the player', () => {
    const result = getPositiveObsForPlayer(sampleObs, 'p1');
    expect(result).toHaveLength(1);
    expect(result[0].sentiment).toBe('positive');
  });

  it('returns empty when player has no positive obs', () => {
    const obs = [makeObs({ player_id: 'p1', sentiment: 'needs-work' })];
    expect(getPositiveObsForPlayer(obs, 'p1')).toHaveLength(0);
  });
});

// ─── getNeedsWorkObsForPlayer ────────────────────────────────────────────────

describe('getNeedsWorkObsForPlayer', () => {
  it('returns only needs-work observations for the player', () => {
    const result = getNeedsWorkObsForPlayer(sampleObs, 'p1');
    expect(result).toHaveLength(1);
    expect(result[0].sentiment).toBe('needs-work');
  });

  it('returns empty when player has no needs-work obs', () => {
    const obs = [makeObs({ player_id: 'p1', sentiment: 'positive' })];
    expect(getNeedsWorkObsForPlayer(obs, 'p1')).toHaveLength(0);
  });
});

// ─── hasEnoughDataForMessages ────────────────────────────────────────────────

describe('hasEnoughDataForMessages', () => {
  it('returns true when at least one player observation exists', () => {
    expect(hasEnoughDataForMessages(sampleObs)).toBe(true);
  });

  it('returns false when only team observations exist', () => {
    const teamOnly = [makeObs({ player_id: null, players: null })];
    expect(hasEnoughDataForMessages(teamOnly)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasEnoughDataForMessages([])).toBe(false);
  });
});

// ─── getTopSkillCategory ─────────────────────────────────────────────────────

describe('getTopSkillCategory', () => {
  it('returns the most frequent category for a player', () => {
    const obs = [
      makeObs({ player_id: 'p1', category: 'defense' }),
      makeObs({ player_id: 'p1', category: 'defense' }),
      makeObs({ player_id: 'p1', category: 'shooting' }),
    ];
    expect(getTopSkillCategory(obs, 'p1')).toBe('defense');
  });

  it('returns null when player has no observations', () => {
    expect(getTopSkillCategory(sampleObs, 'p999')).toBeNull();
  });

  it('returns null when no category is set', () => {
    const obs = [makeObs({ player_id: 'p1', category: undefined })];
    expect(getTopSkillCategory(obs, 'p1')).toBeNull();
  });
});

// ─── calculatePositiveRatio ──────────────────────────────────────────────────

describe('calculatePositiveRatio', () => {
  it('calculates correct ratio for mixed observations', () => {
    // p1 has 1 positive, 1 needs-work → 0.5
    expect(calculatePositiveRatio(sampleObs, 'p1')).toBeCloseTo(0.5);
  });

  it('returns 1 when all observations are positive', () => {
    const obs = [
      makeObs({ player_id: 'p1', sentiment: 'positive' }),
      makeObs({ player_id: 'p1', sentiment: 'positive' }),
    ];
    expect(calculatePositiveRatio(obs, 'p1')).toBe(1);
  });

  it('returns 0 when player has no observations', () => {
    expect(calculatePositiveRatio(sampleObs, 'p999')).toBe(0);
  });
});

// ─── sortPlayersByMostObserved ───────────────────────────────────────────────

describe('sortPlayersByMostObserved', () => {
  const players: PlayerWithObs[] = [
    { playerId: 'p1', playerName: 'Marcus', observations: [makeObs(), makeObs()] },
    { playerId: 'p2', playerName: 'Jordan', observations: [makeObs()] },
    { playerId: 'p3', playerName: 'Alex', observations: [makeObs(), makeObs(), makeObs()] },
  ];

  it('sorts by observation count descending', () => {
    const sorted = sortPlayersByMostObserved(players);
    expect(sorted[0].playerId).toBe('p3');
    expect(sorted[1].playerId).toBe('p1');
    expect(sorted[2].playerId).toBe('p2');
  });

  it('does not mutate the original array', () => {
    const original = [...players];
    sortPlayersByMostObserved(players);
    expect(players).toEqual(original);
  });
});

// ─── buildSessionLabel ───────────────────────────────────────────────────────

describe('buildSessionLabel', () => {
  it('builds practice label with day name', () => {
    // 2026-04-14 is a Tuesday
    const label = buildSessionLabel('practice', '2026-04-14');
    expect(label).toContain('Practice');
    expect(label).toContain('Apr 14');
  });

  it('builds game label with opponent', () => {
    const label = buildSessionLabel('game', '2026-04-14', 'Eagles');
    expect(label).toContain('Game vs Eagles');
    expect(label).toContain('Apr 14');
  });

  it('builds game label without opponent', () => {
    const label = buildSessionLabel('game', '2026-04-14');
    expect(label).toContain('Game —');
    expect(label).not.toContain('vs');
  });

  it('uses "Scrimmage" label for scrimmage type', () => {
    const label = buildSessionLabel('scrimmage', '2026-04-14', 'Lions');
    expect(label).toContain('Scrimmage vs Lions');
  });

  it('uses "Tournament" label for tournament type', () => {
    const label = buildSessionLabel('tournament', '2026-04-14');
    expect(label).toContain('Tournament');
  });
});

// ─── buildPlayerMessageShareText ─────────────────────────────────────────────

describe('buildPlayerMessageShareText', () => {
  it('includes player name, message and highlight', () => {
    const text = buildPlayerMessageShareText(
      'Marcus',
      'Great hustle today!',
      'Excellent defense'
    );
    expect(text).toContain('Marcus');
    expect(text).toContain('Great hustle today!');
    expect(text).toContain('Excellent defense');
  });

  it('formats for text message sharing', () => {
    const text = buildPlayerMessageShareText('Sarah', 'Nice work.', 'Fast footwork');
    expect(text.startsWith('Hi!')).toBe(true);
  });
});

// ─── isValidMessageText ──────────────────────────────────────────────────────

describe('isValidMessageText', () => {
  it('returns true for valid non-empty message', () => {
    expect(isValidMessageText('Great job today!')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidMessageText('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isValidMessageText('   ')).toBe(false);
  });

  it('returns false for strings shorter than 10 chars', () => {
    expect(isValidMessageText('Hi!')).toBe(false);
  });

  it('returns true at exactly 10 chars', () => {
    expect(isValidMessageText('0123456789')).toBe(true);
  });
});

// ─── countMessages ───────────────────────────────────────────────────────────

describe('countMessages', () => {
  const msg: PlayerMessageEntry = {
    player_name: 'Marcus',
    message: 'Great session!',
    highlight: 'Defense',
    next_focus: 'Shooting',
  };

  it('returns correct count', () => {
    expect(countMessages([msg, msg])).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countMessages([])).toBe(0);
  });
});

// ─── truncateMessage ─────────────────────────────────────────────────────────

describe('truncateMessage', () => {
  it('returns original when under max length', () => {
    const msg = 'Short message';
    expect(truncateMessage(msg, 200)).toBe(msg);
  });

  it('truncates and appends ellipsis when over max', () => {
    const long = 'A'.repeat(210);
    const result = truncateMessage(long, 200);
    expect(result).toHaveLength(200);
    expect(result.endsWith('…')).toBe(true);
  });

  it('defaults to 200 character max', () => {
    const long = 'B'.repeat(250);
    const result = truncateMessage(long);
    expect(result).toHaveLength(200);
  });
});

// ─── extractPlayerNamesFromObs ───────────────────────────────────────────────

describe('extractPlayerNamesFromObs', () => {
  it('extracts unique names from player observations', () => {
    const names = extractPlayerNamesFromObs(sampleObs);
    expect(names).toContain('Marcus');
    expect(names).toContain('Jordan');
    expect(names).toHaveLength(2);
  });

  it('excludes observations without a player name', () => {
    const obs = [
      makeObs({ player_id: 'p1', players: { name: 'Alice' } }),
      makeObs({ player_id: 'p2', players: null }),
    ];
    expect(extractPlayerNamesFromObs(obs)).toEqual(['Alice']);
  });

  it('returns empty for team-only observations', () => {
    const teamOnly = [makeObs({ player_id: null, players: null })];
    expect(extractPlayerNamesFromObs(teamOnly)).toHaveLength(0);
  });
});

// ─── hasGeneratedMessages ────────────────────────────────────────────────────

describe('hasGeneratedMessages', () => {
  it('returns true when messages array is non-empty', () => {
    expect(hasGeneratedMessages({ messages: [{ player_name: 'Marcus' }] })).toBe(true);
  });

  it('returns false when messages array is empty', () => {
    expect(hasGeneratedMessages({ messages: [] })).toBe(false);
  });

  it('returns false when no messages key', () => {
    expect(hasGeneratedMessages({ session_label: 'test' })).toBe(false);
  });

  it('returns false for null input', () => {
    expect(hasGeneratedMessages(null)).toBe(false);
  });

  it('returns false for non-object input', () => {
    expect(hasGeneratedMessages('string')).toBe(false);
  });
});

// ─── buildPlayerObsPayload ───────────────────────────────────────────────────

describe('buildPlayerObsPayload', () => {
  it('builds payload grouped by player with their observations', () => {
    const payload = buildPlayerObsPayload(sampleObs);
    expect(payload).toHaveLength(2); // Marcus and Jordan
    const marcus = payload.find((p) => p.playerName === 'Marcus');
    expect(marcus).toBeDefined();
    expect(marcus!.observations).toHaveLength(2);
  });

  it('excludes team-level observations', () => {
    const teamOnly: SessionObservation[] = [
      makeObs({ player_id: null, players: null, text: 'Team obs' }),
    ];
    expect(buildPlayerObsPayload(teamOnly)).toHaveLength(0);
  });

  it('maps observation fields correctly', () => {
    const obs: SessionObservation[] = [
      makeObs({ player_id: 'p1', sentiment: 'positive', category: 'defense', text: 'Good block', players: { name: 'Alex' } }),
    ];
    const payload = buildPlayerObsPayload(obs);
    expect(payload[0].observations[0]).toEqual({
      text: 'Good block',
      sentiment: 'positive',
      category: 'defense',
    });
  });

  it('defaults category to "general" when null', () => {
    const obs: SessionObservation[] = [
      makeObs({ player_id: 'p1', category: null, players: { name: 'Alex' } }),
    ];
    const payload = buildPlayerObsPayload(obs);
    expect(payload[0].observations[0].category).toBe('general');
  });

  it('returns empty array for no player observations', () => {
    expect(buildPlayerObsPayload([])).toHaveLength(0);
  });
});
