/**
 * Ticket 0036 — pure season-wrap helpers.
 *
 * AC1: `getSeasonPhase(team, practiceCount)` decides "season complete" from team
 *   fields alone — no DB, no AI:
 *     season_weeks set AND current_week >= season_weeks  → 'complete'
 *     season_weeks null (open-ended team)                → 'in_progress'
 *     current_week < season_weeks                        → 'in_progress'
 *     zero practices logged                              → 'not_started'
 *
 * AC2 (data side): `buildSeasonWrap(sessions, observations, players)` returns the
 *   factual totals (weeks coached, practice count, players observed) and ONE
 *   growth highlight, all derived deterministically from already-collected rows.
 *   No AI — the highlight is computed from observation counts (the ticket's
 *   default pure-helper path, so a free coach's quota is never spent).
 *
 * .test.ts NOT .spec.ts — vitest excludes the spec glob (LESSONS.md 2026-05-20).
 */
import { describe, it, expect } from 'vitest';
import {
  getSeasonPhase,
  buildSeasonWrap,
  type WrapTeam,
  type WrapSession,
  type WrapObservation,
  type WrapPlayer,
} from '@/lib/season-wrap-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function team(overrides: Partial<WrapTeam> = {}): WrapTeam {
  return {
    season: 'Spring 2026',
    season_weeks: 10,
    current_week: 10,
    ...overrides,
  };
}

const PLAYERS: WrapPlayer[] = [
  { id: 'p1', name: 'Devon Hayes' },
  { id: 'p2', name: 'Maya Johnson' },
  { id: 'p3', name: 'Sam Lee' },
];

function obs(overrides: Partial<WrapObservation> = {}): WrapObservation {
  return {
    player_id: 'p1',
    category: 'Defense',
    sentiment: 'positive',
    created_at: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

const SESSIONS: WrapSession[] = [
  { id: 's1', type: 'practice', date: '2026-03-01' },
  { id: 's2', type: 'practice', date: '2026-03-08' },
  { id: 's3', type: 'game', date: '2026-03-09' },
];

// ─── AC1: getSeasonPhase ─────────────────────────────────────────────────────────

describe('getSeasonPhase (ticket 0036)', () => {
  it("returns 'complete' when season_weeks is set and current_week >= season_weeks", () => {
    expect(getSeasonPhase(team({ season_weeks: 10, current_week: 10 }), 5)).toBe('complete');
    // strictly greater also counts as complete (never reports past-the-end as in progress)
    expect(getSeasonPhase(team({ season_weeks: 10, current_week: 12 }), 5)).toBe('complete');
  });

  it("returns 'in_progress' when current_week < season_weeks", () => {
    expect(getSeasonPhase(team({ season_weeks: 10, current_week: 4 }), 5)).toBe('in_progress');
    expect(getSeasonPhase(team({ season_weeks: 10, current_week: 9 }), 5)).toBe('in_progress');
  });

  it("returns 'in_progress' for an open-ended team (no season_weeks) that has practices", () => {
    expect(getSeasonPhase(team({ season_weeks: null, current_week: 8 }), 5)).toBe('in_progress');
  });

  it("returns 'not_started' when zero practices are logged, regardless of week fields", () => {
    expect(getSeasonPhase(team({ season_weeks: 10, current_week: 10 }), 0)).toBe('not_started');
    expect(getSeasonPhase(team({ season_weeks: null, current_week: 1 }), 0)).toBe('not_started');
  });
});

// ─── AC2 (data): buildSeasonWrap ─────────────────────────────────────────────────

describe('buildSeasonWrap (ticket 0036)', () => {
  it('reports factual totals: weeks coached, practice count, players observed', () => {
    const wrap = buildSeasonWrap(team({ season_weeks: 10, current_week: 10 }), SESSIONS, [obs(), obs({ player_id: 'p2' })], PLAYERS);
    // weeks coached comes from the team's season position (current_week, capped at season_weeks)
    expect(wrap.weeksCoached).toBe(10);
    // only practice-type sessions are counted as "practices"
    expect(wrap.practiceCount).toBe(2);
    // unique players that have at least one observation
    expect(wrap.playersObserved).toBe(2);
  });

  it('caps weeks coached at season_weeks when current_week overran', () => {
    const wrap = buildSeasonWrap(team({ season_weeks: 10, current_week: 13 }), SESSIONS, [obs()], PLAYERS);
    expect(wrap.weeksCoached).toBe(10);
  });

  it('falls back to current_week for weeks coached when there is no season length', () => {
    const wrap = buildSeasonWrap(team({ season_weeks: null, current_week: 7 }), SESSIONS, [obs()], PLAYERS);
    expect(wrap.weeksCoached).toBe(7);
  });

  it('derives the growth highlight deterministically from observation counts — no AI', () => {
    // Devon (p1) has the most positive observations → the highlight names Devon
    // and the category they progressed most in. Pure count math, no model call.
    const observations: WrapObservation[] = [
      obs({ player_id: 'p1', category: 'Defense', sentiment: 'positive' }),
      obs({ player_id: 'p1', category: 'Defense', sentiment: 'positive' }),
      obs({ player_id: 'p1', category: 'Defense', sentiment: 'positive' }),
      obs({ player_id: 'p2', category: 'Passing', sentiment: 'positive' }),
    ];
    const wrap = buildSeasonWrap(team(), SESSIONS, observations, PLAYERS);
    expect(wrap.highlight).toBeTruthy();
    expect(wrap.highlight).toContain('Devon');
    expect(wrap.highlight!.toLowerCase()).toContain('defense');
  });

  it('returns a null highlight (not an error) when there are no positive observations', () => {
    const wrap = buildSeasonWrap(team(), SESSIONS, [obs({ sentiment: 'needs-work' })], PLAYERS);
    expect(wrap.highlight).toBeNull();
  });

  it('returns zeroed totals and a null highlight when there is no data at all', () => {
    const wrap = buildSeasonWrap(team({ season_weeks: 10, current_week: 10 }), [], [], PLAYERS);
    expect(wrap.practiceCount).toBe(0);
    expect(wrap.playersObserved).toBe(0);
    expect(wrap.highlight).toBeNull();
  });

  it('the highlight is clipboard voice — no banned hype words', () => {
    const wrap = buildSeasonWrap(team(), SESSIONS, [obs(), obs(), obs()], PLAYERS);
    const text = (wrap.highlight ?? '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(text).not.toContain(banned);
    }
  });

  it('counts only positive observations toward the growth highlight (needs-work is excluded)', () => {
    // p2 has 3 needs-work obs (most total) but p1 has 2 positive — the highlight
    // names p1 because growth is measured by POSITIVE progress markers, not volume.
    const observations: WrapObservation[] = [
      obs({ player_id: 'p2', category: 'Defense', sentiment: 'needs-work' }),
      obs({ player_id: 'p2', category: 'Defense', sentiment: 'needs-work' }),
      obs({ player_id: 'p2', category: 'Defense', sentiment: 'needs-work' }),
      obs({ player_id: 'p1', category: 'Passing', sentiment: 'positive' }),
      obs({ player_id: 'p1', category: 'Passing', sentiment: 'positive' }),
    ];
    const wrap = buildSeasonWrap(team(), SESSIONS, observations, PLAYERS);
    expect(wrap.highlight).toContain('Devon');
  });
});
