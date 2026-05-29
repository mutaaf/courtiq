/**
 * E2E (ticket 0056): one-tap "Thank <Parent>" reply flow.
 *
 * The seeded fixture extends `tests/e2e/fixtures/seed.sql` with a
 * `parent_reactions` row tied to the E2E coach + Alice (the existing seeded
 * player). Alice has `parent_email` set in the same seed so the route can
 * server-resolve the recipient from `players.parent_contact` (LESSONS#0039).
 *
 * Auth: signs in as the E2E coach via the existing `signInViaUI` helper
 * (LESSONS#0027 / coach-handle precedent); skips when E2E creds are unset.
 * Per LESSONS#0081 — every assertion is scoped by a stable `data-testid`
 * (sheet container + Replied pill) to dodge strict-mode collisions on shared
 * substrings.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

const HOME_URL = '/home';

test.describe('Thank a parent in one tap (ticket 0056)', () => {
  test('coach opens the Thank Sarah sheet, sends the draft, and the row collapses to Replied', async ({ page }) => {
    const signedIn = await signInViaUI(page);
    test.skip(!signedIn, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD unset — auth-required flow skipped.');

    await page.goto(HOME_URL);
    // The Thank-<parent> button on the seeded reaction is the entry point.
    const thankBtn = page.getByRole('button', { name: /thank\s+sarah/i }).first();
    await expect(thankBtn).toBeVisible({ timeout: 10000 });
    await thankBtn.click();

    // The sheet opens — scoped by its stable data-testid.
    const sheet = page.getByTestId('thank-parent-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // The draft is rendered as the textarea's initial value. We tap Send
    // without editing — the route stamps the reaction + creates the
    // announcement row. (The free-tier static template is enough to pass.)
    await sheet.getByRole('button', { name: /^send$/i }).click();

    // The sheet closes (or fades) and the row collapses to a Replied pill,
    // scoped to a stable data-testid to dodge strict-mode collisions on the
    // word "Replied" elsewhere on the page.
    await expect(page.getByTestId(/^reaction-replied-pill-/)).toBeVisible({ timeout: 10000 });
  });

  test('the openReply deep-link auto-opens the sheet for the named reaction', async ({ page }) => {
    const signedIn = await signInViaUI(page);
    test.skip(!signedIn, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD unset — auth-required flow skipped.');

    // The Monday rollup email's Thank-Sarah link carries an
    // `?openReply=<reaction_id>` query param; the inbox page opens the sheet
    // on first render for that reaction.
    await page.goto(`${HOME_URL}?openReply=00000000-0000-4000-a000-000000000aa1`);
    await expect(page.getByTestId('thank-parent-sheet')).toBeVisible({ timeout: 10000 });
  });
});
