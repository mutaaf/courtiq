/**
 * E2E (ticket 0069): post-loss decompression → next-practice first drill.
 *
 * Skips locally when E2E creds are unset (E2E_TEST_EMAIL / _PASSWORD). The
 * load-bearing CI proofs for the persistence path are the unit tests; this
 * spec guards the live page wiring whenever credentials are supplied.
 *
 * The spec asserts:
 *   (a) on the seeded recent-game session, the decompression entry renders
 *       (data-testid="decompression-open-btn") and tapping it opens the
 *       sheet (data-testid="decompression-sheet");
 *   (b) on /plans, when the AI mock returns a plan whose
 *       content_structured.first_drill_why is set, the
 *       NextPracticeFirstDrillBanner renders the seeded `why` line.
 *
 * UUID range: `0000000000d0` (recent game session) seeded in
 * tests/e2e/fixtures/seed.sql per LESSONS#0101.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

const RECENT_GAME_SESSION_ID = '00000000-0000-4000-a000-0000000000d0';

const GENERATED_PLAN_WITH_FIRST_DRILL_WHY = {
  plan: {
    id: 'generated-plan-with-first-drill-why',
    team_id: '00000000-0000-4000-a000-000000000020',
    coach_id: '00000000-0000-4000-a000-000000000001',
    type: 'practice',
    title: 'Tuesday practice',
    content: '{}',
    content_structured: {
      title: 'Tuesday practice',
      duration_minutes: 60,
      warmup: { name: 'Dynamic Warmup', duration_minutes: 5, description: 'Light jog.' },
      drills: [
        {
          name: 'Live-ball rebound 2-on-2',
          duration_minutes: 8,
          description: 'Pair up at the elbows; box out on the shot.',
          source: 'game_decompression',
        },
        { name: 'Closeout Drill', duration_minutes: 12, description: 'Stay low.' },
      ],
      first_drill_why: 'Saturday said rebounding and effort. Starting here.',
    },
    created_at: new Date().toISOString(),
  },
  observationInsights: { totalObs: 0, daysOfData: 14, topNeedsWork: [], topStrengths: [] },
};

test.describe('Game-decompression flow (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
  });

  test('the decompression entry renders on a recent-game session and opens the sheet', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto(`/sessions/${RECENT_GAME_SESSION_ID}`);

    // LESSONS#0081/#0082 — scope every assertion to data-testid; never a
    // global getByText that might collide with the team name elsewhere.
    const openBtn = page.getByTestId('decompression-open-btn');
    await expect(openBtn).toBeVisible({ timeout: 10000 });

    await openBtn.click();
    await expect(page.getByTestId('decompression-sheet')).toBeVisible();
    await expect(page.getByTestId('decompression-record-btn')).toBeVisible();
  });

  test('the next-practice plan view renders the first-drill-why banner when the plan carries the field', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.route('**/api/ai/plan', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(GENERATED_PLAN_WITH_FIRST_DRILL_WHY),
      }),
    );

    await page.goto('/plans');
    await page.getByRole('button', { name: /60-min practice/i }).click();

    const banner = page.getByTestId('first-drill-why-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Why this is first today');
    await expect(banner).toContainText('rebounding');
  });
});
