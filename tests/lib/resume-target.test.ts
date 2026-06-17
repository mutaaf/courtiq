/**
 * Ticket 0035 — pure parser for the quota-wall "resume after upgrade" token.
 *
 * `parseResumeTarget` is the unit-testable core (cf. 0013's `buildShareMetadata`).
 * It takes the opaque `resume` string the client passes through the upgrade
 * round-trip (`{action}:{teamId}[:{playerId}]`) plus the upgraded coach's OWNED
 * team / player ids, and returns a validated `{ kind, teamId, playerId? }` target
 * or `null`. `buildResumePath` turns a validated target into the dashboard URL.
 *
 * These specs map 1:1 to the ticket's acceptance criteria around resume parsing:
 *  - the `{action}` kind must be one of a fixed closed allow-list — an unknown
 *    action can NEVER route (AC: validated server-side, fixed allow-list);
 *  - every id segment must be a UUID (AC: UUID id validation);
 *  - any id not in the caller's owned set is a cross-org id → `null`, so the
 *    coach lands on `/home`, never another org's player (AC: cross-org rejection
 *    reads no foreign rows — the parser refuses to build a path at all);
 *  - malformed input → `null` (AC: malformed → ignored);
 *  - COPPA: the parser accepts ONLY owned-UUID ids and exposes nothing beyond the
 *    ids the coach already owns (AC: carries only owned ids, no new player field).
 *
 * Filename is `.test.ts` (NOT `.spec.ts`, which vitest.config excludes — the spec
 * glob is reserved for Playwright; see docs/LESSONS.md 2026-05-20).
 */
import { describe, it, expect } from 'vitest';
import {
  parseResumeTarget,
  buildResumePath,
  RESUME_KINDS,
  type ResumeKind,
} from '@/lib/resume-target';

// Valid v4-shaped UUIDs the caller "owns".
const TEAM_A = '00000000-0000-4000-a000-000000000020';
const PLAYER_A = '00000000-0000-4000-a000-000000000030';
// An id NOT in the owned sets → must be treated as cross-org.
const FOREIGN_TEAM = '11111111-1111-4111-a111-111111111111';
const FOREIGN_PLAYER = '22222222-2222-4222-a222-222222222222';

const OWNED_TEAMS = [TEAM_A];
const OWNED_PLAYERS = [PLAYER_A];

describe('parseResumeTarget — allow-list of action kinds (ticket 0035)', () => {
  it('exposes the closed action kinds (the original five plus 0086\'s join_team plus 0087\'s adopt_org_tier)', () => {
    // Ticket 0086 additively widened the enum with `join_team` (LESSONS#0103);
    // ticket 0087 added `adopt_org_tier` for the director-tier upgrade moment.
    // Every existing kind stays byte-identical and each new kind rides through
    // the same UUID + ownership validation as its siblings.
    expect([...RESUME_KINDS].sort()).toEqual(
      [
        'adopt_org_tier',
        'game_recap',
        'join_team',
        'parent_report',
        'practice_plan',
        'session_debrief',
        'weekly_star',
      ].sort()
    );
  });

  it('parses a parent_report target (team + owned player)', () => {
    const t = parseResumeTarget(
      `parent_report:${TEAM_A}:${PLAYER_A}`,
      OWNED_TEAMS,
      OWNED_PLAYERS
    );
    expect(t).not.toBeNull();
    expect(t!.kind).toBe('parent_report');
    expect(t!.teamId).toBe(TEAM_A);
    expect(t!.playerId).toBe(PLAYER_A);
  });

  it('parses a team-scoped practice_plan target (no player segment)', () => {
    const t = parseResumeTarget(`practice_plan:${TEAM_A}`, OWNED_TEAMS, OWNED_PLAYERS);
    expect(t).not.toBeNull();
    expect(t!.kind).toBe('practice_plan');
    expect(t!.teamId).toBe(TEAM_A);
    expect(t!.playerId).toBeUndefined();
  });

  it('parses the team-scoped session-debrief / weekly-star / game-recap kinds', () => {
    for (const kind of ['session_debrief', 'weekly_star', 'game_recap'] as ResumeKind[]) {
      const t = parseResumeTarget(`${kind}:${TEAM_A}`, OWNED_TEAMS, OWNED_PLAYERS);
      expect(t, kind).not.toBeNull();
      expect(t!.kind).toBe(kind);
      expect(t!.teamId).toBe(TEAM_A);
    }
  });

  it('rejects an action kind outside the allow-list (unknown action never routes)', () => {
    expect(parseResumeTarget(`steal_data:${TEAM_A}`, OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
    expect(parseResumeTarget(`PARENT_REPORT:${TEAM_A}`, OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
    expect(parseResumeTarget(`../../etc/passwd:${TEAM_A}`, OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
  });
});

describe('parseResumeTarget — UUID id validation (ticket 0035)', () => {
  it('rejects a non-UUID team segment', () => {
    expect(parseResumeTarget('parent_report:not-a-uuid:also-bad', OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
    expect(parseResumeTarget('practice_plan:12345', ['12345'], OWNED_PLAYERS)).toBeNull();
  });

  it('rejects a non-UUID player segment even when the team is valid + owned', () => {
    expect(
      parseResumeTarget(`parent_report:${TEAM_A}:not-a-uuid`, OWNED_TEAMS, ['not-a-uuid'])
    ).toBeNull();
  });

  it('rejects a path-traversal / injection attempt in an id segment', () => {
    expect(
      parseResumeTarget(`parent_report:${TEAM_A}:../../home`, OWNED_TEAMS, ['../../home'])
    ).toBeNull();
  });
});

describe('parseResumeTarget — cross-org ownership rejection (ticket 0035)', () => {
  it('returns null for a teamId the caller does not own (cross-org)', () => {
    expect(
      parseResumeTarget(`practice_plan:${FOREIGN_TEAM}`, OWNED_TEAMS, OWNED_PLAYERS)
    ).toBeNull();
  });

  it('returns null for a playerId the caller does not own (cross-org)', () => {
    expect(
      parseResumeTarget(`parent_report:${TEAM_A}:${FOREIGN_PLAYER}`, OWNED_TEAMS, OWNED_PLAYERS)
    ).toBeNull();
  });

  it('returns null when BOTH ids are foreign', () => {
    expect(
      parseResumeTarget(`parent_report:${FOREIGN_TEAM}:${FOREIGN_PLAYER}`, OWNED_TEAMS, OWNED_PLAYERS)
    ).toBeNull();
  });

  it('returns null when the coach owns NOTHING (empty owned sets)', () => {
    expect(parseResumeTarget(`parent_report:${TEAM_A}:${PLAYER_A}`, [], [])).toBeNull();
    expect(parseResumeTarget(`practice_plan:${TEAM_A}`, [], [])).toBeNull();
  });
});

describe('parseResumeTarget — malformed input → null (ticket 0035)', () => {
  it('returns null for empty / nullish / whitespace input', () => {
    expect(parseResumeTarget('', OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
    expect(parseResumeTarget(null, OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
    expect(parseResumeTarget(undefined, OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
    expect(parseResumeTarget('   ', OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
  });

  it('returns null for a kind with no id segment at all', () => {
    expect(parseResumeTarget('parent_report', OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
    expect(parseResumeTarget('practice_plan:', OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
  });

  it('returns null for too many segments', () => {
    expect(
      parseResumeTarget(`parent_report:${TEAM_A}:${PLAYER_A}:extra`, OWNED_TEAMS, OWNED_PLAYERS)
    ).toBeNull();
  });

  it('returns null for a player-scoped kind missing its player segment', () => {
    // parent_report requires BOTH a team and a player segment.
    expect(parseResumeTarget(`parent_report:${TEAM_A}`, OWNED_TEAMS, OWNED_PLAYERS)).toBeNull();
  });

  it('returns null for a team-scoped kind given an extra player segment', () => {
    // practice_plan is team-scoped — a trailing player segment is malformed.
    expect(
      parseResumeTarget(`practice_plan:${TEAM_A}:${PLAYER_A}`, OWNED_TEAMS, OWNED_PLAYERS)
    ).toBeNull();
  });
});

describe('buildResumePath — validated target → dashboard URL (ticket 0035)', () => {
  it('routes parent_report to the player roster surface with the player pre-selected', () => {
    const t = parseResumeTarget(`parent_report:${TEAM_A}:${PLAYER_A}`, OWNED_TEAMS, OWNED_PLAYERS)!;
    const path = buildResumePath(t);
    // Lands on the player's surface (the parent report knows the playerId).
    expect(path).toContain(`/roster/${PLAYER_A}`);
    expect(path.startsWith('/')).toBe(true);
  });

  it('routes practice_plan to the plans surface for the team', () => {
    const t = parseResumeTarget(`practice_plan:${TEAM_A}`, OWNED_TEAMS, OWNED_PLAYERS)!;
    const path = buildResumePath(t);
    expect(path).toContain('/plans');
    expect(path).toContain(TEAM_A);
  });

  it('always returns an in-app dashboard path, never an absolute/foreign URL', () => {
    for (const raw of [
      `parent_report:${TEAM_A}:${PLAYER_A}`,
      `practice_plan:${TEAM_A}`,
      `weekly_star:${TEAM_A}`,
      `game_recap:${TEAM_A}`,
      `session_debrief:${TEAM_A}`,
    ]) {
      const t = parseResumeTarget(raw, OWNED_TEAMS, OWNED_PLAYERS)!;
      const path = buildResumePath(t);
      expect(path.startsWith('/'), raw).toBe(true);
      // Never a protocol-relative or absolute external URL (open-redirect guard).
      expect(path.startsWith('//'), raw).toBe(false);
      expect(/^https?:/i.test(path), raw).toBe(false);
    }
  });
});
