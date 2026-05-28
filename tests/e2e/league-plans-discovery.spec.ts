/**
 * E2E (ticket 0055): the <LeaguePlansSection /> at the top of /plans renders
 * a peer coach's published practice plan when both coaches share an org and
 * a sport.
 *
 * The /plans page is AUTHED (dashboard) so the spec skips on CI where
 * E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset — same posture as the rest
 * of the authed e2e suite (capture-arc-continuity / plans-flow / coach-card).
 *
 * The seed (tests/e2e/fixtures/seed.sql) seeds a second coach 'James Stark'
 * in the SAME org as the default E2E coach, on a basketball team, with
 * one published practice_plan_shares row pointing at the plan
 * 'Tuesday Closeouts Series'. The default E2E coach also coaches
 * basketball — so the league section should surface James's plan on /plans.
 *
 * Per LESSONS#0009: the relevant data path is browser-side (`useQuery` in
 * a client component), so the assertions could be mocked — but per LESSONS
 * the always-green CI proof is the SEEDED, real-DB row, and the component
 * test (already green) is the per-PR proof. The data-testid scoping
 * pattern follows LESSONS#0081 for sibling-CTA safety.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

test.describe('League-internal practice-plan discovery (/plans top section)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('the league section surfaces a peer coach plan from the same org + sport', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    await page.goto('/plans');

    // Scope to the stable testid so a sibling CTA in another surface never
    // strict-mode-collides (LESSONS#0022/#0029/#0081).
    const section = page.getByTestId('league-plans-section');
    await expect(section).toBeVisible({ timeout: 10000 });

    // The peer coach's plan title from the seed appears in the section.
    await expect(section).toContainText(/Tuesday Closeouts Series/);

    // The first-name attribution rides through.
    await expect(section).toContainText(/Coach James/);

    // At least one "Save to my team" CTA per row.
    const saveButtons = section.getByRole('button', { name: /save to my team/i });
    await expect(saveButtons.first()).toBeVisible();
  });
});
