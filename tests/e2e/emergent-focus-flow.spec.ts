/**
 * E2E: the director-private "emergent focus" card on /admin (ticket 0071).
 *
 * Mirrors the program-pulse-flow.spec.ts convention:
 *  - /admin is middleware-protected — without real auth cookies it redirects
 *    to /login, so this spec signs in via the UI and test.skip()s when
 *    E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (the PR-gating CI runner).
 *  - We mock /api/me (to drive admin role + org tier into the client) and
 *    /api/org/emergent-focus so the card renders deterministically. The
 *    endpoint is also server-backed by the seed (tests/e2e/fixtures/seed.sql
 *    adds three teams + three practice plans converging on "closeouts" in
 *    the Organization-tier program org), so the un-mocked endpoint resolves
 *    the same focus when authed creds point at that org's director.
 *
 * Per LESSONS#0029 / #0082, every assertion is scoped to data-testid so
 * the E2E coach's first name ("E2E") cannot strict-mode-collide with team
 * strings.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH } from './helpers/auth';

const CARD = '[data-testid="emergent-focus-card"]';

/** The real GET /api/org/emergent-focus shape ({ focuses }). */
const SEEDED_FOCUS = {
  focuses: [
    {
      skill: 'closeouts',
      teamCount: 3,
      teams: [
        { id: 'team-u10', name: 'Program U10s' },
        { id: 'team-u12', name: 'Program U12s' },
        { id: 'team-u14', name: 'Program U14s' },
      ],
    },
  ],
};

async function mockEmergentFocusEndpoint(
  page: import('@playwright/test').Page,
  payload: unknown,
  status = 200,
) {
  await page.route('**/api/org/emergent-focus*', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
  );
}

async function mockMeWithRoleTier(
  page: import('@playwright/test').Page,
  role: string,
  tier: string,
) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coach: { ...TEST_COACH, role, organizations: { id: TEST_COACH.org_id, tier } },
        teams: [],
      }),
    })
  );
  // The admin page also lists coaches; keep it deterministic.
  await page.route('**/api/admin/coaches', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ coaches: [], teams: [] }) })
  );
  // The neighbour 0028 pulse card lives next door — return null so its card
  // is absent and never collides with the emergent-focus assertions.
  await page.route('**/api/ai/program-pulse', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pulse: null }) })
  );
}

test.describe('Emergent focus card on /admin (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockDataEndpoint(page, {});
  });

  // AC (Playwright a): org-tier admin sees the card with the seeded skill +
  // team names.
  test('an org admin sees the emergent-focus card with the converged skill and team names', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockEmergentFocusEndpoint(page, SEEDED_FOCUS);

    await page.goto('/admin');

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText(/3 of your coaches/i);
    await expect(card).toContainText('closeouts');
    await expect(card).toContainText('Program U10s');
    await expect(card).toContainText('Program U12s');
    await expect(card).toContainText('Program U14s');
  });

  // AC (Playwright b): tap Share → the sheet opens with the drafted line +
  // the Copy button carries data-share-text.
  test('tap Share opens the sheet with the drafted line; Copy carries data-share-text', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockEmergentFocusEndpoint(page, SEEDED_FOCUS);

    await page.goto('/admin');

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /share this/i }).click();

    const textarea = card.locator('textarea');
    await expect(textarea).toBeVisible();
    const value = await textarea.inputValue();
    expect(value).toMatch(/Nice — 3 of you converged on closeouts/);

    const copyBtn = card.getByRole('button', { name: /^copy$/i });
    const shareTextAttr = await copyBtn.getAttribute('data-share-text');
    expect(shareTextAttr).toMatch(/Nice — 3 of you converged on closeouts/);
  });

  // AC (Playwright c + d): tap Got-it → the card hides; reload keeps it hidden.
  test('tap Got it hides the card; reload keeps it hidden (7-day dismiss)', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockEmergentFocusEndpoint(page, SEEDED_FOCUS);

    await page.goto('/admin');

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /got it/i }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  // AC: when the route returns focuses: [] (quiet week), the card is ABSENT
  // and the admin screen renders normally.
  test('a quiet week with focuses: [] shows no card and a normal admin screen', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockEmergentFocusEndpoint(page, { focuses: [] });

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible({ timeout: 10000 });
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  // AC: a non-admin org coach does NOT see the card.
  test('a non-admin org coach does not see the emergent-focus card', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'coach', 'organization');
    await mockEmergentFocusEndpoint(page, SEEDED_FOCUS);

    await page.goto('/admin');
    await expect(page.locator(CARD)).toHaveCount(0);
  });
});
