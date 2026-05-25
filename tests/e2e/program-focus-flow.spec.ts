/**
 * E2E: the program director's weekly focus on /capture (ticket 0031).
 *
 * Follows the capture-carryover.spec.ts convention:
 *  - /capture is a middleware-protected route — without real auth cookies it
 *    redirects to /login, so these specs sign in via the UI and test.skip() when
 *    E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (the PR-gating CI runner).
 *  - Mocks /api/me, /api/data and the focus read (GET /api/org/weekly-focus) so
 *    the page renders deterministically without relying on seeded state at run
 *    time. The route + tier gate are gated on CI by the vitest suites
 *    (tests/org/weekly-focus.test.ts + tests/lib/tier-program-focus.test.ts).
 *
 * The seed (tests/e2e/fixtures/seed.sql) backs the un-mocked GET for the
 * Organization-tier program org whenever creds point at its admin: a
 * config_overrides row at org scope (domain program / key focus) is seeded so the
 * real route resolves the same focus string the mock asserts.
 *
 * Load-bearing AC (Playwright): a coach in an org WITH a focus set sees a single
 * "Program focus this week: <focus>" line at the top of /capture; a coach in an
 * org WITH NO focus sees no such line; and in NEITHER case is the capture input
 * blocked, gated, or made to require a tap-to-dismiss — the line is a label, never
 * a gate.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint, mockDataEndpoint } from './helpers/auth';

const LINE = '[data-testid="program-focus-line"]';

async function mockFocusEndpoint(
  page: import('@playwright/test').Page,
  focus: string | null,
) {
  await page.route('**/api/org/weekly-focus*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ focus }),
    })
  );
}

test.describe('Program weekly-focus line on /capture (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockMeEndpoint(page);
    await mockDataEndpoint(page, { players: [] });
    // Silence the AI usage meter so it doesn't interfere.
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unlimited: true, tier: 'organization' }),
      })
    );
  });

  // AC4: a coach whose org has a focus set sees the single passive line, and
  // capture is NOT gated by it.
  test('a coach in an org with a focus set sees the program-focus line and capture is not gated by it', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockFocusEndpoint(page, 'spacing & off-ball movement');

    await page.goto('/capture');

    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await expect(line).toContainText(/program focus this week/i);
    await expect(line).toContainText('spacing & off-ball movement');

    // The line is a label, never a gate: the record control stays visible + enabled,
    // and there is no dismiss/continue button on the focus line itself.
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
    await expect(line.getByRole('button')).toHaveCount(0);
  });

  // AC4: a coach whose org has NO focus set sees no line; capture stays operable.
  test('a coach in an org with no focus set sees no program-focus line and capture stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockFocusEndpoint(page, null);

    await page.goto('/capture');
    await expect(page.locator(LINE)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });

  // AC4 (best-effort): the line is absent on a read failure and never blocks capture.
  test('program-focus line absent when the read fails — record button stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await page.route('**/api/org/weekly-focus*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
    );

    await page.goto('/capture');
    await expect(page.locator(LINE)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });
});
