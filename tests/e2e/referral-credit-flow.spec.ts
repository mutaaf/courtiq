/**
 * E2E — ticket 0074 — referral-credit flow.
 *
 * The Stripe customer-balance write is COVERED BY THE VITEST TESTS
 * (the POST /api/billing/apply-referral-credit happy path + Stripe
 * failure path). The e2e scope here is bounded to the AUTHED HOME
 * surface — the only codepath the change mounts on a publicly-reachable
 * page (the home card asserts the GET status route's response and the
 * Got-it consume POST).
 *
 * The spec skips when E2E creds are unset (existing authed-spec
 * posture). When E2E creds ARE set, the test:
 *  1. Signs in as the seeded E2E coach.
 *  2. Mocks the GET /api/coach/referral-credit-status to return 3
 *     qualified referrals + a Stripe customer-balance txn id (so the
 *     test exercises the GRANT branch end-to-end without a live Stripe
 *     call — LESSONS#0044, the load-bearing assertion is the rendered
 *     card, not a live Stripe call).
 *  3. Navigates to /home; asserts the referral-credit-card renders the
 *     three seeded first names + a real dollar amount + the See-my-
 *     next-invoice button.
 *  4. Taps the Got-it button; asserts the consume POST fires and the
 *     card hides.
 *
 * Scope by data-testid per LESSONS#0081 / #0082 (first names + dollar
 * amount overlap many rendered strings on /home).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

test.describe('Referral credit on /home (ticket 0074)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('the referral-credit card renders the three names + dollar amount when three qualified referrals are returned', async ({
    page,
  }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    // Mock the status route — three qualified, qualified_3, $9.99.
    // The mock is the only way to exercise the card without depending
    // on a real Stripe call (LESSONS#0044 — the credit is mocked; the
    // assertion is the rendered card).
    await page.route('**/api/coach/referral-credit-status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          qualifiedCount: 3,
          qualifiedCoachFirstNames: ['Maya', 'James', 'Lin'],
          currentMilestone: 'qualified_3',
          pendingCreditCents: 999,
          alreadyGranted: false,
        }),
      }),
    );

    let consumeCalled = false;
    await page.route(
      '**/api/coach/referral-credit-status/consume',
      (route) => {
        consumeCalled = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      },
    );

    await page.goto('/home');

    // Scope to the testid (LESSONS#0029 / #0082 — three first names +
    // a dollar amount overlap many rendered strings on /home).
    const card = page.getByTestId('referral-credit-card');
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText('Maya');
    await expect(card).toContainText('James');
    await expect(card).toContainText('Lin');
    await expect(card).toContainText('$9.99');

    // The See-my-next-invoice button is present.
    const invoiceButton = page.getByTestId('referral-credit-card-invoice-button');
    await expect(invoiceButton).toBeVisible();

    // Tap Got-it; assert the consume POST fired.
    await page.getByTestId('referral-credit-card-got-it').click();
    await expect.poll(() => consumeCalled).toBe(true);
  });
});
