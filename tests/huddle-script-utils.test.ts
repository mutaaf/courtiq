import { describe, it, expect } from 'vitest';
import {
  isValidPlayerSpotlight,
  isValidHuddleScript,
  isValidChallengeText,
  hasPlayerSpotlight,
  hasNextSessionHint,
  hasEnoughDataForHuddle,
  filterPositiveObs,
  filterNeedsWorkObs,
  groupObsByPlayer,
  countPositiveObsForPlayer,
  getTopCategoryForPlayer,
  getPlayerWithMostPositiveObs,
  getBestPositiveObs,
  extractTeamStrengths,
  extractTeamChallenges,
  buildPlayerSpotlightPayload,
  formatSpotlightLine,
  buildHuddleShareText,
  truncateScript,
  buildPreviewText,
  countWordsInScript,
  estimateReadingSeconds,
  isScriptReadableInSeconds,
  buildHuddleSessionLabel,
  buildObsSummary,
} from '@/lib/huddle-script-utils';
import type { HuddleScript, ObsRow } from '@/lib/huddle-script-utils';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLAYER_MAP: Record<string, string> = {
  'p1': 'Marcus',
  'p2': 'Sarah',
  'p3': 'Leo',
};

const OBS: ObsRow[] = [
  { player_id: 'p1', category: 'Dribbling', sentiment: 'positive', text: 'Marcus kept his eyes up while dribbling through cones' },
  { player_id: 'p1', category: 'Dribbling', sentiment: 'positive', text: 'Great weak-hand dribble from Marcus' },
  { player_id: 'p1', category: 'Defense', sentiment: 'needs-work', text: 'Needs to close out faster on defense' },
  { player_id: 'p2', category: 'Passing', sentiment: 'positive', text: 'Sarah made a perfect bounce pass under pressure' },
  { player_id: 'p2', category: 'Shooting', sentiment: 'needs-work', text: 'Sarah needs to follow through on jump shots' },
  { player_id: 'p3', category: 'Defense', sentiment: 'needs-work', text: 'Leo needs to stay lower in defensive stance' },
];

const BASE_SCRIPT: HuddleScript = {
  huddle_script: 'Bring it in everyone! Great energy today — I saw the whole team working hard on defense. Marcus, you were outstanding today with your dribbling — really impressive work. Team challenge this week: practice dribbling with your weak hand every day. Next practice is Thursday. On three — one, two, three, GO TEAM!',
  player_spotlight: { player_id: 'p1', name: 'Marcus', achievement: 'outstanding dribbling with eyes up' },
  team_shoutout: 'The whole team showed great energy and worked hard on defense today.',
  team_challenge: 'Practice dribbling with your weak hand for 5 minutes every day this week.',
  next_session_hint: 'Thursday at 4pm at Northside Gym',
};

const MINIMAL_SCRIPT: HuddleScript = {
  huddle_script: 'Great practice team! Keep working hard. See you next time!',
  player_spotlight: { name: 'Sarah', achievement: 'great passing today' },
  team_shoutout: 'Good team energy.',
  team_challenge: 'Work on your footwork this week.',
};

// ── isValidPlayerSpotlight ────────────────────────────────────────────────────

describe('isValidPlayerSpotlight', () => {
  it('accepts valid spotlight', () => {
    expect(isValidPlayerSpotlight({ name: 'Marcus', achievement: 'great dribbling' })).toBe(true);
  });

  it('accepts spotlight with optional player_id', () => {
    expect(isValidPlayerSpotlight({ name: 'Sarah', achievement: 'great passing', player_id: 'p2' })).toBe(true);
  });

  it('rejects missing name', () => {
    expect(isValidPlayerSpotlight({ achievement: 'great work' })).toBe(false);
  });

  it('rejects empty name', () => {
    expect(isValidPlayerSpotlight({ name: '', achievement: 'great work' })).toBe(false);
  });

  it('rejects missing achievement', () => {
    expect(isValidPlayerSpotlight({ name: 'Marcus' })).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidPlayerSpotlight(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isValidPlayerSpotlight('string')).toBe(false);
  });
});

// ── isValidHuddleScript ───────────────────────────────────────────────────────

describe('isValidHuddleScript', () => {
  it('accepts full valid script', () => {
    expect(isValidHuddleScript(BASE_SCRIPT)).toBe(true);
  });

  it('accepts minimal valid script', () => {
    expect(isValidHuddleScript(MINIMAL_SCRIPT)).toBe(true);
  });

  it('rejects missing huddle_script', () => {
    const { huddle_script: _, ...rest } = BASE_SCRIPT;
    expect(isValidHuddleScript(rest)).toBe(false);
  });

  it('rejects short huddle_script', () => {
    expect(isValidHuddleScript({ ...BASE_SCRIPT, huddle_script: 'too short' })).toBe(false);
  });

  it('rejects missing player_spotlight', () => {
    const { player_spotlight: _, ...rest } = BASE_SCRIPT;
    expect(isValidHuddleScript(rest)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidHuddleScript(null)).toBe(false);
  });
});

// ── isValidChallengeText ──────────────────────────────────────────────────────

describe('isValidChallengeText', () => {
  it('accepts valid challenge', () => {
    expect(isValidChallengeText('Practice dribbling every day')).toBe(true);
  });

  it('rejects too short', () => {
    expect(isValidChallengeText('drill')).toBe(false);
  });

  it('rejects empty', () => {
    expect(isValidChallengeText('')).toBe(false);
  });

  it('rejects whitespace only', () => {
    expect(isValidChallengeText('   ')).toBe(false);
  });
});

// ── hasPlayerSpotlight / hasNextSessionHint ───────────────────────────────────

describe('hasPlayerSpotlight', () => {
  it('returns true when spotlight is valid', () => {
    expect(hasPlayerSpotlight(BASE_SCRIPT)).toBe(true);
  });
});

describe('hasNextSessionHint', () => {
  it('returns true when hint exists', () => {
    expect(hasNextSessionHint(BASE_SCRIPT)).toBe(true);
  });

  it('returns false when hint is absent', () => {
    expect(hasNextSessionHint(MINIMAL_SCRIPT)).toBe(false);
  });

  it('returns false when hint is empty string', () => {
    expect(hasNextSessionHint({ ...BASE_SCRIPT, next_session_hint: '' })).toBe(false);
  });
});

// ── hasEnoughDataForHuddle ────────────────────────────────────────────────────

describe('hasEnoughDataForHuddle', () => {
  it('passes with 1 observation', () => {
    expect(hasEnoughDataForHuddle(1)).toBe(true);
  });

  it('passes with many observations', () => {
    expect(hasEnoughDataForHuddle(20)).toBe(true);
  });

  it('fails with 0 observations', () => {
    expect(hasEnoughDataForHuddle(0)).toBe(false);
  });
});

// ── filterPositiveObs / filterNeedsWorkObs ────────────────────────────────────

describe('filterPositiveObs', () => {
  it('returns only positive observations', () => {
    const result = filterPositiveObs(OBS);
    expect(result).toHaveLength(3);
    expect(result.every((o) => o.sentiment === 'positive')).toBe(true);
  });

  it('returns empty array when no positives', () => {
    const obs = [{ player_id: 'p1', sentiment: 'needs-work', text: 'bad' }];
    expect(filterPositiveObs(obs)).toHaveLength(0);
  });
});

describe('filterNeedsWorkObs', () => {
  it('returns only needs-work observations', () => {
    const result = filterNeedsWorkObs(OBS);
    expect(result).toHaveLength(3);
    expect(result.every((o) => o.sentiment === 'needs-work')).toBe(true);
  });

  it('returns empty array when none', () => {
    const obs = [{ player_id: 'p1', sentiment: 'positive', text: 'good' }];
    expect(filterNeedsWorkObs(obs)).toHaveLength(0);
  });
});

// ── groupObsByPlayer ──────────────────────────────────────────────────────────

describe('groupObsByPlayer', () => {
  it('groups observations by player ID', () => {
    const map = groupObsByPlayer(OBS);
    expect(map.get('p1')).toHaveLength(3);
    expect(map.get('p2')).toHaveLength(2);
    expect(map.get('p3')).toHaveLength(1);
  });

  it('returns empty map for empty array', () => {
    expect(groupObsByPlayer([])).toEqual(new Map());
  });
});

// ── countPositiveObsForPlayer ─────────────────────────────────────────────────

describe('countPositiveObsForPlayer', () => {
  it('counts positive obs for specific player', () => {
    expect(countPositiveObsForPlayer(OBS, 'p1')).toBe(2);
  });

  it('counts 1 for player with single positive obs', () => {
    expect(countPositiveObsForPlayer(OBS, 'p2')).toBe(1);
  });

  it('returns 0 for player with no positive obs', () => {
    expect(countPositiveObsForPlayer(OBS, 'p3')).toBe(0);
  });

  it('returns 0 for unknown player', () => {
    expect(countPositiveObsForPlayer(OBS, 'unknown')).toBe(0);
  });
});

// ── getTopCategoryForPlayer ───────────────────────────────────────────────────

describe('getTopCategoryForPlayer', () => {
  it('returns most frequent category for player', () => {
    expect(getTopCategoryForPlayer(OBS, 'p1')).toBe('Dribbling');
  });

  it('returns empty string for player with no obs', () => {
    expect(getTopCategoryForPlayer(OBS, 'unknown')).toBe('');
  });
});

// ── getPlayerWithMostPositiveObs ──────────────────────────────────────────────

describe('getPlayerWithMostPositiveObs', () => {
  it('returns player with most positive observations', () => {
    const result = getPlayerWithMostPositiveObs(OBS, PLAYER_MAP);
    expect(result?.playerId).toBe('p1');
    expect(result?.name).toBe('Marcus');
    expect(result?.positiveCount).toBe(2);
  });

  it('returns null when no positive observations', () => {
    const negativeObs: ObsRow[] = [
      { player_id: 'p1', sentiment: 'needs-work', text: 'bad' },
    ];
    expect(getPlayerWithMostPositiveObs(negativeObs, PLAYER_MAP)).toBeNull();
  });

  it('returns null when player not in name map', () => {
    const obs: ObsRow[] = [{ player_id: 'unknown', sentiment: 'positive', text: 'good' }];
    expect(getPlayerWithMostPositiveObs(obs, PLAYER_MAP)).toBeNull();
  });

  it('returns null for empty observations', () => {
    expect(getPlayerWithMostPositiveObs([], PLAYER_MAP)).toBeNull();
  });
});

// ── getBestPositiveObs ────────────────────────────────────────────────────────

describe('getBestPositiveObs', () => {
  it('returns longest positive obs text for player', () => {
    const result = getBestPositiveObs(OBS, 'p1');
    expect(result).toBe('Marcus kept his eyes up while dribbling through cones');
  });

  it('returns empty string for player with no positive obs', () => {
    expect(getBestPositiveObs(OBS, 'p3')).toBe('');
  });

  it('returns empty string for unknown player', () => {
    expect(getBestPositiveObs(OBS, 'unknown')).toBe('');
  });
});

// ── extractTeamStrengths / extractTeamChallenges ──────────────────────────────

describe('extractTeamStrengths', () => {
  it('returns up to 3 unique positive categories', () => {
    const result = extractTeamStrengths(OBS);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result).toContain('Dribbling');
    expect(result).toContain('Passing');
  });

  it('returns empty array when no positive obs', () => {
    const obs: ObsRow[] = [{ player_id: 'p1', category: 'Defense', sentiment: 'needs-work', text: 'bad' }];
    expect(extractTeamStrengths(obs)).toHaveLength(0);
  });

  it('deduplicates categories', () => {
    const obs: ObsRow[] = [
      { player_id: 'p1', category: 'Dribbling', sentiment: 'positive', text: 'a' },
      { player_id: 'p2', category: 'Dribbling', sentiment: 'positive', text: 'b' },
    ];
    expect(extractTeamStrengths(obs)).toEqual(['Dribbling']);
  });
});

describe('extractTeamChallenges', () => {
  it('returns needs-work categories', () => {
    const result = extractTeamChallenges(OBS);
    expect(result).toContain('Defense');
  });

  it('limits to 3 categories', () => {
    const obs: ObsRow[] = [
      { player_id: 'p1', category: 'A', sentiment: 'needs-work', text: 'a' },
      { player_id: 'p2', category: 'B', sentiment: 'needs-work', text: 'b' },
      { player_id: 'p3', category: 'C', sentiment: 'needs-work', text: 'c' },
      { player_id: 'p1', category: 'D', sentiment: 'needs-work', text: 'd' },
    ];
    expect(extractTeamChallenges(obs)).toHaveLength(3);
  });
});

// ── buildPlayerSpotlightPayload ───────────────────────────────────────────────

describe('buildPlayerSpotlightPayload', () => {
  it('returns spotlight for player with most positive obs', () => {
    const result = buildPlayerSpotlightPayload(OBS, PLAYER_MAP);
    expect(result?.name).toBe('Marcus');
    expect(result?.achievement).toContain('eyes up');
  });

  it('returns null when no positive obs', () => {
    const obs: ObsRow[] = [{ player_id: 'p1', sentiment: 'needs-work', text: 'bad' }];
    expect(buildPlayerSpotlightPayload(obs, PLAYER_MAP)).toBeNull();
  });

  it('uses fallback achievement when no positive obs text', () => {
    const obs: ObsRow[] = [
      { player_id: 'p1', category: 'Dribbling', sentiment: 'positive', text: '' },
    ];
    const result = buildPlayerSpotlightPayload(obs, PLAYER_MAP);
    expect(result?.achievement).toContain('dribbling');
  });
});

// ── formatSpotlightLine ───────────────────────────────────────────────────────

describe('formatSpotlightLine', () => {
  it('formats name and achievement', () => {
    expect(formatSpotlightLine('Marcus', 'great dribbling')).toBe('Marcus — great dribbling');
  });
});

// ── buildHuddleShareText ──────────────────────────────────────────────────────

describe('buildHuddleShareText', () => {
  it('includes script text', () => {
    const text = buildHuddleShareText(BASE_SCRIPT);
    expect(text).toContain(BASE_SCRIPT.huddle_script);
  });

  it('includes next session hint when present', () => {
    const text = buildHuddleShareText(BASE_SCRIPT);
    expect(text).toContain('Thursday at 4pm');
  });

  it('omits next session hint when absent', () => {
    const text = buildHuddleShareText(MINIMAL_SCRIPT);
    expect(text).not.toContain('📅');
  });

  it('includes TEAM HUDDLE SCRIPT header', () => {
    const text = buildHuddleShareText(BASE_SCRIPT);
    expect(text).toContain('TEAM HUDDLE SCRIPT');
  });
});

// ── truncateScript / buildPreviewText ─────────────────────────────────────────

describe('truncateScript', () => {
  it('returns full text when under limit', () => {
    expect(truncateScript('short text', 200)).toBe('short text');
  });

  it('truncates and appends ellipsis when over limit', () => {
    const result = truncateScript('a'.repeat(110), 100);
    expect(result).toHaveLength(100);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('buildPreviewText', () => {
  it('returns truncated huddle_script', () => {
    const preview = buildPreviewText(BASE_SCRIPT, 50);
    expect(preview.length).toBeLessThanOrEqual(50);
  });
});

// ── countWordsInScript / estimateReadingSeconds ───────────────────────────────

describe('countWordsInScript', () => {
  it('counts words correctly', () => {
    expect(countWordsInScript('one two three')).toBe(3);
  });

  it('handles extra whitespace', () => {
    expect(countWordsInScript('  one   two  ')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(countWordsInScript('')).toBe(0);
  });
});

describe('estimateReadingSeconds', () => {
  it('estimates reading time at 130 wpm', () => {
    // 130 words → 60 seconds
    const text = 'word '.repeat(130).trim();
    expect(estimateReadingSeconds(text)).toBe(60);
  });

  it('rounds up fractional seconds', () => {
    // 1 word at 130 wpm = 0.46 seconds → ceil to 1
    expect(estimateReadingSeconds('word')).toBe(1);
  });
});

describe('isScriptReadableInSeconds', () => {
  it('returns true for short script', () => {
    const shortScript = 'Great practice everyone! On three: Go Team!';
    expect(isScriptReadableInSeconds(shortScript, 45)).toBe(true);
  });

  it('returns false for very long script', () => {
    const longScript = 'word '.repeat(200).trim();
    expect(isScriptReadableInSeconds(longScript, 30)).toBe(false);
  });
});

// ── buildHuddleSessionLabel ───────────────────────────────────────────────────

describe('buildHuddleSessionLabel', () => {
  it('builds practice label', () => {
    const label = buildHuddleSessionLabel('practice', '2026-04-22');
    expect(label).toContain('Practice');
    expect(label).toContain('Apr 22');
  });

  it('uses "Game" for game sessions', () => {
    const label = buildHuddleSessionLabel('game', '2026-04-22');
    expect(label).toContain('Game');
  });

  it('uses "Training" for training sessions', () => {
    const label = buildHuddleSessionLabel('training', '2026-04-22');
    expect(label).toContain('Training');
  });

  it('defaults to Practice for unknown type', () => {
    const label = buildHuddleSessionLabel('unknown', '2026-04-22');
    expect(label).toContain('Practice');
  });
});

// ── buildObsSummary ───────────────────────────────────────────────────────────

describe('buildObsSummary', () => {
  it('returns correct totals', () => {
    const summary = buildObsSummary(OBS);
    expect(summary.total).toBe(6);
    expect(summary.positive).toBe(3);
    expect(summary.needsWork).toBe(3);
  });

  it('extracts top strengths and challenges', () => {
    const summary = buildObsSummary(OBS);
    expect(summary.topStrengths.length).toBeGreaterThan(0);
    expect(summary.topChallenges.length).toBeGreaterThan(0);
  });

  it('handles empty observations', () => {
    const summary = buildObsSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.positive).toBe(0);
    expect(summary.needsWork).toBe(0);
    expect(summary.topStrengths).toHaveLength(0);
    expect(summary.topChallenges).toHaveLength(0);
  });
});
