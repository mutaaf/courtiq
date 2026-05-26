/**
 * E2E: unfinished-drills rollover end-to-end (ticket 0045).
 *
 * Following the convention of capture-arc-continuity.spec.ts, this spec skips
 * in PR-gating CI when E2E creds are unset (E2E_TEST_EMAIL/_PASSWORD). The
 * load-bearing CI proof for the rollover UI is the component test
 * (tests/components/practice-plan-rollover-line.test.tsx) and the helper +
 * route tests; this spec guards the live page wiring whenever credentials
 * are supplied.
 *
 * We mock /api/ai/plan to return a generated plan whose `content_structured`
 * carries a populated `rollover_from_last_week` array — that's the contract
 * the new route writes when the prior plan had un-run drills.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

const ROLLOVER_LINE = '[data-testid="practice-plan-rollover-line"]';

const GENERATED_PLAN_WITH_ROLLOVER = {
  plan: {
    id: 'generated-plan-with-rollover',
    team_id: '00000000-0000-4000-a000-000000000020',
    coach_id: '00000000-0000-4000-a000-000000000001',
    type: 'practice',
    title: 'Tonight\'s practice',
    content: '{}',
    content_structured: {
      title: 'Tonight\'s practice',
      duration_minutes: 60,
      warmup: { name: 'Dynamic Warmup', duration_minutes: 5, description: 'Light jog.' },
      drills: [
        { name: 'Closeout Drill', duration_minutes: 12, description: 'Stay low.' },
      ],
      rollover_from_last_week: [
        { drill_id: 'corner-shooting', drill_name: 'Corner Shooting', source_plan_id: 'prior-plan-id' },
        { drill_id: '3-on-3-to-shot', drill_name: '3-on-3 to Shot', source_plan_id: 'prior-plan-id' },
      ],
    },
    created_at: new Date().toISOString(),
  },
  observationInsights: { totalObs: 0, daysOfData: 14, topNeedsWork: [], topStrengths: [] },
};

test.describe('Practice plan rollover line (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
  });

  test('the rollover line is visible above the drills when the generated plan carries un-run drills', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.route('**/api/ai/plan', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(GENERATED_PLAN_WITH_ROLLOVER),
      }),
    );

    await page.goto('/plans');
    // Trigger generation via the suggestion chip; the mocked route returns
    // the plan with the rollover array, and the plan view renders the line.
    await page.getByRole('button', { name: /60-min practice/i }).click();

    const line = page.locator(ROLLOVER_LINE);
    await expect(line).toBeVisible();
    await expect(line).toContainText(/carrying from last week/i);
    await expect(line).toContainText('Corner Shooting');
    await expect(line).toContainText('3-on-3 to Shot');
  });
});
