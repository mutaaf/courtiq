/**
 * Ticket 0072 — pure helper for dormant-coach reactivation.
 *
 * Every case maps to one acceptance-criteria expectation in the ticket.
 * The helper is pure (no DB, no clock); the unit test pins the
 * dormant-threshold window via `nowMs` injection so a slow CI run never
 * drifts past the boundary (LESSONS#0087 — assertion-time clocks beat
 * module-load clocks).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  findDormantCoachesForReturningParent,
  hashParentEmail,
  isCoachDormant,
  type CoachFreshnessRow,
  type PriorPlayerRow,
} from '@/lib/coach-reactivation-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = Date.parse('2026-11-15T20:00:00Z'); // fall season, well-inside the bucket

function daysAgoIso(days: number): string {
  return new Date(NOW_MS - days * DAY_MS).toISOString();
}

const PARENT_EMAIL = 'linda@walker-family.test';
const HASH = createHash('sha256')
  .update(PARENT_EMAIL.toLowerCase())
  .digest('hex');

const SPRING_TEAM_ID = '00000000-0000-4000-a000-0000000000a1';
const FALL_TEAM_ID = '00000000-0000-4000-a000-0000000000a2';
const OTHER_TEAM_ID = '00000000-0000-4000-a000-0000000000a3';
const SPRING_COACH_ID = '00000000-0000-4000-a000-0000000000b1';
const FALL_COACH_ID = '00000000-0000-4000-a000-0000000000b2';
const OTHER_COACH_ID = '00000000-0000-4000-a000-0000000000b3';
const SPRING_PLAYER_ID = '00000000-0000-4000-a000-0000000000c1';
const OTHER_PLAYER_ID = '00000000-0000-4000-a000-0000000000c2';

const DORMANT_COACH: CoachFreshnessRow = {
  id: SPRING_COACH_ID,
  last_active_at: daysAgoIso(35), // 35 days quiet → dormant per the 30-day threshold
};
const ACTIVE_COACH: CoachFreshnessRow = {
  id: SPRING_COACH_ID,
  last_active_at: daysAgoIso(5),
};

const SPRING_PLAYER_LIAM: PriorPlayerRow = {
  id: SPRING_PLAYER_ID,
  team_id: SPRING_TEAM_ID,
  parent_email: PARENT_EMAIL,
  first_name: 'Liam',
  team_coach_id: SPRING_COACH_ID,
};

describe('hashParentEmail (ticket 0072)', () => {
  it('hashes the lowercased, trimmed email as SHA-256 hex', () => {
    expect(hashParentEmail(PARENT_EMAIL)).toBe(HASH);
  });

  it('is case- and whitespace-insensitive — the same email types two ways produces the same hash', () => {
    expect(hashParentEmail('  LINDA@Walker-Family.TEST  ')).toBe(HASH);
  });

  it('never returns the plaintext email — the output is a 64-char hex digest', () => {
    const out = hashParentEmail(PARENT_EMAIL);
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    expect(out).not.toContain('linda');
    expect(out).not.toContain('walker');
  });
});

describe('isCoachDormant (ticket 0072)', () => {
  it('is true when last_active_at is older than the 30-day threshold', () => {
    expect(isCoachDormant({ last_active_at: daysAgoIso(31) }, NOW_MS, 30)).toBe(true);
  });

  it('is false when last_active_at is within the threshold', () => {
    expect(isCoachDormant({ last_active_at: daysAgoIso(5) }, NOW_MS, 30)).toBe(false);
  });

  it('is false when last_active_at is null (conservative — never spam an unknown coach)', () => {
    expect(isCoachDormant({ last_active_at: null }, NOW_MS, 30)).toBe(false);
  });

  it('is false when last_active_at is unparseable', () => {
    expect(isCoachDormant({ last_active_at: 'not-a-date' }, NOW_MS, 30)).toBe(false);
  });
});

describe('findDormantCoachesForReturningParent (ticket 0072)', () => {
  it('returns empty when no prior-player rows are passed', () => {
    const out = findDormantCoachesForReturningParent({
      parentEmail: PARENT_EMAIL,
      currentTeamId: FALL_TEAM_ID,
      coachRows: [DORMANT_COACH],
      priorPlayerRows: [],
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('returns empty when the matched prior-player coach was active within the threshold (not dormant)', () => {
    const out = findDormantCoachesForReturningParent({
      parentEmail: PARENT_EMAIL,
      currentTeamId: FALL_TEAM_ID,
      coachRows: [ACTIVE_COACH],
      priorPlayerRows: [SPRING_PLAYER_LIAM],
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('returns one candidate when the prior coach is dormant 35 days and the parent matches', () => {
    const out = findDormantCoachesForReturningParent({
      parentEmail: PARENT_EMAIL,
      currentTeamId: FALL_TEAM_ID,
      coachRows: [DORMANT_COACH],
      priorPlayerRows: [SPRING_PLAYER_LIAM],
      nowMs: NOW_MS,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      dormantCoachId: SPRING_COACH_ID,
      priorTeamId: SPRING_TEAM_ID,
      priorPlayerId: SPRING_PLAYER_ID,
      priorPlayerFirstName: 'Liam',
      parentEmailHash: HASH,
    });
  });

  it('filters a prior player whose team_id IS the current team (same coach, same team — not cross-season)', () => {
    const sameTeamRow: PriorPlayerRow = { ...SPRING_PLAYER_LIAM, team_id: FALL_TEAM_ID };
    const out = findDormantCoachesForReturningParent({
      parentEmail: PARENT_EMAIL,
      currentTeamId: FALL_TEAM_ID,
      coachRows: [DORMANT_COACH],
      priorPlayerRows: [sameTeamRow],
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('filters a prior player whose parent_email is null', () => {
    const nullEmailRow: PriorPlayerRow = { ...SPRING_PLAYER_LIAM, parent_email: null };
    const out = findDormantCoachesForReturningParent({
      parentEmail: PARENT_EMAIL,
      currentTeamId: FALL_TEAM_ID,
      coachRows: [DORMANT_COACH],
      priorPlayerRows: [nullEmailRow],
      nowMs: NOW_MS,
    });
    expect(out).toEqual([]);
  });

  it('returns two candidates when two distinct prior coaches are both dormant', () => {
    const otherDormantCoach: CoachFreshnessRow = {
      id: OTHER_COACH_ID,
      last_active_at: daysAgoIso(60),
    };
    const otherRow: PriorPlayerRow = {
      id: OTHER_PLAYER_ID,
      team_id: OTHER_TEAM_ID,
      parent_email: PARENT_EMAIL,
      first_name: 'Maya',
      team_coach_id: OTHER_COACH_ID,
    };
    const out = findDormantCoachesForReturningParent({
      parentEmail: PARENT_EMAIL,
      currentTeamId: FALL_TEAM_ID,
      coachRows: [DORMANT_COACH, otherDormantCoach],
      priorPlayerRows: [SPRING_PLAYER_LIAM, otherRow],
      nowMs: NOW_MS,
    });
    expect(out).toHaveLength(2);
    const ids = out.map((c) => c.dormantCoachId).sort();
    expect(ids).toEqual([SPRING_COACH_ID, OTHER_COACH_ID].sort());
  });

  it('matches the parent email case-insensitively', () => {
    const out = findDormantCoachesForReturningParent({
      parentEmail: 'LINDA@Walker-Family.TEST',
      currentTeamId: FALL_TEAM_ID,
      coachRows: [DORMANT_COACH],
      priorPlayerRows: [SPRING_PLAYER_LIAM],
      nowMs: NOW_MS,
    });
    expect(out).toHaveLength(1);
    // Same hash either way — the helper normalizes before hashing.
    expect(out[0].parentEmailHash).toBe(HASH);
  });

  it('returns the SHA-256 hash of the lowercased email, never the plaintext', () => {
    const out = findDormantCoachesForReturningParent({
      parentEmail: PARENT_EMAIL,
      currentTeamId: FALL_TEAM_ID,
      coachRows: [DORMANT_COACH],
      priorPlayerRows: [SPRING_PLAYER_LIAM],
      nowMs: NOW_MS,
    });
    expect(out[0].parentEmailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out[0].parentEmailHash).not.toContain('linda');
    expect(out[0].parentEmailHash).not.toContain('walker');
  });
});
