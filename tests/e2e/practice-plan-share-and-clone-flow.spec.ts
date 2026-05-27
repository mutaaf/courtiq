/**
 * E2E (ticket 0049): public, no-auth practice-plan share page at /plan/[token].
 *
 * The page is a SERVER component whose getPlanData() fetch runs server-side
 * and is NOT intercepted by page.route() (browser layer only — LESSONS#0009)
 * — so every assertion below is backed by a REAL row in
 * tests/e2e/fixtures/seed.sql:
 *   - a type='practice' plan with three drills
 *   - a practice_plan_shares row with token PRACTICE_PLAN_TOKEN + a note
 *   - the seeded coach's full_name 'E2E Test Coach' (first name 'E2E')
 *
 * The authed clone flow skips when E2E creds are unset (coach-card precedent
 * — the always-green CI proof is the vitest suite + the public-page e2e
 * below).
 */
import { test, expect } from '@playwright/test';

const PRACTICE_PLAN_TOKEN = 'test-practice-plan-token-e2e-001';
const PRACTICE_PLAN_URL = `/plan/${PRACTICE_PLAN_TOKEN}`;

// content_structured.drills[].name of the seeded plan — asserted on the rendered
// (seed-backed) page.
const DRILL_NAME = 'Closeout Drill';
const NOTE_FRAGMENT = 'U12s on Tuesday';

test.describe('Public practice-plan share (/plan/[token]) — coach-to-coach clone surface', () => {
  test('renders without authentication (no login redirect)', async ({ page }) => {
    await page.goto(PRACTICE_PLAN_URL);
    await expect(page).toHaveURL(new RegExp(PRACTICE_PLAN_TOKEN));
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('renders the drill list + the publisher note', async ({ page }) => {
    await page.goto(PRACTICE_PLAN_URL);
    await expect(page.getByText(DRILL_NAME)).toBeVisible({ timeout: 10000 });
    // The note rides through verbatim to the public page.
    await expect(
      page.getByTestId('practice-plan-note'),
    ).toContainText(NOTE_FRAGMENT);
  });

  test('shows a "Save to my team" CTA', async ({ page }) => {
    await page.goto(PRACTICE_PLAN_URL);
    // The CTA is rendered twice (top + bottom of page). Scope to the
    // testid container so strict-mode never flags duplicates as a violation
    // (LESSONS#0022/#0029). The CTA's accessible name is the same in both
    // surfaces.
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

  test('has NO dashboard chrome (standalone public surface)', async ({ page }) => {
    await page.goto(PRACTICE_PLAN_URL);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });

  test('an unknown token does not redirect to login (renders a not-found state)', async ({ page }) => {
    await page.goto('/plan/bad-token-404-does-not-exist');
    await expect(page).toHaveURL(/\/plan\/bad-token-404-does-not-exist/);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByText(/practice plan not found/i)).toBeVisible({ timeout: 10000 });
  });
});
