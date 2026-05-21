/**
 * E2E: the AI usage meter on /capture (ticket 0008).
 *
 * /capture is a middleware-protected route — without real auth cookies it
 * redirects to /login, so these specs follow the same convention as the
 * authenticated capture block in signup-onboarding-capture.spec.ts: they sign in
 * via the UI and test.skip() when E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset
 * (which they are on the PR-gating CI runner). The CI-gating proof for the four
 * meter UI states is the component vitest suite in
 * tests/components/ai-usage-meter.test.tsx; these specs guard the live page
 * wiring (the real useQuery → /api/ai/usage read) whenever creds are supplied.
 *
 * We mock /api/me (tier) and /api/ai/usage (count) so the page renders
 * deterministically against the seeded local Supabase.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint, mockDataEndpoint, TEST_COACH, TEST_TEAM } from './helpers/auth';

const METER = '[data-testid="ai-usage-meter"]';

/** Mock /api/me with a coach whose org carries the given tier. */
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

test.describe('Capture AI usage meter (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockDataEndpoint(page, { players: [] });
  });

  test('free-tier coach sees the remaining-count line near the record control', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'free');
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ used: 2, limit: 5, tier: 'free', remaining: 3 }),
      })
    );

    await page.goto('/capture');
    // The record control is present and the meter shows "N of 5".
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible();
    await expect(page.locator(METER)).toContainText(/\d+ of 5/);
  });

  test('paid-tier coach sees NO usage meter', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'pro_coach');
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unlimited: true, tier: 'pro_coach' }),
      })
    );

    await page.goto('/capture');
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible();
    await expect(page.locator(METER)).toHaveCount(0);
  });

  test('meter degrades silently when /api/ai/usage fails — record button stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'free');
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
    );

    await page.goto('/capture');
    // No meter rendered, but the record button is still enabled and operable.
    await expect(page.locator(METER)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });
});
