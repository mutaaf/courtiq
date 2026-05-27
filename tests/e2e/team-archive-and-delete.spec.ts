/**
 * E2E: team archive + hard-delete flow (ticket 0053).
 *
 * The settings/organization page is middleware-protected, so this spec
 * requires authenticated cookies. Following the convention in
 * tests/e2e/delete-practice-flow.spec.ts (the sibling 0051 spec) and
 * capture-arc-continuity.spec.ts, this spec test.skip()s when
 * E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset — the PR-gating CI runner does
 * not set them, so the gating proof here is the vitest suite. When creds are
 * supplied, the spec verifies the live page wiring against the seeded second
 * team (E2E Disposable Team), archives it, then opens the archived-teams
 * panel and hard-deletes it via the typed-name confirm.
 *
 * The DOM hook this spec leans on is the `data-testid="delete-team-modal"`
 * the component renders — LESSONS#80 / #56 (a stable data-testid is the right
 * hook for surfaces without a single canonical link/button).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

const DISPOSABLE_TEAM_NAME = 'E2E Disposable Team';

test.describe('Archive + delete a team (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('admin archives a team and it disappears from the active list', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/settings/organization');

    // The Teams panel lists active teams with an Archive action per row.
    const teamsPanel = page.getByTestId('org-teams-panel');
    await expect(teamsPanel).toBeVisible();

    const row = teamsPanel.getByRole('listitem', { name: new RegExp(DISPOSABLE_TEAM_NAME, 'i') });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /archive/i }).click();

    // The archived team should appear in the Archived panel.
    const archivedPanel = page.getByTestId('org-archived-teams-panel');
    await expect(archivedPanel).toContainText(new RegExp(DISPOSABLE_TEAM_NAME, 'i'));
  });

  test('admin hard-deletes an archived team via the typed-name confirm', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/settings/organization');

    const archivedPanel = page.getByTestId('org-archived-teams-panel');
    const archivedRow = archivedPanel.getByRole('listitem', {
      name: new RegExp(DISPOSABLE_TEAM_NAME, 'i'),
    });
    await archivedRow.getByRole('button', { name: /delete permanently/i }).click();

    const modal = page.getByTestId('delete-team-modal');
    await expect(modal).toBeVisible();

    const submit = modal.getByRole('button', { name: /^delete the team forever$/i });
    await expect(submit).toBeDisabled();

    // Wrong text keeps the button disabled.
    const input = modal.getByLabel(/type the team name to confirm/i);
    await input.fill('Wrong Name');
    await expect(submit).toBeDisabled();

    // Typed-name confirm (case-insensitive) enables the button.
    await input.fill(DISPOSABLE_TEAM_NAME.toLowerCase());
    await expect(submit).toBeEnabled();
  });
});
