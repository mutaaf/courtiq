/**
 * E2E — ticket 0085 — referral-credit on-deck (stacking-progress) flow.
 *
 * The 0074 e2e (referral-credit-flow.spec.ts) covers the celebration
 * card when 3 qualified land. This spec covers the FORWARD-LOOKING
 * sub-section that fires whenever the inviter has pending (signed-up-
 * but-not-yet-qualifying) referrals AND there is a next milestone to
 * stack toward.
 *
 * The on-deck section is rendered by the same client component
 * (referral-credit-card.tsx) whose status query lives in TanStack
 * useQuery — so per LESSONS#0036 the /home page's browser-side fetch
 * IS interceptable by `page.route()`, and that's how we feed the
 * deterministic fixture. The seed (extended in this PR) adds two
 * pending referred coaches whose `preferences.referred_by_code`
 * matches the E2E coach's deterministic code, so the REAL un-mocked
 * route would also return them — the seed is the load-bearing real-
 * data proof, the page.route is the deterministic fixture.
 *
 * Scope every assertion by data-testid (LESSONS#0029 / #0081 / #0082):
 * "Coach James" / "$9.99" overlap many strings on /home.
 *
 * The share-sheet click is NOT tested here — jsdom/Playwright's
 * navigator.share dispatch is flaky and the AC says to skip it. The
 * vitest component test asserts the share body shape.
 *
 * Skips when E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (existing
 * authed-spec posture).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

test.describe('Referral credit on-deck on /home (ticket 0085)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('the on-deck sub-section renders with the two pending names + the $9.99 progress line', async ({
    page,
  }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    // Mock the status route — three qualified (so the 0074 celebration
    // body also renders) + TWO pending. The pending shape mirrors the
    // seed extension in this PR (James + Lin pending, AAAAAA code,
    // matching the E2E coach's deterministic referral code).
    await page.route('**/api/coach/referral-credit-status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          // 0074 baseline — three qualified.
          qualifiedCount: 3,
          qualifiedCoachFirstNames: ['Maya', 'Sam', 'Riya'],
          currentMilestone: 'qualified_3',
          pendingCreditCents: 999,
          alreadyGranted: false,
          // 0085 stacking-progress.
          pendingReferrals: [
            {
              firstName: 'James',
              signedUpAt: '2026-06-10T08:00:00Z',
              needsToQualify:
                'needs to ship a parent report or run 5 observed practices',
            },
            {
              firstName: 'Lin',
              signedUpAt: '2026-06-12T08:00:00Z',
              needsToQualify:
                'needs to ship a parent report or run 5 observed practices',
            },
          ],
          nextMilestoneIn: 7,
          nextMilestoneKind: 'qualified_10',
        }),
      }),
    );

    await page.goto('/home');

    // Scope to the testid (LESSONS#0029 / #0082 — "James" / "Lin" /
    // "$9.99" all overlap many rendered strings on /home).
    const section = page.getByTestId('referral-credit-pending-section');
    await expect(section).toBeVisible({ timeout: 10000 });
    await expect(section).toContainText('James');
    await expect(section).toContainText('Lin');
    await expect(section).toContainText('$9.99');
    // "qualifying coach" appears in the progress line in both singular
    // and plural forms (LESSONS#0063 — shape-anchored, not bare
    // substring).
    await expect(section).toContainText(/qualifying coach/i);

    // The "Text them a nudge" button is present.
    const nudgeBtn = page.getByTestId('referral-credit-pending-nudge-button');
    await expect(nudgeBtn).toBeVisible();
    await expect(nudgeBtn).toContainText(/nudge/i);
  });

  test('the on-deck sub-section renders on its own (qualifiedCount=2, no celebration body)', async ({
    page,
  }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    // Two qualified — celebration body absent — but two pending, so
    // the on-deck sub-section renders standalone. The card's outer
    // testid still anchors it.
    await page.route('**/api/coach/referral-credit-status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          qualifiedCount: 2,
          qualifiedCoachFirstNames: [],
          currentMilestone: null,
          pendingCreditCents: 999,
          alreadyGranted: false,
          pendingReferrals: [
            {
              firstName: 'James',
              signedUpAt: '2026-06-10T08:00:00Z',
              needsToQualify:
                'needs to ship a parent report or run 5 observed practices',
            },
          ],
          nextMilestoneIn: 1,
          nextMilestoneKind: 'qualified_3',
        }),
      }),
    );

    await page.goto('/home');

    const section = page.getByTestId('referral-credit-pending-section');
    await expect(section).toBeVisible({ timeout: 10000 });
    await expect(section).toContainText('James');
    // Singular phrasing for the 1-more-needed case.
    await expect(section).toContainText(/one more/i);
    await expect(section).toContainText('$9.99');
  });
});
