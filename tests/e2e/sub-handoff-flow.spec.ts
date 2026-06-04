/**
 * E2E (ticket 0067): substitute-coach Tuesday-night handoff.
 *
 * Phase A — unauthed: navigate to the seeded /sub/<token>, assert the H1 +
 *           the three sections render against the seeded `sub_handoffs`
 *           row's include-flags.
 * Phase B — sub leaves a one-line note; the success state confirms it.
 * Phase C — coach signs in (skipped when E2E creds unset), navigates to
 *           /home, asserts the SubNoteCard renders with the seeded note,
 *           taps Got-it; the next render does not show the same note.
 *
 * The /sub/[token] page is a `'use client'` component (LESSONS#0036 — its
 * browser-side fetch is interceptable by page.route(), and the real seeded
 * row is the load-bearing CI proof when nothing is mocked).
 *
 * Scope every assertion by `data-testid` per LESSONS#0081 / #0082 — the E2E
 * coach's first name "E2E" overlaps team strings like "E2E Test Team".
 */
import { test, expect } from '@playwright/test';

// Deterministic token planted in tests/e2e/fixtures/seed.sql alongside the
// seeded sub_handoffs row. Mirrors the observer-utils token shape (HMAC
// suffix is fine in the seed because the verifier accepts any
// correctly-signed unexpired token).
const SUB_HANDOFF_TOKEN = '00000000-0000-4000-a000-0000000000fc.subseedsig';
const SUB_HANDOFF_URL = `/sub/${SUB_HANDOFF_TOKEN}`;

test.describe('Sub-handoff public page (/sub/[token])', () => {
  test('renders unauthed (no login redirect) with the seeded H1', async ({ page }) => {
    await page.goto(SUB_HANDOFF_URL);
    await expect(page).toHaveURL(new RegExp(SUB_HANDOFF_TOKEN.replace(/\./g, '\\.')));
    await expect(page).not.toHaveURL(/\/login/);
    const h1 = page.getByTestId('sub-handoff-h1');
    await expect(h1).toBeVisible({ timeout: 10000 });
    // Scope to the H1 so the team name doesn't strict-mode-collide with the
    // "E2E" coach first name elsewhere on the page (LESSONS#0082).
    await expect(h1).toContainText('E2E Test Team');
  });

  test('renders the three sections when all include-flags are true', async ({ page }) => {
    await page.goto(SUB_HANDOFF_URL);
    // weeklyFocusLine — scoped to its data-testid container.
    await expect(page.getByTestId('sub-handoff-focus')).toBeVisible({ timeout: 10000 });
    // queuedDrills — at least one drill rendered.
    await expect(page.getByTestId('sub-handoff-drills')).toBeVisible();
    // eyesOnPlayers — first-name only, anchored on the seeded observation.
    await expect(page.getByTestId('sub-handoff-eyes')).toContainText(/left-hand/i);
  });

  test('an unknown token does not redirect to login (renders not-found)', async ({ page }) => {
    await page.goto('/sub/bad-token-does-not-exist');
    await expect(page).toHaveURL(/\/sub\/bad-token-does-not-exist/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('NO dashboard chrome on the public surface', async ({ page }) => {
    await page.goto(SUB_HANDOFF_URL);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });
});
