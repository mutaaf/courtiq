/**
 * E2E: the capture carryover strip on /capture (ticket 0014).
 *
 * Follows the same convention as capture-usage-meter.spec.ts:
 *  - Requires real auth cookies (signs in via UI); test.skip() when
 *    E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (PR-gating CI runner).
 *  - Mocks /api/capture/carryover (and /api/me, /api/data) so the UI renders
 *    deterministically without relying on seeded DB state at the time of the run.
 *
 * The unit-test suite (tests/capture/carryover.test.ts) gates CI on the route
 * contract; these specs guard the page wiring (useQuery → strip visibility)
 * whenever creds are supplied.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint, mockDataEndpoint, TEST_COACH, TEST_TEAM } from './helpers/auth';

const STRIP = '[data-testid="capture-carryover"]';

async function mockCarryoverEndpoint(
  page: import('@playwright/test').Page,
  payload: { focus: string[]; sessionDate?: string; sessionType?: string },
) {
  await page.route('**/api/capture/carryover*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  );
}

async function mockMeWithTier(page: import('@playwright/test').Page, tier = 'coach') {
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

test.describe('Capture carryover strip (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockMeWithTier(page);
    await mockDataEndpoint(page, { players: [] });
    // Silence the AI usage meter so it doesn't interfere
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unlimited: true, tier: 'coach' }),
      })
    );
  });

  // AC6: coach with a recent debrief sees the strip with a focus phrase
  test('coach with a recent debrief sees focus phrases above the record control', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockCarryoverEndpoint(page, {
      focus: ['closeouts', 'weak-hand finishing'],
      sessionDate: '2026-05-19',
      sessionType: 'practice',
    });

    await page.goto('/capture');
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible();
    const strip = page.locator(STRIP);
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('closeouts');
  });

  // AC7: coach with no prior debrief sees NO strip; record button stays operable
  test('coach with no prior debrief sees no carryover strip and record button stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockCarryoverEndpoint(page, { focus: [] });

    await page.goto('/capture');
    await expect(page.locator(STRIP)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });

  // AC8 (page-wiring half): strip absent on fetch failure; record button stays operable
  test('strip absent when /api/capture/carryover fails — record button stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await page.route('**/api/capture/carryover*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
    );

    await page.goto('/capture');
    await expect(page.locator(STRIP)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });
});
