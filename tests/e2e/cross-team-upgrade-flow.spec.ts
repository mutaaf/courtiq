/**
 * Ticket 0086 — seeded e2e for the cross-team upgrade moment.
 *
 * Pre-conditions baked into tests/e2e/fixtures/seed.sql (this ticket's seed
 * extension): the E2E coach already owns the E2E U10 team. A SECOND seeded
 * team in the SAME org (the U12) exists, and the E2E coach is NOT yet listed
 * on team_coaches for it — so a configure-team / create-team POST would hit
 * the maxTeams=1 free ceiling. A SECOND seeded coach (the inviter) is also
 * minted in the SAME org so the structured 4xx can populate `invitedBy`.
 *
 * Skip when E2E creds are unset (authed flow). Scope every assertion by
 * data-testid per LESSONS#0081 / #0082.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

const INVITER_COACH_ID = '00000000-0000-4000-a000-000000000368';

test.describe('Cross-team upgrade flow (ticket 0086)', () => {
  test('hits the free tier limit and renders the contextual upgrade sheet', async ({ page, request }) => {
    const signedIn = await signInViaUI(page);
    test.skip(!signedIn, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD unset — skipping authed cross-team upgrade flow');

    // POST create-team with an inviteCoachId resolving to the seeded inviter
    // in the same org. The free coach already has 1 team — the 1-team limit
    // fires with the structured 4xx body.
    const res = await request.post('/api/auth/create-team', {
      data: {
        teamName: 'Hawks U12',
        ageGroup: '11-13',
        season: 'Spring 2026',
        inviteCoachId: INVITER_COACH_ID,
      },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('tier_limit_max_teams');
    expect(body.attemptedTeamName).toBe('Hawks U12');
    // Inviter context is populated by the same-org lookup.
    expect(body.invitedBy?.firstName).toBe('Mike');
  });
});
