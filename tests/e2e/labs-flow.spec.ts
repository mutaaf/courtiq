/**
 * E2E (ticket 0095): Labs → Chalk Talk.
 *
 * Requires E2E_TEST_EMAIL + E2E_TEST_PASSWORD; skips gracefully without them.
 * Asserts the Labs card and that the board element mounts. WebGL output itself is not
 * asserted (headless GPUs vary); the chalk-talk package has its own engine tests.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint } from './helpers/auth';

test.describe('Labs — Chalk Talk (ticket 0095)', () => {
  test('Labs lists Chalk Talk and opens the board', async ({ page }) => {
    const authenticated = await signInViaUI(page);
    test.skip(!authenticated, 'E2E credentials not set');
    await mockMeEndpoint(page);

    await page.goto('/labs');
    await expect(page.getByRole('heading', { name: 'Labs' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Chalk Talk').first()).toBeVisible();
    await expect(page.getByText('Experimental')).toBeVisible();

    await page.getByRole('link', { name: 'Open Chalk Talk' }).click();
    await expect(page).toHaveURL(/\/labs\/chalk-talk/);
    const board = page.getByTestId('chalk-talk-board');
    await expect(board).toBeVisible();
    // the package fills the element with its own UI (scoped under .ct)
    await expect(board.locator('.ct-mic')).toBeVisible({ timeout: 15000 });
  });
});
