import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hasPlayerJersey,
  hasPlayerEmail,
  hasPlayerPhone,
  hasPlayerParentContact,
  countPlayersWithoutJersey,
  countPlayersWithoutParentContact,
  getPlayersWithoutJersey,
  getPlayersWithoutParentContact,
  getSessionObsCount,
  sessionNeedsRating,
  sessionNeedsDebrief,
  isGameSession,
  hasSufficientDataForWins,
  buildRateSessionAction,
  buildDebriefAction,
  buildAddJerseyAction,
  buildAddParentContactAction,
  buildSetWeeklyFocusAction,
  buildGeneratePlanAction,
  buildWeeklyStarAction,
  getActionIcon,
  formatEstimatedTime,
  buildDismissKey,
  isActionDismissed,
  dismissAction,
  clearDismiss,
  gatherAllActions,
  rankActions,
  selectTopActions,
  filterUndismissedActions,
  type ActionPlayer,
  type ActionSession,
  type GatherActionsParams,
} from '@/lib/next-best-actions-utils';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const p = (overrides: Partial<ActionPlayer> = {}): ActionPlayer => ({
  id: '1',
  name: 'Marcus',
  jersey_number: null,
  parent_email: null,
  parent_phone: null,
  ...overrides,
});

const sess = (overrides: Partial<ActionSession> = {}): ActionSession => ({
  id: 'sess-1',
  type: 'practice',
  date: '2026-05-15',
  quality_rating: null,
  coach_debrief_extracts: null,
  observations: [{ count: 5 }],
  ...overrides,
});

const defaultParams = (overrides: Partial<GatherActionsParams> = {}): GatherActionsParams => ({
  lastSession: sess(),
  players: [],
  obsCount: 10,
  sessionCount: 3,
  weeklyFocusSet: false,
  planGeneratedThisWeek: false,
  weeklyStarGeneratedThisWeek: false,
  ...overrides,
});

// ── Player helpers ─────────────────────────────────────────────────────────────

describe('hasPlayerJersey', () => {
  it('returns true when jersey_number is set', () => {
    expect(hasPlayerJersey(p({ jersey_number: 7 }))).toBe(true);
  });
  it('returns false when jersey_number is null', () => {
    expect(hasPlayerJersey(p({ jersey_number: null }))).toBe(false);
  });
  it('returns false when jersey_number is undefined', () => {
    expect(hasPlayerJersey(p({ jersey_number: undefined }))).toBe(false);
  });
  it('returns true for jersey_number 0', () => {
    expect(hasPlayerJersey(p({ jersey_number: 0 }))).toBe(true);
  });
});

describe('hasPlayerEmail', () => {
  it('returns true when parent_email is set', () => {
    expect(hasPlayerEmail(p({ parent_email: 'a@b.com' }))).toBe(true);
  });
  it('returns false when parent_email is null', () => {
    expect(hasPlayerEmail(p({ parent_email: null }))).toBe(false);
  });
  it('returns false when parent_email is empty string', () => {
    expect(hasPlayerEmail(p({ parent_email: '  ' }))).toBe(false);
  });
});

describe('hasPlayerPhone', () => {
  it('returns true when parent_phone is set', () => {
    expect(hasPlayerPhone(p({ parent_phone: '555-1234' }))).toBe(true);
  });
  it('returns false when parent_phone is null', () => {
    expect(hasPlayerPhone(p({ parent_phone: null }))).toBe(false);
  });
  it('returns false when parent_phone is empty string', () => {
    expect(hasPlayerPhone(p({ parent_phone: '' }))).toBe(false);
  });
});

describe('hasPlayerParentContact', () => {
  it('returns true when email is set', () => {
    expect(hasPlayerParentContact(p({ parent_email: 'a@b.com' }))).toBe(true);
  });
  it('returns true when phone is set', () => {
    expect(hasPlayerParentContact(p({ parent_phone: '555' }))).toBe(true);
  });
  it('returns false when neither is set', () => {
    expect(hasPlayerParentContact(p())).toBe(false);
  });
});

describe('countPlayersWithoutJersey', () => {
  it('returns 0 when all players have jerseys', () => {
    const players = [p({ jersey_number: 1 }), p({ jersey_number: 2 })];
    expect(countPlayersWithoutJersey(players)).toBe(0);
  });
  it('counts players with null jersey', () => {
    const players = [p({ jersey_number: 1 }), p(), p()];
    expect(countPlayersWithoutJersey(players)).toBe(2);
  });
  it('returns 0 for empty array', () => {
    expect(countPlayersWithoutJersey([])).toBe(0);
  });
});

describe('countPlayersWithoutParentContact', () => {
  it('counts players with no email or phone', () => {
    const players = [
      p({ parent_email: 'a@b.com' }),
      p(),
      p({ parent_phone: '555' }),
      p(),
    ];
    expect(countPlayersWithoutParentContact(players)).toBe(2);
  });
});

describe('getPlayersWithoutJersey', () => {
  it('returns only players missing jersey', () => {
    const players = [p({ id: '1', jersey_number: 5 }), p({ id: '2' })];
    expect(getPlayersWithoutJersey(players)).toHaveLength(1);
    expect(getPlayersWithoutJersey(players)[0].id).toBe('2');
  });
});

describe('getPlayersWithoutParentContact', () => {
  it('returns only players with no contact', () => {
    const players = [p({ id: '1', parent_email: 'x@y.com' }), p({ id: '2' })];
    expect(getPlayersWithoutParentContact(players)).toHaveLength(1);
  });
});

// ── Session helpers ───────────────────────────────────────────────────────────

describe('getSessionObsCount', () => {
  it('returns count from nested array', () => {
    expect(getSessionObsCount(sess({ observations: [{ count: 8 }] }))).toBe(8);
  });
  it('returns 0 when no observations array', () => {
    const s: ActionSession = { id: '1', type: 'practice', date: '2026-01-01' };
    expect(getSessionObsCount(s)).toBe(0);
  });
});

describe('sessionNeedsRating', () => {
  it('returns true when quality_rating is null', () => {
    expect(sessionNeedsRating(sess({ quality_rating: null }))).toBe(true);
  });
  it('returns false when quality_rating is set', () => {
    expect(sessionNeedsRating(sess({ quality_rating: 4 }))).toBe(false);
  });
});

describe('sessionNeedsDebrief', () => {
  it('returns true when no debrief and ≥3 obs', () => {
    expect(sessionNeedsDebrief(sess({ coach_debrief_extracts: null, observations: [{ count: 5 }] }))).toBe(true);
  });
  it('returns false when debrief exists', () => {
    expect(sessionNeedsDebrief(sess({ coach_debrief_extracts: { foo: 'bar' }, observations: [{ count: 5 }] }))).toBe(false);
  });
  it('returns false when fewer than 3 obs', () => {
    expect(sessionNeedsDebrief(sess({ coach_debrief_extracts: null, observations: [{ count: 2 }] }))).toBe(false);
  });
});

describe('isGameSession', () => {
  it('returns true for game type', () => {
    expect(isGameSession(sess({ type: 'game' }))).toBe(true);
  });
  it('returns true for scrimmage', () => {
    expect(isGameSession(sess({ type: 'scrimmage' }))).toBe(true);
  });
  it('returns true for tournament', () => {
    expect(isGameSession(sess({ type: 'tournament' }))).toBe(true);
  });
  it('returns false for practice', () => {
    expect(isGameSession(sess({ type: 'practice' }))).toBe(false);
  });
  it('returns false for training', () => {
    expect(isGameSession(sess({ type: 'training' }))).toBe(false);
  });
});

// ── Gate ──────────────────────────────────────────────────────────────────────

describe('hasSufficientDataForWins', () => {
  it('returns true when ≥1 session regardless of obs count', () => {
    expect(hasSufficientDataForWins(0, 1)).toBe(true);
  });
  it('returns true with 4 obs and 1 session', () => {
    expect(hasSufficientDataForWins(4, 1)).toBe(true);
  });
  it('returns false when 0 sessions', () => {
    expect(hasSufficientDataForWins(10, 0)).toBe(false);
  });
  it('returns true with large counts', () => {
    expect(hasSufficientDataForWins(100, 20)).toBe(true);
  });
});

// ── Action builders ───────────────────────────────────────────────────────────

describe('buildRateSessionAction', () => {
  it('returns rate_session type', () => {
    expect(buildRateSessionAction(sess()).type).toBe('rate_session');
  });
  it('priority is 1', () => {
    expect(buildRateSessionAction(sess()).priority).toBe(1);
  });
  it('href links to session', () => {
    expect(buildRateSessionAction(sess({ id: 'abc' })).href).toBe('/sessions/abc');
  });
  it('mentions game type for game sessions', () => {
    const action = buildRateSessionAction(sess({ type: 'game' }));
    expect(action.title).toContain('game');
  });
  it('mentions practice type for practice sessions', () => {
    const action = buildRateSessionAction(sess({ type: 'practice' }));
    expect(action.title).toContain('practice');
  });
  it('estimatedSeconds is 5', () => {
    expect(buildRateSessionAction(sess()).estimatedSeconds).toBe(5);
  });
});

describe('buildDebriefAction', () => {
  it('returns ai_debrief type', () => {
    expect(buildDebriefAction(sess()).type).toBe('ai_debrief');
  });
  it('priority is 2', () => {
    expect(buildDebriefAction(sess()).priority).toBe(2);
  });
  it('href includes fromPractice param', () => {
    expect(buildDebriefAction(sess({ id: 'xyz' })).href).toContain('fromPractice=1');
  });
  it('subtitle mentions obs count', () => {
    const action = buildDebriefAction(sess({ observations: [{ count: 7 }] }));
    expect(action.subtitle).toContain('7');
  });
});

describe('buildAddJerseyAction', () => {
  it('returns add_jersey type', () => {
    expect(buildAddJerseyAction(4).type).toBe('add_jersey');
  });
  it('priority is 3', () => {
    expect(buildAddJerseyAction(4).priority).toBe(3);
  });
  it('title includes count', () => {
    expect(buildAddJerseyAction(5).title).toContain('5');
  });
  it('href goes to roster', () => {
    expect(buildAddJerseyAction(4).href).toBe('/roster');
  });
});

describe('buildAddParentContactAction', () => {
  it('returns add_parent_contact type', () => {
    expect(buildAddParentContactAction(6).type).toBe('add_parent_contact');
  });
  it('priority is 4', () => {
    expect(buildAddParentContactAction(6).priority).toBe(4);
  });
  it('title includes count', () => {
    expect(buildAddParentContactAction(6).title).toContain('6');
  });
});

describe('buildSetWeeklyFocusAction', () => {
  it('returns set_weekly_focus type', () => {
    expect(buildSetWeeklyFocusAction().type).toBe('set_weekly_focus');
  });
  it('priority is 5', () => {
    expect(buildSetWeeklyFocusAction().priority).toBe(5);
  });
});

describe('buildGeneratePlanAction', () => {
  it('returns generate_plan type', () => {
    expect(buildGeneratePlanAction().type).toBe('generate_plan');
  });
  it('priority is 6', () => {
    expect(buildGeneratePlanAction().priority).toBe(6);
  });
  it('href goes to plans', () => {
    expect(buildGeneratePlanAction().href).toBe('/plans');
  });
});

describe('buildWeeklyStarAction', () => {
  it('returns weekly_star type', () => {
    expect(buildWeeklyStarAction().type).toBe('weekly_star');
  });
  it('priority is 7', () => {
    expect(buildWeeklyStarAction().priority).toBe(7);
  });
});

// ── Icons and time ────────────────────────────────────────────────────────────

describe('getActionIcon', () => {
  it('returns a non-empty string for all types', () => {
    const types = [
      'rate_session',
      'ai_debrief',
      'add_jersey',
      'add_parent_contact',
      'set_weekly_focus',
      'generate_plan',
      'weekly_star',
    ] as const;
    for (const t of types) {
      expect(getActionIcon(t).length).toBeGreaterThan(0);
    }
  });
  it('returns fallback for unknown type', () => {
    expect(getActionIcon('unknown' as any)).toBe('✓');
  });
});

describe('formatEstimatedTime', () => {
  it('formats seconds under 60', () => {
    expect(formatEstimatedTime(5)).toBe('5s');
    expect(formatEstimatedTime(30)).toBe('30s');
    expect(formatEstimatedTime(59)).toBe('59s');
  });
  it('formats 60 seconds as 1 min', () => {
    expect(formatEstimatedTime(60)).toBe('1 min');
  });
  it('formats 120 seconds as 2 min', () => {
    expect(formatEstimatedTime(120)).toBe('2 min');
  });
  it('rounds 90 seconds to nearest minute', () => {
    expect(formatEstimatedTime(90)).toBe('2 min');
  });
});

// ── Dismiss helpers ───────────────────────────────────────────────────────────

describe('buildDismissKey', () => {
  it('includes type and teamId', () => {
    const key = buildDismissKey('rate_session', 'team-abc');
    expect(key).toContain('rate_session');
    expect(key).toContain('team-abc');
  });
  it('different types produce different keys', () => {
    expect(buildDismissKey('rate_session', 't1')).not.toBe(buildDismissKey('ai_debrief', 't1'));
  });
  it('different teams produce different keys', () => {
    expect(buildDismissKey('rate_session', 't1')).not.toBe(buildDismissKey('rate_session', 't2'));
  });
});

describe('isActionDismissed / dismissAction / clearDismiss', () => {
  const teamId = 'test-team';
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

  it('returns false when not dismissed', () => {
    expect(isActionDismissed('rate_session', teamId)).toBe(false);
  });

  it('returns true after dismissAction', () => {
    dismissAction('rate_session', teamId);
    expect(isActionDismissed('rate_session', teamId)).toBe(true);
  });

  it('returns false after clearDismiss', () => {
    dismissAction('ai_debrief', teamId);
    clearDismiss('ai_debrief', teamId);
    expect(isActionDismissed('ai_debrief', teamId)).toBe(false);
  });

  it('returns false when expiry is in the past', () => {
    const key = buildDismissKey('add_jersey', teamId);
    localStorageMock.setItem(key, String(Date.now() - 1000));
    expect(isActionDismissed('add_jersey', teamId)).toBe(false);
  });
});

// ── gatherAllActions ──────────────────────────────────────────────────────────

describe('gatherAllActions', () => {
  it('returns rate_session when last session has no rating', () => {
    const actions = gatherAllActions(defaultParams({ lastSession: sess({ quality_rating: null }) }));
    expect(actions.some((a) => a.type === 'rate_session')).toBe(true);
  });

  it('does not return rate_session when already rated', () => {
    const actions = gatherAllActions(defaultParams({ lastSession: sess({ quality_rating: 4 }) }));
    expect(actions.some((a) => a.type === 'rate_session')).toBe(false);
  });

  it('returns ai_debrief when session has no debrief and ≥3 obs', () => {
    const actions = gatherAllActions(
      defaultParams({ lastSession: sess({ coach_debrief_extracts: null, observations: [{ count: 5 }] }) }),
    );
    expect(actions.some((a) => a.type === 'ai_debrief')).toBe(true);
  });

  it('does not return ai_debrief when fewer than 3 obs', () => {
    const actions = gatherAllActions(
      defaultParams({ lastSession: sess({ coach_debrief_extracts: null, observations: [{ count: 2 }] }) }),
    );
    expect(actions.some((a) => a.type === 'ai_debrief')).toBe(false);
  });

  it('returns add_jersey when ≥3 players missing jersey', () => {
    const players = [p(), p(), p()];
    const actions = gatherAllActions(defaultParams({ players }));
    expect(actions.some((a) => a.type === 'add_jersey')).toBe(true);
  });

  it('does not return add_jersey when < 3 missing', () => {
    const players = [p(), p({ jersey_number: 5 }), p({ jersey_number: 7 })];
    const actions = gatherAllActions(defaultParams({ players }));
    expect(actions.some((a) => a.type === 'add_jersey')).toBe(false);
  });

  it('returns add_parent_contact when ≥3 players missing contact', () => {
    const players = [p(), p(), p()];
    const actions = gatherAllActions(defaultParams({ players }));
    expect(actions.some((a) => a.type === 'add_parent_contact')).toBe(true);
  });

  it('does not return add_parent_contact when < 3 missing', () => {
    const players = [
      p({ parent_email: 'a@b.com' }),
      p({ parent_phone: '555' }),
      p({ parent_email: 'c@d.com' }),
    ];
    const actions = gatherAllActions(defaultParams({ players }));
    expect(actions.some((a) => a.type === 'add_parent_contact')).toBe(false);
  });

  it('returns set_weekly_focus when not set and sufficient data', () => {
    const actions = gatherAllActions(defaultParams({ weeklyFocusSet: false }));
    expect(actions.some((a) => a.type === 'set_weekly_focus')).toBe(true);
  });

  it('does not return set_weekly_focus when already set', () => {
    const actions = gatherAllActions(defaultParams({ weeklyFocusSet: true }));
    expect(actions.some((a) => a.type === 'set_weekly_focus')).toBe(false);
  });

  it('returns generate_plan when no plan this week and ≥10 obs', () => {
    const actions = gatherAllActions(
      defaultParams({ planGeneratedThisWeek: false, obsCount: 10 }),
    );
    expect(actions.some((a) => a.type === 'generate_plan')).toBe(true);
  });

  it('does not return generate_plan when plan already generated', () => {
    const actions = gatherAllActions(defaultParams({ planGeneratedThisWeek: true }));
    expect(actions.some((a) => a.type === 'generate_plan')).toBe(false);
  });

  it('does not return generate_plan when fewer than 10 obs', () => {
    const actions = gatherAllActions(
      defaultParams({ planGeneratedThisWeek: false, obsCount: 9 }),
    );
    expect(actions.some((a) => a.type === 'generate_plan')).toBe(false);
  });

  it('returns weekly_star when not generated this week and ≥7 obs', () => {
    const actions = gatherAllActions(
      defaultParams({ weeklyStarGeneratedThisWeek: false, obsCount: 7 }),
    );
    expect(actions.some((a) => a.type === 'weekly_star')).toBe(true);
  });

  it('does not return weekly_star when already generated this week', () => {
    const actions = gatherAllActions(defaultParams({ weeklyStarGeneratedThisWeek: true }));
    expect(actions.some((a) => a.type === 'weekly_star')).toBe(false);
  });

  it('returns empty when no last session and all flags set', () => {
    const actions = gatherAllActions(
      defaultParams({
        lastSession: null,
        players: [],
        weeklyFocusSet: true,
        planGeneratedThisWeek: true,
        weeklyStarGeneratedThisWeek: true,
      }),
    );
    expect(actions).toHaveLength(0);
  });
});

// ── rankActions / selectTopActions ────────────────────────────────────────────

describe('rankActions', () => {
  it('sorts by priority ascending', () => {
    const actions = [buildWeeklyStarAction(), buildRateSessionAction(sess()), buildDebriefAction(sess())];
    const ranked = rankActions(actions);
    expect(ranked[0].type).toBe('rate_session');
    expect(ranked[1].type).toBe('ai_debrief');
    expect(ranked[2].type).toBe('weekly_star');
  });

  it('does not mutate input array', () => {
    const input = [buildWeeklyStarAction(), buildRateSessionAction(sess())];
    const original = [...input];
    rankActions(input);
    expect(input[0].type).toBe(original[0].type);
  });
});

describe('selectTopActions', () => {
  it('returns at most maxCount actions', () => {
    const actions = gatherAllActions(
      defaultParams({
        players: [p(), p(), p()],
        lastSession: sess({ quality_rating: null, observations: [{ count: 5 }] }),
        weeklyFocusSet: false,
      }),
    );
    const top = selectTopActions(actions, 3);
    expect(top.length).toBeLessThanOrEqual(3);
  });

  it('returns all actions when fewer than maxCount', () => {
    const actions = [buildRateSessionAction(sess())];
    expect(selectTopActions(actions, 3)).toHaveLength(1);
  });

  it('returns highest priority first', () => {
    const actions = [buildWeeklyStarAction(), buildRateSessionAction(sess())];
    const top = selectTopActions(actions, 2);
    expect(top[0].type).toBe('rate_session');
  });
});

// ── filterUndismissedActions ──────────────────────────────────────────────────

describe('filterUndismissedActions', () => {
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

  it('returns all actions when nothing dismissed', () => {
    const actions = [buildRateSessionAction(sess()), buildDebriefAction(sess())];
    expect(filterUndismissedActions(actions, 'team-x')).toHaveLength(2);
  });

  it('excludes dismissed actions', () => {
    dismissAction('rate_session', 'team-x');
    const actions = [buildRateSessionAction(sess()), buildDebriefAction(sess())];
    const result = filterUndismissedActions(actions, 'team-x');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ai_debrief');
  });

  it('returns empty when all dismissed', () => {
    dismissAction('rate_session', 'team-x');
    dismissAction('ai_debrief', 'team-x');
    const actions = [buildRateSessionAction(sess()), buildDebriefAction(sess())];
    expect(filterUndismissedActions(actions, 'team-x')).toHaveLength(0);
  });
});
