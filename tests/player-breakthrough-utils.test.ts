import { describe, it, expect } from 'vitest';
import {
  splitWindows,
  groupByPlayerCategory,
  countBySentiment,
  buildBreakthroughs,
  getBestBreakthrough,
  formatCategory,
  hasEnoughDataForBreakthroughs,
  buildBreakthroughShareText,
  buildBreakthroughWhatsAppUrl,
  buildPriorLabel,
  buildRecentLabel,
  getBreakthroughDismissKey,
  BREAKTHROUGH_THRESHOLD,
  RECENT_DAYS,
  PRIOR_DAYS,
  type BTObs,
} from '../src/lib/player-breakthrough-utils';

const NOW = new Date('2025-06-01T12:00:00Z').getTime();
const DAY = 86_400_000;

function obs(
  player_id: string,
  sentiment: string,
  category: string | null,
  daysAgo: number
): BTObs {
  return {
    player_id,
    sentiment,
    category,
    created_at: new Date(NOW - daysAgo * DAY).toISOString(),
  };
}

// ─── splitWindows ─────────────────────────────────────────────────────────────

describe('splitWindows', () => {
  it('puts observations from the last 7 days in recent', () => {
    const o = obs('p1', 'positive', 'dribbling', 3);
    const { recent, prior } = splitWindows([o], NOW);
    expect(recent).toHaveLength(1);
    expect(prior).toHaveLength(0);
  });

  it('puts observations from days 8-21 in prior', () => {
    const o = obs('p1', 'needs_work', 'dribbling', 14);
    const { recent, prior } = splitWindows([o], NOW);
    expect(recent).toHaveLength(0);
    expect(prior).toHaveLength(1);
  });

  it('excludes observations older than 21 days', () => {
    const o = obs('p1', 'needs_work', 'dribbling', 25);
    const { recent, prior } = splitWindows([o], NOW);
    expect(recent).toHaveLength(0);
    expect(prior).toHaveLength(0);
  });

  it('handles an observation at exactly the 7-day boundary as recent', () => {
    const exactly7 = obs('p1', 'positive', 'dribbling', RECENT_DAYS);
    const { recent } = splitWindows([exactly7], NOW);
    expect(recent).toHaveLength(1);
  });

  it('handles empty input', () => {
    const { recent, prior } = splitWindows([], NOW);
    expect(recent).toHaveLength(0);
    expect(prior).toHaveLength(0);
  });

  it('correctly splits a mixed list', () => {
    const data = [
      obs('p1', 'positive', 'passing', 2),
      obs('p1', 'needs_work', 'passing', 10),
      obs('p2', 'positive', 'defense', 1),
    ];
    const { recent, prior } = splitWindows(data, NOW);
    expect(recent).toHaveLength(2);
    expect(prior).toHaveLength(1);
  });
});

// ─── groupByPlayerCategory ────────────────────────────────────────────────────

describe('groupByPlayerCategory', () => {
  it('groups observations by player × category key', () => {
    const data = [
      obs('p1', 'positive', 'dribbling', 1),
      obs('p1', 'needs_work', 'dribbling', 2),
      obs('p1', 'positive', 'passing', 1),
    ];
    const map = groupByPlayerCategory(data);
    expect(map.get('p1::dribbling')).toHaveLength(2);
    expect(map.get('p1::passing')).toHaveLength(1);
  });

  it('filters out observations with null category', () => {
    const data = [obs('p1', 'positive', null, 1)];
    const map = groupByPlayerCategory(data);
    expect(map.size).toBe(0);
  });

  it('separates observations from different players', () => {
    const data = [
      obs('p1', 'positive', 'shooting', 1),
      obs('p2', 'positive', 'shooting', 1),
    ];
    const map = groupByPlayerCategory(data);
    expect(map.get('p1::shooting')).toHaveLength(1);
    expect(map.get('p2::shooting')).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(groupByPlayerCategory([])).toEqual(new Map());
  });
});

// ─── countBySentiment ─────────────────────────────────────────────────────────

describe('countBySentiment', () => {
  it('counts positive observations', () => {
    const data = [
      obs('p1', 'positive', 'dribbling', 1),
      obs('p1', 'positive', 'dribbling', 2),
      obs('p1', 'needs_work', 'dribbling', 3),
    ];
    expect(countBySentiment(data, 'positive')).toBe(2);
  });

  it('counts needs_work observations', () => {
    const data = [
      obs('p1', 'needs_work', 'dribbling', 10),
      obs('p1', 'needs_work', 'dribbling', 11),
    ];
    expect(countBySentiment(data, 'needs_work')).toBe(2);
  });

  it('returns 0 for empty list', () => {
    expect(countBySentiment([], 'positive')).toBe(0);
  });

  it('returns 0 when no matching sentiment', () => {
    const data = [obs('p1', 'neutral', 'dribbling', 1)];
    expect(countBySentiment(data, 'positive')).toBe(0);
  });
});

// ─── buildBreakthroughs ───────────────────────────────────────────────────────

describe('buildBreakthroughs', () => {
  it('detects a basic breakthrough', () => {
    const data = [
      // prior window: 2 needs-work obs
      obs('p1', 'needs_work', 'dribbling', 10),
      obs('p1', 'needs_work', 'dribbling', 12),
      // recent window: 2 positive obs
      obs('p1', 'positive', 'dribbling', 2),
      obs('p1', 'positive', 'dribbling', 3),
    ];
    const bts = buildBreakthroughs(data, NOW);
    expect(bts).toHaveLength(1);
    expect(bts[0].player_id).toBe('p1');
    expect(bts[0].category).toBe('dribbling');
    expect(bts[0].priorNeedsWork).toBe(2);
    expect(bts[0].recentPositive).toBe(2);
  });

  it('does not trigger when recent positive count is below threshold', () => {
    const data = [
      obs('p1', 'needs_work', 'dribbling', 10),
      obs('p1', 'needs_work', 'dribbling', 12),
      obs('p1', 'positive', 'dribbling', 2), // only 1 positive
    ];
    expect(buildBreakthroughs(data, NOW)).toHaveLength(0);
  });

  it('does not trigger when prior needs_work count is below threshold', () => {
    const data = [
      obs('p1', 'needs_work', 'dribbling', 10), // only 1 needs-work
      obs('p1', 'positive', 'dribbling', 2),
      obs('p1', 'positive', 'dribbling', 3),
    ];
    expect(buildBreakthroughs(data, NOW)).toHaveLength(0);
  });

  it('does not trigger when there are no prior observations at all', () => {
    const data = [
      obs('p1', 'positive', 'dribbling', 2),
      obs('p1', 'positive', 'dribbling', 3),
    ];
    expect(buildBreakthroughs(data, NOW)).toHaveLength(0);
  });

  it('sorts by signal strength descending', () => {
    const data = [
      // player 1: weaker signal (2+2)
      obs('p1', 'needs_work', 'passing', 10),
      obs('p1', 'needs_work', 'passing', 12),
      obs('p1', 'positive', 'passing', 2),
      obs('p1', 'positive', 'passing', 3),
      // player 2: stronger signal (3+3)
      obs('p2', 'needs_work', 'defense', 9),
      obs('p2', 'needs_work', 'defense', 11),
      obs('p2', 'needs_work', 'defense', 13),
      obs('p2', 'positive', 'defense', 1),
      obs('p2', 'positive', 'defense', 2),
      obs('p2', 'positive', 'defense', 4),
    ];
    const bts = buildBreakthroughs(data, NOW);
    expect(bts[0].player_id).toBe('p2');
    expect(bts[1].player_id).toBe('p1');
  });

  it('returns empty array for empty input', () => {
    expect(buildBreakthroughs([], NOW)).toHaveLength(0);
  });

  it('ignores categories with null category', () => {
    const data = [
      obs('p1', 'needs_work', null, 10),
      obs('p1', 'needs_work', null, 12),
      obs('p1', 'positive', null, 2),
      obs('p1', 'positive', null, 3),
    ];
    expect(buildBreakthroughs(data, NOW)).toHaveLength(0);
  });

  it('populates detectedAt with the most recent positive obs date', () => {
    const recentObs = obs('p1', 'positive', 'dribbling', 1);
    const data = [
      obs('p1', 'needs_work', 'dribbling', 10),
      obs('p1', 'needs_work', 'dribbling', 12),
      obs('p1', 'positive', 'dribbling', 4),
      recentObs,
    ];
    const bts = buildBreakthroughs(data, NOW);
    expect(bts[0].detectedAt).toBe(recentObs.created_at);
  });
});

// ─── getBestBreakthrough ──────────────────────────────────────────────────────

describe('getBestBreakthrough', () => {
  it('returns the first element of a non-empty list', () => {
    const bt = {
      player_id: 'p1',
      category: 'dribbling',
      priorNeedsWork: 3,
      recentPositive: 3,
      detectedAt: new Date(NOW).toISOString(),
    };
    expect(getBestBreakthrough([bt])).toBe(bt);
  });

  it('returns null for an empty list', () => {
    expect(getBestBreakthrough([])).toBeNull();
  });
});

// ─── formatCategory ───────────────────────────────────────────────────────────

describe('formatCategory', () => {
  it('capitalizes the first letter', () => {
    expect(formatCategory('dribbling')).toBe('Dribbling');
  });

  it('lowercases the rest', () => {
    expect(formatCategory('SHOOTING')).toBe('Shooting');
  });

  it('handles a single character', () => {
    expect(formatCategory('d')).toBe('D');
  });

  it('returns an empty string for empty input', () => {
    expect(formatCategory('')).toBe('');
  });
});

// ─── hasEnoughDataForBreakthroughs ────────────────────────────────────────────

describe('hasEnoughDataForBreakthroughs', () => {
  it('returns false when fewer than 5 observations exist', () => {
    const data = [obs('p1', 'positive', 'dribbling', 1)];
    expect(hasEnoughDataForBreakthroughs(data)).toBe(false);
  });

  it('returns true when 5 or more observations exist', () => {
    const data = Array.from({ length: 5 }, (_, i) =>
      obs('p1', 'positive', 'dribbling', i + 1)
    );
    expect(hasEnoughDataForBreakthroughs(data)).toBe(true);
  });

  it('returns false for an empty array', () => {
    expect(hasEnoughDataForBreakthroughs([])).toBe(false);
  });
});

// ─── buildBreakthroughShareText ───────────────────────────────────────────────

describe('buildBreakthroughShareText', () => {
  it('includes the player name', () => {
    const text = buildBreakthroughShareText('Marcus', 'dribbling');
    expect(text).toContain('Marcus');
  });

  it('includes the formatted category', () => {
    const text = buildBreakthroughShareText('Marcus', 'dribbling');
    expect(text).toContain('Dribbling');
  });

  it('includes the coach name when provided', () => {
    const text = buildBreakthroughShareText('Marcus', 'dribbling', 'Coach Sarah');
    expect(text).toContain('Coach Sarah');
  });

  it('falls back to generic attribution when no coach name provided', () => {
    const text = buildBreakthroughShareText('Marcus', 'dribbling');
    expect(text).toContain('Your coach');
  });
});

// ─── buildBreakthroughWhatsAppUrl ─────────────────────────────────────────────

describe('buildBreakthroughWhatsAppUrl', () => {
  it('builds a generic wa.me URL when no phone given', () => {
    const url = buildBreakthroughWhatsAppUrl('hello world');
    expect(url).toContain('wa.me/?text=');
    expect(url).toContain('hello');
  });

  it('addresses the URL to a specific phone when provided', () => {
    const url = buildBreakthroughWhatsAppUrl('hello', '+1 555-123-4567');
    expect(url).toContain('wa.me/15551234567');
  });

  it('strips non-numeric characters from phone number', () => {
    const url = buildBreakthroughWhatsAppUrl('hi', '(555) 000-1234');
    expect(url).toContain('wa.me/5550001234');
  });
});

// ─── buildPriorLabel / buildRecentLabel ───────────────────────────────────────

describe('buildPriorLabel', () => {
  it('formats the prior needs-work count', () => {
    expect(buildPriorLabel(3)).toContain('3');
  });
});

describe('buildRecentLabel', () => {
  it('formats the recent positive count', () => {
    expect(buildRecentLabel(4)).toContain('4');
  });
});

// ─── getBreakthroughDismissKey ────────────────────────────────────────────────

describe('getBreakthroughDismissKey', () => {
  it('returns a string containing all three identifiers', () => {
    const key = getBreakthroughDismissKey('team1', 'player1', 'dribbling');
    expect(key).toContain('team1');
    expect(key).toContain('player1');
    expect(key).toContain('dribbling');
  });

  it('includes a week number so the key expires automatically', () => {
    const week = Math.floor(Date.now() / (RECENT_DAYS * DAY));
    const key = getBreakthroughDismissKey('t', 'p', 'c');
    expect(key).toContain(`w${week}`);
  });
});

// ─── constants ────────────────────────────────────────────────────────────────

describe('module constants', () => {
  it('exports BREAKTHROUGH_THRESHOLD as 2', () => {
    expect(BREAKTHROUGH_THRESHOLD).toBe(2);
  });

  it('exports RECENT_DAYS as 7', () => {
    expect(RECENT_DAYS).toBe(7);
  });

  it('exports PRIOR_DAYS as 21', () => {
    expect(PRIOR_DAYS).toBe(21);
  });
});
