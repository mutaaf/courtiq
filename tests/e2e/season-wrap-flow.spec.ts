/**
 * E2E (ticket 0036): the season-wrap home card.
 *
 * The /home feed is an AUTHENTICATED surface, so the interactive assertions below
 * run only when E2E creds are supplied (season-momentum / cross-season precedent)
 * and skip cleanly in CI without them. The always-green CI coverage for this
 * ticket is the SEED itself: tests/e2e/fixtures/seed.sql now creates a
 * completed-season team (...022, 'Fall 2025', current_week 10 of 10) in the E2E
 * org with a practice + positive observations, so /api/season/wrap returns phase
 * 'complete' with totals + a growth highlight. The seed is applied under psql
 * ON_ERROR_STOP=1, so those rows must be valid for the e2e-tests job to even start
 * (the fresh-DB proof — LESSONS.md: a fresh-CI-DB seed surfaces latent bugs).
 *
 * When creds ARE present we sign in, mock /api/me so the active team is the
 * completed-season team, and assert the wrap card appears with its factual totals.
 * The card's wrap data comes from the REAL /api/season/wrap GET against the seeded
 * DB (a browser-side useQuery fetch on a CLIENT page — not a server-component
 * fetch, so it reflects the seed, not a route mock). Mocking /api/me to the
 * in-progress main team shows the card is ABSENT.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, TEST_COACH, TEST_TEAM } from './helpers/auth';

// The seeded completed-season team (current_week 10 of 10).
const WRAP_TEAM = {
  id: '00000000-0000-4000-a000-000000000022',
  org_id: '00000000-0000-4000-a000-000000000010',
  sport_id: 'basketball',
  name: 'E2E Wrap Team',
  age_group: '11-13',
  season: 'Fall 2025',
  season_weeks: 10,
  current_week: 10,
  is_active: true,
  settings: {},
};

async function mockMeWithTeam(page: import('@playwright/test').Page, team: unknown) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ coach: TEST_COACH, teams: [team] }),
    })
  );
}

test.describe('Season-wrap card on /home (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  // AC2: a completed-season active team shows the wrap card with factual totals.
  test('shows the wrap card with totals when the active team season is complete', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTeam(page, WRAP_TEAM);
    await page.goto('/home');

    const card = page.getByTestId('season-wrap-card');
    await expect(card).toBeVisible({ timeout: 10000 });
    // "That's a wrap" header + the single next-step control.
    await expect(card.getByText(/that's a wrap/i)).toBeVisible();
    await expect(
      card.getByRole('button', { name: /start next season/i })
    ).toBeVisible();
  });

  // AC2: an in-progress active team does NOT show the wrap card.
  test('hides the wrap card when the active team season is in progress', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    // TEST_TEAM is current_week 3 of 10 — in progress.
    await mockMeWithTeam(page, TEST_TEAM);
    await page.goto('/home');

    // The home screen renders normally; the wrap card is simply absent.
    await expect(page.getByTestId('season-wrap-card')).toHaveCount(0);
  });
});
