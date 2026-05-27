/**
 * Ticket 0043 AC11 — the parent-sharing email dispatcher reads plans.type
 * and routes to the right subject + body template. Per the ticket:
 *
 *   - 'parent_report'              → existing parentShareEmail (subject
 *                                    starts with "<Coach> shared <Player>'s
 *                                    progress card"). BYTE-IDENTICAL to the
 *                                    current shape so 0016/0034 don't
 *                                    regress.
 *   - 'mid_season_team_newsletter' → new midSeasonNewsletterEmail with
 *                                    subject "<TeamName> — mid-season
 *                                    update".
 *   - unknown plan type            → falls back to parentShareEmail (no
 *                                    regression on a future plan type).
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { buildParentShareEmail } from '@/lib/parent-share-dispatcher';
import { parentShareEmail } from '@/lib/email/templates';

describe('parent-share email dispatcher (ticket 0043)', () => {
  it('routes plans.type=parent_report to the existing parentShareEmail (subject byte-identical)', () => {
    const expected = parentShareEmail({
      parentName: 'Jamie',
      playerName: 'Marcus',
      coachName: 'Coach Rivera',
      shareUrl: 'https://app/share/abc',
      customMessage: null,
    });

    const dispatched = buildParentShareEmail({
      planType: 'parent_report',
      parentName: 'Jamie',
      playerName: 'Marcus',
      coachName: 'Coach Rivera',
      teamName: 'Tigers',
      shareUrl: 'https://app/share/abc',
      customMessage: null,
    });

    expect(dispatched.subject).toBe(expected.subject);
    // Subject still contains the per-player + per-coach attribution shape.
    expect(dispatched.subject).toMatch(/coach/i);
    expect(dispatched.subject).toMatch(/marcus/i);
  });

  it("routes plans.type=mid_season_team_newsletter to the new midSeasonNewsletterEmail with subject '<TeamName> — mid-season update'", () => {
    const built = buildParentShareEmail({
      planType: 'mid_season_team_newsletter',
      parentName: 'Jamie',
      coachName: 'Coach Rivera',
      teamName: 'Tigers',
      shareUrl: 'https://app/share/team-newsletter/xyz',
    });

    expect(built.subject).toBe('Tigers — mid-season update');
    // Body mentions the team name and is NOT the per-player progress card.
    expect(built.html).toContain('Tigers');
    expect(built.html).toContain('mid-season update');
    // Crucial COPPA / scope guard: the body does NOT name an individual
    // player (the dispatcher receives no per-player field on this branch).
    expect(built.html).not.toMatch(/marcus/i);
  });

  it('falls back to parentShareEmail on an unknown plan type (no regression on a future type)', () => {
    const dispatched = buildParentShareEmail({
      planType: 'practice' as never, // any non-newsletter plan type
      parentName: 'Jamie',
      playerName: 'Marcus',
      coachName: 'Coach Rivera',
      teamName: 'Tigers',
      shareUrl: 'https://app/share/abc',
      customMessage: null,
    });

    // It still produces a real BuiltEmail (never throws); the subject is the
    // existing parent-report shape.
    expect(dispatched.subject).toMatch(/coach/i);
    expect(dispatched.subject).toMatch(/marcus/i);
  });
});
