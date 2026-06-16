/**
 * Ticket 0086 — extension of the 0035 resume primitive with a new `join_team`
 * kind, used by the cross-team upgrade moment.
 *
 * After a free coach hits the 1-team limit on a second team, the contextual
 * sheet routes them to /settings/upgrade?resume=join_team:<teamId>. After
 * Stripe flips them to Coach tier, the settings/upgrade resume handler reads
 * the parsed target and finishes the originally-blocked join.
 *
 * These specs mirror the existing resume-target.test.ts shape (closed enum,
 * UUID + owned-team validation, malformed input → null, in-app dashboard
 * path only — never a foreign URL).
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import {
  parseResumeTarget,
  buildResumePath,
  RESUME_KINDS,
} from '@/lib/resume-target';

const TEAM_A = '00000000-0000-4000-a000-000000000020';
const TEAM_B = '00000000-0000-4000-a000-000000000021';
const FOREIGN_TEAM = '11111111-1111-4111-a111-111111111111';

const OWNED_TEAMS = [TEAM_A, TEAM_B];

describe('parseResumeTarget — join_team kind (ticket 0086)', () => {
  it('exposes join_team alongside the existing closed allow-list', () => {
    expect(RESUME_KINDS).toContain('join_team');
    // Sanity: the existing 0035 kinds are still in the set (byte-identical).
    for (const kind of [
      'parent_report',
      'practice_plan',
      'weekly_star',
      'game_recap',
      'session_debrief',
    ]) {
      expect(RESUME_KINDS).toContain(kind);
    }
  });

  it('parses a team-scoped join_team target (no player segment)', () => {
    const t = parseResumeTarget(`join_team:${TEAM_A}`, OWNED_TEAMS, []);
    expect(t).not.toBeNull();
    expect(t!.kind).toBe('join_team');
    expect(t!.teamId).toBe(TEAM_A);
    expect(t!.playerId).toBeUndefined();
  });

  it('rejects a join_team target with a trailing player segment (team-scoped only)', () => {
    expect(
      parseResumeTarget(`join_team:${TEAM_A}:00000000-0000-4000-a000-000000000031`, OWNED_TEAMS, []),
    ).toBeNull();
  });

  it('rejects a malformed UUID on the team segment', () => {
    expect(parseResumeTarget('join_team:not-a-uuid', ['not-a-uuid'], [])).toBeNull();
    expect(parseResumeTarget('join_team:12345', ['12345'], [])).toBeNull();
  });

  it('rejects a cross-org teamId not in the caller\'s owned set', () => {
    expect(parseResumeTarget(`join_team:${FOREIGN_TEAM}`, OWNED_TEAMS, [])).toBeNull();
  });

  it('rejects empty / nullish input the way every other kind does', () => {
    expect(parseResumeTarget('', OWNED_TEAMS, [])).toBeNull();
    expect(parseResumeTarget(null, OWNED_TEAMS, [])).toBeNull();
    expect(parseResumeTarget(undefined, OWNED_TEAMS, [])).toBeNull();
  });
});

describe('buildResumePath — join_team routes to the team home (ticket 0086)', () => {
  it('routes a validated join_team target to /team/<teamId>', () => {
    const t = parseResumeTarget(`join_team:${TEAM_A}`, OWNED_TEAMS, [])!;
    const path = buildResumePath(t);
    expect(path).toBe(`/team/${TEAM_A}`);
  });

  it('always returns an in-app dashboard path (never a protocol-relative or absolute URL)', () => {
    const t = parseResumeTarget(`join_team:${TEAM_B}`, OWNED_TEAMS, [])!;
    const path = buildResumePath(t);
    expect(path.startsWith('/')).toBe(true);
    expect(path.startsWith('//')).toBe(false);
    expect(/^https?:/i.test(path)).toBe(false);
  });
});
