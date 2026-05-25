/**
 * E2E: the first-artifact activation card on /home (ticket 0030).
 *
 * Same convention as weekly-digest-flow.spec.ts:
 *  - /home is middleware-protected — without real auth cookies it redirects to
 *    /login, so these specs sign in via the UI and test.skip() when
 *    E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (the PR-gating CI runner).
 *  - We mock /api/me and /api/data so the home page's stats query resolves
 *    deterministically. The eligibility signal (observations count + the
 *    coach's artifact/plans count) is read via query() → /api/data, so the
 *    mocks drive the card's presence. The always-green CI proof for the card's
 *    states is the vitest component suite (tests/first-artifact/*).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH, TEST_TEAM } from './helpers/auth';

const CARD = '[data-testid="first-artifact-card"]';

async function mockMe(page: import('@playwright/test').Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ coach: TEST_COACH, teams: [TEST_TEAM] }),
    }),
  );
}

// Five observations is comfortably above the "enough notes" threshold.
const FIVE_OBS = Array.from({ length: 5 }, (_, i) => ({ id: `obs-${i}` }));
const THREE_PLAYERS = Array.from({ length: 3 }, (_, i) => ({ id: `p-${i}` }));
const ONE_SESSION = [{ id: 's-0' }];

test.describe('First-artifact activation card on /home (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockMe(page);
  });

  // AC (Playwright): a coach with observations above threshold and zero
  // artifacts sees the first-artifact card with its CTA on /home.
  test('an eligible new coach sees the first-artifact card with its CTA', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockDataEndpoint(page, {
      players: THREE_PLAYERS,
      observations: FIVE_OBS,
      sessions: ONE_SESSION,
      plans: [], // zero artifacts generated yet
    });

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    // The CTA routes into the existing generator surface.
    await expect(card.getByRole('link')).toHaveAttribute('href', '/plans');
  });

  // AC (Playwright): a coach who already has an artifact does not see it.
  test('a coach who already generated an artifact does not see the card', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockDataEndpoint(page, {
      players: THREE_PLAYERS,
      observations: FIVE_OBS,
      sessions: ONE_SESSION,
      plans: [{ id: 'plan-existing' }], // an artifact already exists
    });

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  // AC (best-effort): if the underlying count query is slow/fails, the home
  // screen still renders and the card is simply absent.
  test('home renders normally and the card is absent when the stats read fails', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await page.route('**/api/data', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
    );

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(0);
  });
});
