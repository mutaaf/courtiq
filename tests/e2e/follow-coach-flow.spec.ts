/**
 * E2E (ticket 0063): the follow-coach-after-clone primitive.
 *
 * The CI-load-bearing assertions are the public-page surface — the inline
 * follow card on the clone-success state, scoped to its data-testid container
 * so the seed-backed render is the actual proof.
 *
 * The authed flow (sign in → clone → tap Follow → /plans renders the
 * follow-target's plan in the new "From coaches you follow" section) skips
 * when E2E creds are unset, mirroring the precedent established by the
 * practice-plan-share-and-clone-flow spec.
 *
 * Seed fixture used: the existing James Stark coach (from 0055), whose
 * published practice plan token is `test-league-plan-token-e2e-001`. No new
 * seed rows are added — the AC's seed extension is already satisfied by the
 * 0055 fixture, which provides exactly the shape this ticket needs (a
 * SECOND coach in the same org with a published practice plan share).
 *
 * Scope every name-related assertion to a stable data-testid container per
 * LESSONS#0029 / #0082 — the seeded E2E coach's first name "E2E" is a
 * substring of the team name "E2E Test Team" and a substring of "E2E Test
 * Coach"; a page-wide getByText would strict-mode-collide.
 */
import { test, expect } from '@playwright/test';

const FOLLOW_TARGET_TOKEN = 'test-league-plan-token-e2e-001';
const FOLLOW_TARGET_PLAN_URL = `/plan/${FOLLOW_TARGET_TOKEN}`;

test.describe('Follow coach after clone (/plan/[token]) — public surface', () => {
  test('public page renders without auth and shows the Save-to-my-team CTA', async ({ page }) => {
    await page.goto(FOLLOW_TARGET_PLAN_URL);
    await expect(page).toHaveURL(new RegExp(FOLLOW_TARGET_TOKEN));
    await expect(page).not.toHaveURL(/\/login/);

    // Scoped to data-testid to avoid colliding with the bottom CTA copy.
    const cta = page
      .getByTestId('save-cta-top')
      .getByRole('button', { name: /save to my team/i })
      .or(
        page
          .getByTestId('save-cta-top')
          .getByRole('link', { name: /save to my team/i }),
      );
    await expect(cta.first()).toBeVisible({ timeout: 10000 });
  });

  test('an unauthenticated visitor does NOT see the follow control on initial render', async ({ page }) => {
    // The follow card only appears AFTER a successful clone (the
    // PlanCloneSurface owns this state). An unauthenticated visitor sees
    // the standard signup-link CTA only — the follow card is not on the
    // initial render of the public page.
    await page.goto(FOLLOW_TARGET_PLAN_URL);
    await expect(page.getByTestId('follow-coach-control')).toHaveCount(0);
  });
});

test.describe('Follow coach after clone — authed flow', () => {
  test('clone → Follow → /plans renders the follow-target in the new section', async ({ page, context }) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    test.skip(!email || !password, 'authed flow requires E2E_TEST_EMAIL / E2E_TEST_PASSWORD');

    // Sign in via the real login form against the seeded auth user.
    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/(home|onboarding)/, { timeout: 10000 });

    // Navigate to the publisher's public plan page; the Save-to-my-team CTA
    // resolves to the one-team-tap clone path for the E2E coach.
    await page.goto(FOLLOW_TARGET_PLAN_URL);

    const saveBtn = page.getByTestId('save-cta-top').getByTestId('save-to-my-team-cta');
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await saveBtn.click();

    // The clone-success state surfaces the FollowCoachInlineCard.
    await expect(page.getByTestId('plan-cloned-success')).toBeVisible({ timeout: 15000 });
    const followControl = page.getByTestId('follow-coach-control');
    await expect(followControl).toBeVisible();

    // Tap Follow. The card flips to the "Following" state.
    await followControl.getByTestId('follow-coach-button').click();
    await expect(followControl).toContainText(/following/i, { timeout: 5000 });

    // Navigate to /plans and confirm the new "From coaches you follow"
    // section renders the follow-target's plan.
    await page.goto('/plans');
    const section = page.getByTestId('from-follows-section');
    await expect(section).toBeVisible({ timeout: 10000 });
    await expect(section.getByTestId('from-follows-row').first()).toBeVisible();
  });
});
