/**
 * Ticket 0087 — additive widening of the 0035 resume primitive with a new
 * `adopt_org_tier` kind, used by the program-org-tier upgrade moment.
 *
 * After a director taps "Upgrade to Organization" on the preview overlay,
 * Stripe redirects back to /settings/upgrade?resume=adopt_org_tier:<orgId>.
 * The settings/upgrade resume handler reads the parsed target and drops the
 * now-Organization-tier director on the admin home with a small success
 * banner.
 *
 * The kind is ORG-scoped (it carries an orgId, not a teamId/playerId), so
 * the parser threads it through the existing closed-allow-list path with a
 * minor convention: the `teamId` slot on `ResumeTarget` carries the orgId
 * (mirrors how the 0086 `join_team` kind reuses the teamId slot for the
 * team being joined — additive widening per LESSONS#0103).
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import {
  parseResumeTarget,
  buildResumePath,
  RESUME_KINDS,
} from '@/lib/resume-target';

const ORG_A = '00000000-0000-4000-a000-000000000110';
const ORG_B = '00000000-0000-4000-a000-000000000010';
const FOREIGN_ORG = '22222222-2222-4222-a222-222222222222';

const OWNED_ORGS = [ORG_A, ORG_B];

describe('parseResumeTarget — adopt_org_tier kind (ticket 0087)', () => {
  it('exposes adopt_org_tier alongside the existing closed allow-list', () => {
    expect(RESUME_KINDS).toContain('adopt_org_tier');
    // Sanity: the existing 0035 + 0086 kinds are still in the set
    // (additive widening per LESSONS#0103).
    for (const kind of [
      'parent_report',
      'practice_plan',
      'weekly_star',
      'game_recap',
      'session_debrief',
      'join_team',
    ]) {
      expect(RESUME_KINDS).toContain(kind);
    }
  });

  it('parses an org-scoped adopt_org_tier target (no player segment)', () => {
    const t = parseResumeTarget(`adopt_org_tier:${ORG_A}`, OWNED_ORGS, []);
    expect(t).not.toBeNull();
    expect(t!.kind).toBe('adopt_org_tier');
    // The teamId slot on ResumeTarget carries the orgId (mirrors how
    // 0086 `join_team` reuses the same slot for the team being joined).
    expect(t!.teamId).toBe(ORG_A);
    expect(t!.playerId).toBeUndefined();
  });

  it('rejects an adopt_org_tier target with a trailing player segment (org-scoped only)', () => {
    expect(
      parseResumeTarget(
        `adopt_org_tier:${ORG_A}:00000000-0000-4000-a000-000000000031`,
        OWNED_ORGS,
        [],
      ),
    ).toBeNull();
  });

  it('rejects a malformed UUID on the org segment', () => {
    expect(parseResumeTarget('adopt_org_tier:not-a-uuid', ['not-a-uuid'], [])).toBeNull();
    expect(parseResumeTarget('adopt_org_tier:12345', ['12345'], [])).toBeNull();
  });

  it('rejects a foreign / unowned orgId not in the caller\'s owned set', () => {
    expect(parseResumeTarget(`adopt_org_tier:${FOREIGN_ORG}`, OWNED_ORGS, [])).toBeNull();
  });

  it('rejects empty / nullish input the way every other kind does', () => {
    expect(parseResumeTarget('', OWNED_ORGS, [])).toBeNull();
    expect(parseResumeTarget(null, OWNED_ORGS, [])).toBeNull();
    expect(parseResumeTarget(undefined, OWNED_ORGS, [])).toBeNull();
  });
});

describe('buildResumePath — adopt_org_tier routes to /admin (ticket 0087)', () => {
  it('routes a validated adopt_org_tier target to /admin (the director home)', () => {
    const t = parseResumeTarget(`adopt_org_tier:${ORG_A}`, OWNED_ORGS, [])!;
    const path = buildResumePath(t);
    expect(path).toBe('/admin?resume=adopt_org_tier');
  });

  it('always returns an in-app dashboard path (never a protocol-relative or absolute URL)', () => {
    const t = parseResumeTarget(`adopt_org_tier:${ORG_B}`, OWNED_ORGS, [])!;
    const path = buildResumePath(t);
    expect(path.startsWith('/')).toBe(true);
    expect(path.startsWith('//')).toBe(false);
    expect(/^https?:/i.test(path)).toBe(false);
  });
});
