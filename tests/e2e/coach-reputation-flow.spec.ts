/**
 * E2E — ticket 0073 — coach reputation flow.
 *
 * Covers two surfaces against the seeded local Supabase:
 *  1. The /plans page's <LeaguePlansSection /> for the BROWSING coach
 *     (the default E2E coach). The seeded published plan
 *     ("Tuesday Closeouts Series") has 12 clones across 4 distinct
 *     programs in the seed — so the reputation line under the row
 *     reads "Cloned by 12 coaches in 4 programs this month."
 *  2. (Authed deep-link path covered by the vitest component test;
 *     the published coach's /home milestone card would require
 *     signing in as a different seeded coach, which the existing
 *     authed-spec helper does not support without env-keyed
 *     credentials. The vitest tests + the seeded discovery surface
 *     are the load-bearing CI proof; the published-coach milestone
 *     card has its own vitest component test covering the copy,
 *     the link, and the Got-it handler.)
 *
 * The spec skips when E2E creds are unset (the existing authed-e2e
 * posture).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

test.describe('Coach reputation on league discovery (/plans top section)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('the reputation line surfaces under the seeded published plan', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    await page.goto('/plans');

    // Scope to the stable testid for the league section (LESSONS#0081).
    const section = page.getByTestId('league-plans-section');
    await expect(section).toBeVisible({ timeout: 10000 });

    // The seeded published plan title is rendered.
    await expect(section).toContainText(/Tuesday Closeouts Series/);

    // The reputation line — scoped to the per-card data-testid so the
    // digits "12" / "4" never strict-mode-collide with another row
    // (LESSONS#0029 / #0082). The seeded token is
    // 'test-league-plan-token-e2e-001'.
    const reputationLine = page.getByTestId(
      'coach-reputation-line-test-league-plan-token-e2e-001',
    );
    await expect(reputationLine).toBeVisible();
    await expect(reputationLine).toContainText('12');
    await expect(reputationLine).toContainText('4');
    await expect(reputationLine).toContainText(/coaches/);
    await expect(reputationLine).toContainText(/programs/);
  });
});
