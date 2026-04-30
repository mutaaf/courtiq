import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPriorWeekMonday,
  getWeekWindow,
  formatWeekLabel,
  filterObsInWindow,
  countPositiveObs,
  countNeedsWorkObs,
  getObservedPlayerIds,
  getTopPerformer,
  getNeglectedPlayerNames,
  getTopCategory,
  formatCategoryLabel,
  getDigestKey,
  hasAlreadySentDigest,
  isDigestDisabled,
  markDigestSent,
  hasEnoughDataForDigest,
  buildDigestSubject,
  getCoachGreeting,
  buildDigestHtml,
  type DigestObs,
  type DigestPlayer,
} from '@/lib/weekly-digest-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MONDAY_STR = '2026-04-20'; // a known Monday

function makeObs(overrides: Partial<DigestObs> = {}): DigestObs {
  return {
    player_id: 'p1',
    sentiment: 'positive',
    category: 'dribbling',
    created_at: '2026-04-21T10:00:00Z',
    text: 'Great dribbling!',
    ...overrides,
  };
}

function makePlayer(overrides: Partial<DigestPlayer> = {}): DigestPlayer {
  return { id: 'p1', name: 'Marcus', jersey_number: 12, ...overrides };
}

const PLAYERS: DigestPlayer[] = [
  makePlayer({ id: 'p1', name: 'Marcus' }),
  makePlayer({ id: 'p2', name: 'Jayden', jersey_number: 7 }),
  makePlayer({ id: 'p3', name: 'Sofia', jersey_number: 23 }),
];

// ─── getPriorWeekMonday ───────────────────────────────────────────────────────

describe('getPriorWeekMonday', () => {
  it('returns prior Monday when today is Monday', () => {
    // 2026-04-27 is a Monday
    const result = getPriorWeekMonday(new Date('2026-04-27T08:00:00Z'));
    expect(result).toBe('2026-04-20');
  });

  it('returns most recent Monday when today is Wednesday', () => {
    // 2026-04-22 is a Wednesday → prior Monday is 2026-04-20
    const result = getPriorWeekMonday(new Date('2026-04-22T08:00:00Z'));
    expect(result).toBe('2026-04-20');
  });

  it('returns most recent Monday when today is Sunday', () => {
    // 2026-04-26 is a Sunday → prior Monday is 2026-04-20
    const result = getPriorWeekMonday(new Date('2026-04-26T08:00:00Z'));
    expect(result).toBe('2026-04-20');
  });

  it('returns correct Monday when month boundary is crossed', () => {
    // 2026-05-04 is a Monday → prior Monday is 2026-04-27
    const result = getPriorWeekMonday(new Date('2026-05-04T08:00:00Z'));
    expect(result).toBe('2026-04-27');
  });
});

// ─── getWeekWindow ────────────────────────────────────────────────────────────

describe('getWeekWindow', () => {
  it('returns Mon–Sun range', () => {
    const { start, end } = getWeekWindow(MONDAY_STR);
    expect(start).toBe('2026-04-20');
    expect(end).toBe('2026-04-26');
  });

  it('handles month crossing', () => {
    const { start, end } = getWeekWindow('2026-04-27');
    expect(start).toBe('2026-04-27');
    expect(end).toBe('2026-05-03');
  });
});

// ─── formatWeekLabel ─────────────────────────────────────────────────────────

describe('formatWeekLabel', () => {
  it('uses single month when week stays in same month', () => {
    expect(formatWeekLabel('2026-04-20', '2026-04-26')).toBe('Apr 20–26');
  });

  it('shows both months when week crosses month boundary', () => {
    expect(formatWeekLabel('2026-04-27', '2026-05-03')).toBe('Apr 27 – May 3');
  });
});

// ─── filterObsInWindow ────────────────────────────────────────────────────────

describe('filterObsInWindow', () => {
  it('includes obs on the start date', () => {
    const obs = [makeObs({ created_at: '2026-04-20T00:00:00Z' })];
    expect(filterObsInWindow(obs, '2026-04-20', '2026-04-26')).toHaveLength(1);
  });

  it('includes obs on the end date', () => {
    const obs = [makeObs({ created_at: '2026-04-26T23:59:59Z' })];
    expect(filterObsInWindow(obs, '2026-04-20', '2026-04-26')).toHaveLength(1);
  });

  it('excludes obs before the window', () => {
    const obs = [makeObs({ created_at: '2026-04-19T23:59:59Z' })];
    expect(filterObsInWindow(obs, '2026-04-20', '2026-04-26')).toHaveLength(0);
  });

  it('excludes obs after the window', () => {
    const obs = [makeObs({ created_at: '2026-04-27T00:00:00Z' })];
    expect(filterObsInWindow(obs, '2026-04-20', '2026-04-26')).toHaveLength(0);
  });

  it('handles empty array', () => {
    expect(filterObsInWindow([], '2026-04-20', '2026-04-26')).toHaveLength(0);
  });
});

// ─── countPositiveObs / countNeedsWorkObs ────────────────────────────────────

describe('countPositiveObs', () => {
  it('counts only positive', () => {
    const obs = [
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'needs-work' }),
    ];
    expect(countPositiveObs(obs)).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countPositiveObs([])).toBe(0);
  });
});

describe('countNeedsWorkObs', () => {
  it('counts only needs-work', () => {
    const obs = [
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'needs-work' }),
    ];
    expect(countNeedsWorkObs(obs)).toBe(2);
  });
});

// ─── getObservedPlayerIds ─────────────────────────────────────────────────────

describe('getObservedPlayerIds', () => {
  it('returns unique player ids', () => {
    const obs = [
      makeObs({ player_id: 'p1' }),
      makeObs({ player_id: 'p1' }),
      makeObs({ player_id: 'p2' }),
      makeObs({ player_id: null }),
    ];
    const ids = getObservedPlayerIds(obs);
    expect(ids.size).toBe(2);
    expect(ids.has('p1')).toBe(true);
    expect(ids.has('p2')).toBe(true);
  });

  it('excludes null player_id', () => {
    const obs = [makeObs({ player_id: null })];
    expect(getObservedPlayerIds(obs).size).toBe(0);
  });

  it('returns empty set for empty array', () => {
    expect(getObservedPlayerIds([]).size).toBe(0);
  });
});

// ─── getTopPerformer ─────────────────────────────────────────────────────────

describe('getTopPerformer', () => {
  it('returns player with most positive obs', () => {
    const obs = [
      makeObs({ player_id: 'p1', sentiment: 'positive' }),
      makeObs({ player_id: 'p1', sentiment: 'positive' }),
      makeObs({ player_id: 'p2', sentiment: 'positive' }),
    ];
    const result = getTopPerformer(obs, PLAYERS);
    expect(result?.name).toBe('Marcus');
    expect(result?.count).toBe(2);
  });

  it('ignores needs-work observations', () => {
    const obs = [
      makeObs({ player_id: 'p1', sentiment: 'needs-work' }),
      makeObs({ player_id: 'p2', sentiment: 'positive' }),
    ];
    const result = getTopPerformer(obs, PLAYERS);
    expect(result?.name).toBe('Jayden');
    expect(result?.count).toBe(1);
  });

  it('returns null when no player-linked positive obs', () => {
    const obs = [makeObs({ player_id: null, sentiment: 'positive' })];
    expect(getTopPerformer(obs, PLAYERS)).toBeNull();
  });

  it('returns null when no positive obs at all', () => {
    const obs = [makeObs({ player_id: 'p1', sentiment: 'needs-work' })];
    expect(getTopPerformer(obs, PLAYERS)).toBeNull();
  });

  it('returns null for empty arrays', () => {
    expect(getTopPerformer([], PLAYERS)).toBeNull();
    expect(getTopPerformer([makeObs()], [])).toBeNull();
  });
});

// ─── getNeglectedPlayerNames ─────────────────────────────────────────────────

describe('getNeglectedPlayerNames', () => {
  it('returns players with no obs in last N days', () => {
    const recentDate = new Date();
    recentDate.setUTCDate(recentDate.getUTCDate() - 1);
    const obs = [makeObs({ player_id: 'p1', created_at: recentDate.toISOString() })];
    const names = getNeglectedPlayerNames(obs, PLAYERS, 7);
    expect(names).toContain('Jayden');
    expect(names).toContain('Sofia');
    expect(names).not.toContain('Marcus');
  });

  it('returns empty array when all players observed recently', () => {
    const recent = new Date().toISOString();
    const obs = PLAYERS.map((p) => makeObs({ player_id: p.id, created_at: recent }));
    expect(getNeglectedPlayerNames(obs, PLAYERS, 7)).toHaveLength(0);
  });

  it('caps results at 5', () => {
    const manyPlayers: DigestPlayer[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      jersey_number: i,
    }));
    const names = getNeglectedPlayerNames([], manyPlayers, 7);
    expect(names.length).toBeLessThanOrEqual(5);
  });

  it('returns empty array when no players', () => {
    expect(getNeglectedPlayerNames([], [], 7)).toHaveLength(0);
  });
});

// ─── getTopCategory ───────────────────────────────────────────────────────────

describe('getTopCategory', () => {
  it('returns category with most positive obs', () => {
    const obs = [
      makeObs({ sentiment: 'positive', category: 'dribbling' }),
      makeObs({ sentiment: 'positive', category: 'dribbling' }),
      makeObs({ sentiment: 'positive', category: 'defense' }),
    ];
    expect(getTopCategory(obs)).toBe('dribbling');
  });

  it('ignores needs-work obs', () => {
    const obs = [
      makeObs({ sentiment: 'needs-work', category: 'dribbling' }),
      makeObs({ sentiment: 'needs-work', category: 'dribbling' }),
      makeObs({ sentiment: 'positive', category: 'defense' }),
    ];
    expect(getTopCategory(obs)).toBe('defense');
  });

  it('returns null when no positive obs', () => {
    const obs = [makeObs({ sentiment: 'needs-work', category: 'dribbling' })];
    expect(getTopCategory(obs)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(getTopCategory([])).toBeNull();
  });

  it('ignores obs without category', () => {
    const obs = [makeObs({ sentiment: 'positive', category: null })];
    expect(getTopCategory(obs)).toBeNull();
  });
});

// ─── formatCategoryLabel ──────────────────────────────────────────────────────

describe('formatCategoryLabel', () => {
  it('capitalises single-word category', () => {
    expect(formatCategoryLabel('dribbling')).toBe('Dribbling');
  });

  it('capitalises hyphenated category', () => {
    expect(formatCategoryLabel('needs-work')).toBe('Needs Work');
  });

  it('capitalises underscore-separated category', () => {
    expect(formatCategoryLabel('ball_handling')).toBe('Ball Handling');
  });

  it('handles already-capitalised input', () => {
    expect(formatCategoryLabel('Defense')).toBe('Defense');
  });
});

// ─── Preferences helpers ──────────────────────────────────────────────────────

describe('getDigestKey', () => {
  it('returns prefixed key', () => {
    expect(getDigestKey('2026-04-20')).toBe('digest_week_2026-04-20');
  });
});

describe('hasAlreadySentDigest', () => {
  it('returns true when key is set', () => {
    const prefs = { 'digest_week_2026-04-20': true };
    expect(hasAlreadySentDigest(prefs, '2026-04-20')).toBe(true);
  });

  it('returns false when key is missing', () => {
    expect(hasAlreadySentDigest({}, '2026-04-20')).toBe(false);
  });

  it('returns false for null preferences', () => {
    expect(hasAlreadySentDigest(null, '2026-04-20')).toBe(false);
  });

  it('returns false for array preferences', () => {
    expect(hasAlreadySentDigest([], '2026-04-20')).toBe(false);
  });
});

describe('isDigestDisabled', () => {
  it('returns true when opt-out flag is set', () => {
    expect(isDigestDisabled({ disable_weekly_digest: true })).toBe(true);
  });

  it('returns false when flag is absent', () => {
    expect(isDigestDisabled({})).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDigestDisabled(null)).toBe(false);
  });
});

describe('markDigestSent', () => {
  it('adds key to existing preferences', () => {
    const prefs = { other_key: true };
    const result = markDigestSent(prefs, '2026-04-20');
    expect(result['digest_week_2026-04-20']).toBe(true);
    expect(result['other_key']).toBe(true);
  });

  it('creates preferences from null', () => {
    const result = markDigestSent(null, '2026-04-20');
    expect(result['digest_week_2026-04-20']).toBe(true);
  });

  it('does not mutate the original object', () => {
    const prefs = { other_key: true };
    markDigestSent(prefs, '2026-04-20');
    expect((prefs as any)['digest_week_2026-04-20']).toBeUndefined();
  });
});

// ─── hasEnoughDataForDigest ───────────────────────────────────────────────────

describe('hasEnoughDataForDigest', () => {
  it('returns true when obs >= 2 and players >= 2', () => {
    expect(hasEnoughDataForDigest(2, 2)).toBe(true);
    expect(hasEnoughDataForDigest(10, 5)).toBe(true);
  });

  it('returns false when obs < 2', () => {
    expect(hasEnoughDataForDigest(1, 5)).toBe(false);
    expect(hasEnoughDataForDigest(0, 5)).toBe(false);
  });

  it('returns false when players < 2', () => {
    expect(hasEnoughDataForDigest(5, 1)).toBe(false);
    expect(hasEnoughDataForDigest(5, 0)).toBe(false);
  });
});

// ─── buildDigestSubject ───────────────────────────────────────────────────────

describe('buildDigestSubject', () => {
  it('uses trophy subject for 20+ obs', () => {
    const s = buildDigestSubject('Rockets', 20);
    expect(s).toContain('Great week');
    expect(s).toContain('Rockets');
    expect(s).toContain('20');
  });

  it('uses chart subject for 10-19 obs', () => {
    const s = buildDigestSubject('Tigers', 15);
    expect(s).toContain('Tigers');
    expect(s).not.toContain('Great week');
  });

  it('uses clipboard subject for < 10 obs', () => {
    const s = buildDigestSubject('Panthers', 5);
    expect(s).toContain('Panthers');
  });
});

// ─── getCoachGreeting ─────────────────────────────────────────────────────────

describe('getCoachGreeting', () => {
  it('uses first name only', () => {
    expect(getCoachGreeting('John Smith')).toBe('Hey John,');
  });

  it('works with single name', () => {
    expect(getCoachGreeting('Maria')).toBe('Hey Maria,');
  });
});

// ─── buildDigestHtml ─────────────────────────────────────────────────────────

describe('buildDigestHtml', () => {
  const baseData = {
    coachName: 'John Smith',
    teamName: 'Rockets',
    weekLabel: 'Apr 20–26',
    weekObs: 10,
    weekSessions: 2,
    weekPlayers: 5,
    positiveObs: 7,
    needsWorkObs: 3,
    topPerformer: { name: 'Marcus', count: 3 },
    neglectedPlayerNames: ['Jayden', 'Sofia'],
    topCategory: 'dribbling',
    appUrl: 'https://app.example.com',
  };

  it('includes team name', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('Rockets');
  });

  it('includes week label', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('Apr 20–26');
  });

  it('includes observation count', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('10');
  });

  it('includes top performer name', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('Marcus');
  });

  it('includes neglected player names', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('Jayden');
    expect(html).toContain('Sofia');
  });

  it('includes top category', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('Dribbling');
  });

  it('includes plans CTA link', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('https://app.example.com/plans');
  });

  it('omits performer section when null', () => {
    const html = buildDigestHtml({ ...baseData, topPerformer: null });
    expect(html).not.toContain('Player Spotlight');
  });

  it('omits neglected section when empty', () => {
    const html = buildDigestHtml({ ...baseData, neglectedPlayerNames: [] });
    expect(html).not.toContain('Players Needing Attention');
  });

  it('omits category section when null', () => {
    const html = buildDigestHtml({ ...baseData, topCategory: null });
    expect(html).not.toContain('Top Strength');
  });

  it('includes positive rate when weekObs > 0', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('70%');
    expect(html).toContain('positive');
  });

  it('returns valid HTML structure', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('greets coach by first name', () => {
    const html = buildDigestHtml(baseData);
    expect(html).toContain('John');
    expect(html).toContain('Hey');
  });
});
