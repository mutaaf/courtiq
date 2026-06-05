/**
 * E2E (ticket 0068): the season-opener parent intro card.
 *
 * Phase B of the AC's three phases — the public-page render. The opener
 * page at /opener/<token> is a SERVER component whose getOpenerData() does
 * a server-side fetch (NOT interceptable by page.route() per LESSONS#0009),
 * so every assertion is backed by a real seeded row in
 * tests/e2e/fixtures/seed.sql. The token is deterministic:
 * `test-season-opener-token-e2e-001` (seeded in the 0068 block at the end
 * of seed.sql).
 *
 * Assertions are scoped by data-testid per LESSONS#0029 / #0082 — the E2E
 * coach's first name ("E2E") substrings inside the team name
 * ("E2E Test Team") and would strict-mode-collide on a bare getByText.
 *
 * Phase A (the authed control on /home for a fresh team) is covered by
 * tests/components/season-opener-entry.test.tsx + tests/components/
 * season-opener-card.test.tsx in vitest — the E2E coach's seeded team is
 * not necessarily within the 7-day window at every CI run, and the
 * load-bearing CI proof of the entry-point lives in the component tests.
 * Phase C (parent reaction strip submit) reuses the already-shipped
 * ParentReactionForm and parent_reactions e2e coverage — the structural
 * guarantee here is that the strip RENDERS on the page.
 */
import { test, expect } from '@playwright/test';

const TOKEN = 'test-season-opener-token-e2e-001';

test.describe('Season-opener public page (/opener/[token])', () => {
  test('renders unauthed (no login redirect) with the seeded team H1', async ({
    page,
  }) => {
    await page.goto(`/opener/${TOKEN}`);
    await expect(page).not.toHaveURL(/\/login/);

    const wrapper = page.getByTestId('season-opener-page');
    await expect(wrapper).toBeVisible({ timeout: 10000 });

    // Scope the H1 assertion to its testid — "E2E" appears in both the
    // team name and the coach first name, so a bare getByText would
    // strict-mode-collide.
    const h1 = page.getByTestId('season-opener-h1');
    await expect(h1).toBeVisible({ timeout: 10000 });
    await expect(h1).toContainText('Welcome to');
  });

  test('renders the sub-line, focus line, and referral footer', async ({
    page,
  }) => {
    await page.goto(`/opener/${TOKEN}`);
    await expect(page.getByTestId('season-opener-page')).toBeVisible({
      timeout: 10000,
    });

    // The sub-line (Sport — Age group — Season label) is its own data-testid.
    await expect(page.getByTestId('season-opener-subline')).toBeVisible();

    // The focus line block — quote-wrapped.
    const focus = page.getByTestId('season-opener-focus');
    await expect(focus).toBeVisible();
    await expect(focus).toContainText('closeouts');

    // Referral footer is the 0011-pattern self-signup hook.
    await expect(
      page.getByTestId('season-opener-referral-footer'),
    ).toBeVisible();
  });

  test('an unknown token does not redirect to login', async ({ page }) => {
    await page.goto('/opener/this-token-does-not-exist');
    await expect(page).not.toHaveURL(/\/login/);
    // The not-found body still carries the page testid so we know the
    // public-paths allow-list let the request through.
    await expect(page.getByTestId('season-opener-page')).toBeVisible({
      timeout: 10000,
    });
  });

  test('NO dashboard chrome on the public surface (coach-side nav absent)', async ({
    page,
  }) => {
    await page.goto(`/opener/${TOKEN}`);
    await expect(page.getByTestId('season-opener-page')).toBeVisible({
      timeout: 10000,
    });
    // The dashboard tab-bar's anchors are scoped to /home, /capture, etc.
    // None of them should render on the public parent-facing page.
    await expect(page.locator('a[href="/home"]')).toHaveCount(0);
    await expect(page.locator('a[href="/capture"]')).toHaveCount(0);
  });
});
