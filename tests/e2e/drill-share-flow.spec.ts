/**
 * E2E (ticket 0064): single-drill publish-and-clone surface at /drill/[token].
 *
 * The page is a SERVER component whose server-side fetch is NOT intercepted
 * by page.route() (LESSONS#0009), so every assertion is backed by a REAL
 * row in tests/e2e/fixtures/seed.sql:
 *   - one drills row with id 0...0110 ("0064 E2E Closeout Drill")
 *   - one drill_shares row with token DRILL_SHARE_TOKEN + a caption
 *   - the seeded E2E coach's full_name 'E2E Test Coach' (first name 'E2E')
 *
 * The signed-in clone flow skips when E2E creds are unset (coach-card
 * precedent — the always-green CI proof is the public-page e2e + the
 * vitest suite).
 */
import { test, expect } from '@playwright/test';

const DRILL_SHARE_TOKEN = 'test-drill-share-token-e2e-001';
const DRILL_SHARE_URL = `/drill/${DRILL_SHARE_TOKEN}`;
const DRILL_NAME = '0064 E2E Closeout Drill';
const CAPTION_FRAGMENT = 'finish their close-outs';

test.describe('Public drill share (/drill/[token]) — single-drill clone surface', () => {
  test('renders without authentication (no login redirect)', async ({ page }) => {
    await page.goto(DRILL_SHARE_URL);
    await expect(page).toHaveURL(new RegExp(DRILL_SHARE_TOKEN));
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('renders the drill name + the caption + the save CTA', async ({ page }) => {
    await page.goto(DRILL_SHARE_URL);
    // Scope by the card testid so we never strict-mode-collide with the
    // brand/footer chrome (LESSONS#0029 / #0082).
    const card = page.getByTestId('drill-share-card');
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByRole('heading', { level: 1, name: DRILL_NAME })).toBeVisible();

    // The caption is in its own quoted block.
    await expect(page.getByTestId('drill-share-caption')).toContainText(CAPTION_FRAGMENT);

    // The Save CTA — scope to the data-testid container.
    const cta = page.getByTestId('save-drill-cta');
    await expect(cta).toBeVisible();
  });

  test('has NO dashboard chrome (standalone public surface)', async ({ page }) => {
    await page.goto(DRILL_SHARE_URL);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });

  test('an unknown token does not redirect to login (renders a not-found state)', async ({
    page,
  }) => {
    await page.goto('/drill/bad-drill-token-404-does-not-exist');
    await expect(page).toHaveURL(/\/drill\/bad-drill-token-404-does-not-exist/);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByText(/drill not found/i)).toBeVisible({ timeout: 10000 });
  });
});
