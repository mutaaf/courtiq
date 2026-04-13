/**
 * Tests for the Player Achievement Badges feature.
 *
 * Covers:
 *  - BADGE_DEFS: contains exactly 10 badge definitions
 *  - BADGE_DEFS: every badge has badge_type, name, description, auto fields
 *  - BADGE_DEFS: 7 auto badges and 3 manual badges
 *  - AUTO_BADGE_TYPES: contains exactly the 7 expected auto types
 *  - MANUAL_BADGE_TYPES: contains exactly the 3 expected manual types
 *  - evaluateAutoBadges: no obs → no badges
 *  - evaluateAutoBadges: 1 positive obs → first_star
 *  - evaluateAutoBadges: 0 positive obs → no first_star
 *  - evaluateAutoBadges: 10 positive obs → team_player (+ first_star)
 *  - evaluateAutoBadges: 9 positive obs → no team_player
 *  - evaluateAutoBadges: 25 total obs → grinder
 *  - evaluateAutoBadges: 24 total obs → no grinder
 *  - evaluateAutoBadges: 4 unique categories → all_rounder
 *  - evaluateAutoBadges: 3 unique categories → no all_rounder
 *  - evaluateAutoBadges: game_ready proficiency → breakthrough
 *  - evaluateAutoBadges: no game_ready → no breakthrough
 *  - evaluateAutoBadges: 10+ sessions → session_regular
 *  - evaluateAutoBadges: 9 sessions → no session_regular
 *  - evaluateAutoBadges: game obs > 0 → game_changer
 *  - evaluateAutoBadges: game obs = 0 → no game_changer
 *  - evaluateAutoBadges: already earned badges are excluded
 *  - evaluateAutoBadges: all criteria met → returns all 7 auto badges
 */

import { describe, it, expect } from 'vitest';
import {
  BADGE_DEFS,
  AUTO_BADGE_TYPES,
  MANUAL_BADGE_TYPES,
  evaluateAutoBadges,
} from '@/lib/achievement-utils';
import type { ObsSummary, ProfSummary } from '@/lib/achievement-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeObs(sentiment: 'positive' | 'needs-work' | 'neutral', category = 'dribbling'): ObsSummary {
  return { sentiment, category };
}

function posObs(n: number, category = 'dribbling'): ObsSummary[] {
  return Array.from({ length: n }, () => makeObs('positive', category));
}

function totalObs(n: number): ObsSummary[] {
  return Array.from({ length: n }, (_, i) => makeObs('neutral', `cat-${i}`));
}

function obsWithCategories(cats: string[]): ObsSummary[] {
  return cats.map((c) => makeObs('positive', c));
}

const gameReady: ProfSummary = { proficiency_level: 'game_ready' };
const exploring: ProfSummary = { proficiency_level: 'exploring' };

const none = new Set<string>();

// ─── BADGE_DEFS ───────────────────────────────────────────────────────────────

describe('BADGE_DEFS', () => {
  it('contains exactly 10 badge definitions', () => {
    expect(BADGE_DEFS).toHaveLength(10);
  });

  it('every badge has badge_type, name, description, and auto fields', () => {
    for (const def of BADGE_DEFS) {
      expect(def.badge_type).toBeTruthy();
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(typeof def.auto).toBe('boolean');
    }
  });

  it('has 7 auto badges', () => {
    expect(BADGE_DEFS.filter((d) => d.auto)).toHaveLength(7);
  });

  it('has 3 manual badges', () => {
    expect(BADGE_DEFS.filter((d) => !d.auto)).toHaveLength(3);
  });
});

// ─── AUTO / MANUAL badge type lists ──────────────────────────────────────────

describe('AUTO_BADGE_TYPES', () => {
  it('contains exactly the 7 expected auto types', () => {
    expect(AUTO_BADGE_TYPES.sort()).toEqual(
      ['first_star', 'team_player', 'grinder', 'all_rounder', 'breakthrough', 'game_changer', 'session_regular'].sort(),
    );
  });
});

describe('MANUAL_BADGE_TYPES', () => {
  it('contains exactly the 3 expected manual types', () => {
    expect(MANUAL_BADGE_TYPES.sort()).toEqual(['coach_pick', 'most_improved', 'rising_star'].sort());
  });
});

// ─── evaluateAutoBadges ───────────────────────────────────────────────────────

describe('evaluateAutoBadges', () => {
  it('returns no badges when there are no observations', () => {
    expect(evaluateAutoBadges([], [], 0, 0, none)).toEqual([]);
  });

  it('awards first_star on 1 positive observation', () => {
    const result = evaluateAutoBadges(posObs(1), [], 0, 0, none);
    expect(result).toContain('first_star');
  });

  it('does not award first_star with 0 positive obs', () => {
    const result = evaluateAutoBadges([makeObs('needs-work')], [], 0, 0, none);
    expect(result).not.toContain('first_star');
  });

  it('awards team_player at 10 positive observations', () => {
    const result = evaluateAutoBadges(posObs(10), [], 0, 0, none);
    expect(result).toContain('team_player');
    expect(result).toContain('first_star');
  });

  it('does not award team_player at 9 positive observations', () => {
    const result = evaluateAutoBadges(posObs(9), [], 0, 0, none);
    expect(result).not.toContain('team_player');
  });

  it('awards grinder at 25 total observations', () => {
    const result = evaluateAutoBadges(totalObs(25), [], 0, 0, none);
    expect(result).toContain('grinder');
  });

  it('does not award grinder at 24 total observations', () => {
    const result = evaluateAutoBadges(totalObs(24), [], 0, 0, none);
    expect(result).not.toContain('grinder');
  });

  it('awards all_rounder at 4 unique categories', () => {
    const obs = obsWithCategories(['passing', 'dribbling', 'shooting', 'defense']);
    const result = evaluateAutoBadges(obs, [], 0, 0, none);
    expect(result).toContain('all_rounder');
  });

  it('does not award all_rounder at 3 unique categories', () => {
    const obs = obsWithCategories(['passing', 'dribbling', 'shooting']);
    const result = evaluateAutoBadges(obs, [], 0, 0, none);
    expect(result).not.toContain('all_rounder');
  });

  it('awards breakthrough when any proficiency is game_ready', () => {
    const result = evaluateAutoBadges(posObs(1), [exploring, gameReady], 0, 0, none);
    expect(result).toContain('breakthrough');
  });

  it('does not award breakthrough when no proficiency is game_ready', () => {
    const result = evaluateAutoBadges(posObs(1), [exploring], 0, 0, none);
    expect(result).not.toContain('breakthrough');
  });

  it('awards session_regular at 10 sessions', () => {
    const result = evaluateAutoBadges(posObs(1), [], 10, 0, none);
    expect(result).toContain('session_regular');
  });

  it('does not award session_regular at 9 sessions', () => {
    const result = evaluateAutoBadges(posObs(1), [], 9, 0, none);
    expect(result).not.toContain('session_regular');
  });

  it('awards game_changer when game obs count > 0', () => {
    const result = evaluateAutoBadges(posObs(1), [], 0, 1, none);
    expect(result).toContain('game_changer');
  });

  it('does not award game_changer when game obs count = 0', () => {
    const result = evaluateAutoBadges(posObs(1), [], 0, 0, none);
    expect(result).not.toContain('game_changer');
  });

  it('excludes already-earned badges', () => {
    const earned = new Set(['first_star', 'team_player']);
    const result = evaluateAutoBadges(posObs(10), [], 0, 0, earned);
    expect(result).not.toContain('first_star');
    expect(result).not.toContain('team_player');
  });

  it('returns all 7 auto badges when every criterion is met', () => {
    const obs = [
      ...posObs(10, 'passing'),
      ...totalObs(15).map((o) => ({ ...o, category: ['dribbling', 'shooting', 'defense'][Math.floor(Math.random() * 3)] })),
    ];
    // Ensure 25 total, 10 positive, 4 categories
    const finalObs: ObsSummary[] = [
      ...posObs(10, 'passing'),
      makeObs('neutral', 'dribbling'),
      makeObs('neutral', 'shooting'),
      makeObs('neutral', 'defense'),
      ...Array.from({ length: 22 }, () => makeObs('neutral', 'footwork')),
    ];
    const result = evaluateAutoBadges(finalObs, [gameReady], 10, 1, none);
    expect(result.sort()).toEqual(AUTO_BADGE_TYPES.sort());
  });
});
