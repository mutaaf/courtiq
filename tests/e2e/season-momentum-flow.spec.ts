/**
 * E2E: the coach-private season-momentum card on /home (ticket 0032).
 *
 * Follows the weekly-digest-flow.spec.ts convention:
 *  - /home is a middleware-protected route — without real auth cookies it
 *    redirects to /login, so these specs sign in via the UI and test.skip() when
 *    E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (the PR-gating CI runner).
 *  - We mock GET /api/analytics/season-momentum (and /api/me, /api/data) so the
 *    page renders deterministically without depending on a live read. The endpoint
 *    is server-backed; the CI-gating proof for the card's UI states is the
 *    component vitest suite (tests/components/season-momentum-card.test.tsx) + the
 *    route suite (tests/analytics/season-momentum.test.ts). This spec guards the
 *    live page wiring (the real useQuery → GET and the free-tier UpgradeGate)
 *    whenever creds are supplied. The seed (tests/e2e/fixtures/seed.sql) already
 *    gives the E2E team season_weeks=10 / current_week=3 + observations, so the
 *    un-mocked endpoint also resolves.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH, TEST_TEAM } from './helpers/auth';

const CARD = '[data-testid="season-momentum-card"]';

/** The real GET /api/analytics/season-momentum shape. */
const SEEDED_MOMENTUM = {
  weekPosition: 6,
  weekTotal: 12,
  weeksActive: 6,
  trend: { positiveCount: 23, totalCount: 30 },
};

async function mockMomentumEndpoint(
  page: import('@playwright/test').Page,
  payload: unknown,
  status = 200,
) {
  await page.route('**/api/analytics/season-momentum*', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
  );
}

async function mockMeWithTier(page: import('@playwright/test').Page, tier: string) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coach: { ...TEST_COACH, organizations: { id: TEST_COACH.org_id, tier } },
        teams: [TEST_TEAM],
      }),
    })
  );
}

test.describe('Season-momentum card on /home (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockDataEndpoint(page, {});
  });

  // AC (Playwright): a coach-tier coach whose team has a season set + observations
  // sees the card with a "Week N of M" label and a progress element.
  test('a coach-tier coach sees the season card with "Week N of M" and a progress element', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'coach');
    await mockMomentumEndpoint(page, SEEDED_MOMENTUM);

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Week 6 of 12/i);
    await expect(card.locator('[role="progressbar"]')).toBeVisible();
  });

  // AC (Playwright): a free-tier coach sees an UpgradeGate prompt for the card,
  // not the card itself.
  test('a free-tier coach sees the upgrade prompt for the season card, not the card', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'free');
    // Even if the endpoint would return data, the free coach never sees the card.
    await mockMomentumEndpoint(page, SEEDED_MOMENTUM);

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();

    // The season card body is gated; the upgrade prompt for it is shown.
    await expect(page.getByText(/season momentum/i).first()).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  // AC (best-effort): when the read fails, the home screen renders normally and
  // the season card is absent — it never blocks the home screen.
  test('home renders normally and the season card is absent when the read fails', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'coach');
    await mockMomentumEndpoint(page, { error: 'boom' }, 500);

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(0);
  });
});
