/**
 * E2E (ticket 0034): the cross-season player-development link.
 *
 * The roster player page is an AUTHENTICATED surface, so the interactive
 * assertions below run only when E2E creds are supplied (coach-card-flow
 * precedent) and skip cleanly in CI without them. The always-green CI coverage
 * for this ticket is the SEED itself: tests/e2e/fixtures/seed.sql now creates a
 * prior-season team (Spring 2025) in the same org, Alice's prior-season players
 * row (...032), a prior-season parent_report plan, and links the current-season
 * Alice (...030) to that prior row via prior_player_id. That seed is applied
 * under psql ON_ERROR_STOP=1, so the migration + link rows must be valid for the
 * e2e-tests job to even start — which is the real fresh-DB proof the column and
 * link work (LESSONS.md: a fresh-CI-DB seed surfaces latent migration bugs).
 *
 * When creds ARE present, we sign in, open Alice's roster page, and assert the
 * "Did you coach this player last season?" control shows the link as established
 * (resolved from the seeded prior_player_id), proving the control reflects the
 * server-scoped state.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint } from './helpers/auth';

// Current-season Alice — the seeded player linked to her prior-season self.
const ALICE_PLAYER_ID = '00000000-0000-4000-a000-000000000030';

test.describe('Cross-season link on the roster player page (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  // AC6: the roster "Did you coach this player last season?" control is present,
  // and for a player with a seeded prior_player_id it reflects the established
  // link (the link state comes from the server, not the client guessing).
  test('shows the cross-season link control reflecting the seeded prior link', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);

    await page.goto(`/roster/${ALICE_PLAYER_ID}`);

    // The cross-season control prompt is on the overview tab.
    const prompt = page.getByText(/did you coach this player last season/i);
    await expect(prompt).toBeVisible({ timeout: 10000 });

    // Alice (...030) is seeded with a prior_player_id, so the control shows the
    // established link with a "Remove link" affordance rather than the candidate list.
    await expect(
      page.getByRole('button', { name: /remove link/i })
    ).toBeVisible();
  });
});
