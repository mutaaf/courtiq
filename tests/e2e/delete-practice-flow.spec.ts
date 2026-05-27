/**
 * E2E: delete-a-practice flow (ticket 0051).
 *
 * The session detail page is middleware-protected, so this spec requires
 * authenticated cookies. Following the convention in
 * capture-arc-continuity.spec.ts / capture-carryover.spec.ts, the spec
 * test.skip()s when E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset — the
 * PR-gating CI runner does not set them, so the gating proof here is the
 * vitest suite. When creds are supplied, the spec verifies the live page
 * wiring against the seeded `delete-a-practice` sessions.
 *
 * The DOM hook this spec leans on is the `data-testid="delete-practice-sheet"`
 * the component renders — LESSONS#80 / #56 (a stable data-testid is the
 * right hook for surfaces without a single canonical link/button).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

// Disposable sessions seeded by tests/e2e/fixtures/seed.sql for THIS spec only.
const EMPTY_SESSION_ID    = '00000000-0000-4000-a000-0000000000F0';
const POPULATED_SESSION_ID = '00000000-0000-4000-a000-0000000000F1';
const TEAM_NAME            = 'E2E Test Team';

test.describe('Delete a practice (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('preserve-mode: removes the empty session and returns to /sessions', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto(`/sessions/${EMPTY_SESSION_ID}`);
    // The quiet footer trigger only renders for the creator or a head_coach.
    await page.getByRole('button', { name: /delete this practice/i }).click();

    // The sheet is scoped by data-testid so a sibling page renders that share
    // accessible names with the sheet (e.g. notes textarea) can't collide.
    const sheet = page.getByTestId('delete-practice-sheet');
    await expect(sheet).toBeVisible();

    // Empty session: no destructive expand option.
    await expect(sheet.getByRole('button', { name: /delete the notes too/i })).toHaveCount(0);

    await sheet.getByRole('button', { name: /remove this practice/i }).click();

    // Land on /sessions with the row gone.
    await page.waitForURL(/\/sessions\/?(\?.*)?$/);
    await expect(page.getByText(/E2E seed: empty session for delete-a-practice/i)).toHaveCount(0);
  });

  test('cascade-mode requires typing the team name to confirm', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto(`/sessions/${POPULATED_SESSION_ID}`);
    await page.getByRole('button', { name: /delete this practice/i }).click();
    const sheet = page.getByTestId('delete-practice-sheet');
    await expect(sheet).toBeVisible();

    // Expand the destructive section.
    await sheet.getByRole('button', { name: /delete the notes too/i }).click();

    const submit = sheet.getByRole('button', { name: /^delete practice and notes$/i });
    await expect(submit).toBeDisabled();

    // Wrong team name keeps the button disabled.
    const input = sheet.getByLabel(/type the team name/i);
    await input.fill('Lakers');
    await expect(submit).toBeDisabled();

    // Right team name (case-insensitive) enables it.
    await input.fill(TEAM_NAME.toLowerCase());
    await expect(submit).toBeEnabled();
  });
});
