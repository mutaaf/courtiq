import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  countTotalObs,
  countPositiveWrapObs,
  countNeedsWorkWrapObs,
  countObservedPlayers,
  getTopPlayerIdByPositive,
  getTopPositiveWrapCategory,
  getTopNeedsWorkWrapCategory,
  hasEnoughDataForWrap,
  formatWrapCategory,
  buildWeeklyWrapMessage,
  buildWrapPreview,
  buildWrapWhatsAppUrl,
  getWrapDismissKey,
  isWrapDismissed,
  dismissWrap,
  getWeekMondayIso,
  getCutoffIso,
  type WrapObs,
  type WeeklyWrapMessageParams,
} from '@/lib/weekly-wrap-utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeObs(overrides: Partial<WrapObs> = {}): WrapObs {
  return {
    player_id: 'p1',
    sentiment: 'positive',
    category: 'dribbling',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeParams(overrides: Partial<WeeklyWrapMessageParams> = {}): WeeklyWrapMessageParams {
  return {
    teamName: 'YMCA Rockets',
    coachName: 'Sarah Thompson',
    obsCount: 8,
    sessionCount: 2,
    observedPlayerCount: 7,
    totalPlayerCount: 12,
    topPlayerName: 'Marcus',
    topPositiveCategory: 'dribbling',
    topNeedsWorkCategory: 'defense',
    ...overrides,
  };
}

// ─── Week helpers ─────────────────────────────────────────────────────────────

describe('getWeekMondayIso', () => {
  it('returns an ISO string', () => {
    const result = getWeekMondayIso();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns a date at or before today', () => {
    const result = new Date(getWeekMondayIso());
    expect(result.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('getCutoffIso', () => {
  it('returns a string approximately N days before now', () => {
    const before = Date.now();
    const cutoff = new Date(getCutoffIso(7)).getTime();
    const after = Date.now();
    expect(cutoff).toBeLessThan(before);
    expect(cutoff).toBeGreaterThan(after - 8 * 86_400_000);
  });
});

// ─── Dismiss helpers ─────────────────────────────────────────────────────────

describe('getWrapDismissKey', () => {
  it('includes the team ID', () => {
    const key = getWrapDismissKey('team-abc');
    expect(key).toContain('team-abc');
  });

  it('includes a date string', () => {
    const key = getWrapDismissKey('t1');
    expect(key).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('is consistent across multiple calls in the same week', () => {
    expect(getWrapDismissKey('t1')).toBe(getWrapDismissKey('t1'));
  });
});

describe('isWrapDismissed / dismissWrap', () => {
  beforeEach(() => localStorage.clear());

  it('returns false when not dismissed', () => {
    expect(isWrapDismissed('team-1')).toBe(false);
  });

  it('returns true after dismissing', () => {
    dismissWrap('team-1');
    expect(isWrapDismissed('team-1')).toBe(true);
  });

  it('does not affect a different team', () => {
    dismissWrap('team-1');
    expect(isWrapDismissed('team-2')).toBe(false);
  });
});

// ─── Observation analysis ─────────────────────────────────────────────────────

describe('countTotalObs', () => {
  it('counts all observations', () => {
    expect(countTotalObs([makeObs(), makeObs(), makeObs()])).toBe(3);
  });

  it('returns 0 for empty array', () => {
    expect(countTotalObs([])).toBe(0);
  });
});

describe('countPositiveWrapObs', () => {
  it('counts only positive', () => {
    const obs = [
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'positive' }),
    ];
    expect(countPositiveWrapObs(obs)).toBe(2);
  });

  it('returns 0 when none positive', () => {
    expect(countPositiveWrapObs([makeObs({ sentiment: 'needs-work' })])).toBe(0);
  });
});

describe('countNeedsWorkWrapObs', () => {
  it('counts only needs-work', () => {
    const obs = [
      makeObs({ sentiment: 'positive' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'needs-work' }),
    ];
    expect(countNeedsWorkWrapObs(obs)).toBe(2);
  });
});

describe('countObservedPlayers', () => {
  it('counts distinct player IDs', () => {
    const obs = [
      makeObs({ player_id: 'p1' }),
      makeObs({ player_id: 'p2' }),
      makeObs({ player_id: 'p1' }),
    ];
    expect(countObservedPlayers(obs)).toBe(2);
  });

  it('excludes null player_id', () => {
    const obs = [makeObs({ player_id: null }), makeObs({ player_id: 'p1' })];
    expect(countObservedPlayers(obs)).toBe(1);
  });

  it('returns 0 when empty', () => {
    expect(countObservedPlayers([])).toBe(0);
  });
});

describe('getTopPlayerIdByPositive', () => {
  it('returns the player with most positive observations', () => {
    const obs = [
      makeObs({ player_id: 'p1', sentiment: 'positive' }),
      makeObs({ player_id: 'p2', sentiment: 'positive' }),
      makeObs({ player_id: 'p2', sentiment: 'positive' }),
      makeObs({ player_id: 'p1', sentiment: 'needs-work' }),
    ];
    expect(getTopPlayerIdByPositive(obs)).toBe('p2');
  });

  it('returns null when no positive observations', () => {
    expect(getTopPlayerIdByPositive([makeObs({ sentiment: 'needs-work' })])).toBeNull();
  });

  it('ignores null player_id', () => {
    const obs = [makeObs({ player_id: null, sentiment: 'positive' })];
    expect(getTopPlayerIdByPositive(obs)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(getTopPlayerIdByPositive([])).toBeNull();
  });
});

describe('getTopPositiveWrapCategory', () => {
  it('returns the category with most positive observations', () => {
    const obs = [
      makeObs({ sentiment: 'positive', category: 'shooting' }),
      makeObs({ sentiment: 'positive', category: 'dribbling' }),
      makeObs({ sentiment: 'positive', category: 'dribbling' }),
      makeObs({ sentiment: 'needs-work', category: 'shooting' }),
    ];
    expect(getTopPositiveWrapCategory(obs)).toBe('dribbling');
  });

  it('returns null when no positive observations', () => {
    expect(getTopPositiveWrapCategory([makeObs({ sentiment: 'needs-work' })])).toBeNull();
  });

  it('ignores null categories', () => {
    const obs = [makeObs({ sentiment: 'positive', category: null })];
    expect(getTopPositiveWrapCategory(obs)).toBeNull();
  });
});

describe('getTopNeedsWorkWrapCategory', () => {
  it('returns the category with most needs-work observations', () => {
    const obs = [
      makeObs({ sentiment: 'needs-work', category: 'defense' }),
      makeObs({ sentiment: 'needs-work', category: 'defense' }),
      makeObs({ sentiment: 'needs-work', category: 'passing' }),
    ];
    expect(getTopNeedsWorkWrapCategory(obs)).toBe('defense');
  });

  it('returns null when no needs-work observations', () => {
    expect(getTopNeedsWorkWrapCategory([makeObs({ sentiment: 'positive' })])).toBeNull();
  });
});

describe('hasEnoughDataForWrap', () => {
  it('returns false when fewer than 5 observations', () => {
    expect(hasEnoughDataForWrap([makeObs(), makeObs()])).toBe(false);
  });

  it('returns true when 5 or more observations', () => {
    const obs = Array.from({ length: 5 }, () => makeObs());
    expect(hasEnoughDataForWrap(obs)).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(hasEnoughDataForWrap([])).toBe(false);
  });
});

// ─── Formatting ───────────────────────────────────────────────────────────────

describe('formatWrapCategory', () => {
  it('formats known categories', () => {
    expect(formatWrapCategory('dribbling')).toBe('Ball Handling');
    expect(formatWrapCategory('shooting')).toBe('Shooting');
    expect(formatWrapCategory('defense')).toBe('Defense');
    expect(formatWrapCategory('awareness')).toBe('Court Awareness');
    expect(formatWrapCategory('general')).toBe('Overall');
  });

  it('capitalizes unknown categories', () => {
    expect(formatWrapCategory('sprinting')).toBe('Sprinting');
  });

  it('replaces hyphens in unknown categories', () => {
    expect(formatWrapCategory('ball-control')).toBe('Ball control');
  });
});

// ─── Message builder ─────────────────────────────────────────────────────────

describe('buildWeeklyWrapMessage', () => {
  it('includes the team name', () => {
    const msg = buildWeeklyWrapMessage(makeParams());
    expect(msg).toContain('YMCA Rockets');
  });

  it('includes the coach first name', () => {
    const msg = buildWeeklyWrapMessage(makeParams());
    expect(msg).toContain('Coach Sarah');
  });

  it('includes the observation count', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ obsCount: 12 }));
    expect(msg).toContain('12');
  });

  it('shows "1 session" singular', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ sessionCount: 1 }));
    expect(msg).toContain('1 session');
    expect(msg).not.toContain('1 sessions');
  });

  it('shows plural sessions', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ sessionCount: 3 }));
    expect(msg).toContain('3 sessions');
  });

  it('mentions top player', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ topPlayerName: 'Jordan' }));
    expect(msg).toContain('Jordan');
  });

  it('mentions positive skill category', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ topPositiveCategory: 'shooting' }));
    expect(msg).toContain('Shooting');
  });

  it('mentions needs-work category as focus', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ topNeedsWorkCategory: 'defense' }));
    expect(msg).toContain('Defense');
  });

  it('handles null top player gracefully', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ topPlayerName: null }));
    expect(msg).not.toContain('⭐ Shoutout to');
    expect(msg).toContain('YMCA Rockets');
  });

  it('handles null needs-work category gracefully', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ topNeedsWorkCategory: null }));
    expect(msg).not.toContain('focusing on');
    expect(msg).toContain('Coach Sarah');
  });

  it('handles zero sessions gracefully', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ sessionCount: 0 }));
    expect(msg).not.toContain('0 sessions');
    expect(msg).toContain('observations');
  });

  it('includes player coverage line when data present', () => {
    const msg = buildWeeklyWrapMessage(
      makeParams({ observedPlayerCount: 8, totalPlayerCount: 12 })
    );
    expect(msg).toContain('8 of 12');
  });

  it('uses only first name of coach', () => {
    const msg = buildWeeklyWrapMessage(makeParams({ coachName: 'Michael Jordan' }));
    expect(msg).toContain('Coach Michael');
    expect(msg).not.toContain('Jordan Jordan');
  });

  it('ends with encouragement', () => {
    const msg = buildWeeklyWrapMessage(makeParams());
    expect(msg).toContain('Great effort this week!');
  });
});

// ─── Preview text ─────────────────────────────────────────────────────────────

describe('buildWrapPreview', () => {
  it('includes session count', () => {
    const preview = buildWrapPreview(makeParams({ sessionCount: 2 }));
    expect(preview).toContain('2 sessions');
  });

  it('includes obs count', () => {
    const preview = buildWrapPreview(makeParams({ obsCount: 10 }));
    expect(preview).toContain('10 obs');
  });

  it('includes top player first name', () => {
    const preview = buildWrapPreview(makeParams({ topPlayerName: 'Marcus Johnson' }));
    expect(preview).toContain('Marcus');
  });

  it('shows "1 session" singular', () => {
    const preview = buildWrapPreview(makeParams({ sessionCount: 1 }));
    expect(preview).toContain('1 session');
    expect(preview).not.toContain('1 sessions');
  });

  it('handles null player name', () => {
    const preview = buildWrapPreview(makeParams({ topPlayerName: null }));
    expect(preview).not.toContain('undefined');
  });
});

// ─── WhatsApp URL ─────────────────────────────────────────────────────────────

describe('buildWrapWhatsAppUrl', () => {
  it('starts with wa.me', () => {
    expect(buildWrapWhatsAppUrl('hello')).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it('URI-encodes the message', () => {
    const url = buildWrapWhatsAppUrl('Hi there! 👋');
    expect(url).toContain(encodeURIComponent('Hi there! 👋'));
  });
});
