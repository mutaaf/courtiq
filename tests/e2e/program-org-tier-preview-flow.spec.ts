/**
 * E2E: the program-org-tier upgrade moment on the admin / director surface
 * (ticket 0087).
 *
 * Follows the program-pulse-flow.spec.ts convention:
 *  - /admin is a middleware-protected route — without real auth cookies it
 *    redirects to /login, so these specs sign in via the UI and test.skip()
 *    when E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (the PR-gating CI
 *    runner). The component vitest tests are the always-green CI proof.
 *  - We mock /api/me (to drive the org tier + admin role into the client)
 *    and POST /api/ai/program-pulse so the page renders deterministically.
 *    The endpoint is server-backed; the seed (tests/e2e/fixtures/seed.sql)
 *    adds three Coach-tier coaches with shipped artifacts so the un-mocked
 *    endpoint also resolves a real programTierState whenever creds are set.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH } from './helpers/auth';

const CARD = '[data-testid="program-org-tier-card"]';

/** The real POST /api/ai/program-pulse shape extended with programTierState. */
const SEEDED_RESPONSE = {
  pulse: {
    week_summary: 'Last week — 2 of 3 coaches logged notes, 3 practices across the program.',
    active_coaches: 2,
    total_coaches: 3,
    teams_to_watch: [
      { team_name: 'Program U12s', note: 'Plenty of needs-work notes worth a check-in.' },
    ],
    next_action: {
      label: 'Open program analytics',
      kind: 'view_analytics',
      rationale: 'See the team-level detail behind this week\'s numbers.',
    },
  },
  programTierState: {
    paidCoachCount: 3,
    paidCoachFirstNames: ['Maya', 'James', 'Lin'],
    monthlySpendCents: 2997,
    orgUpgradeSavingsCents: -2002,
    eligibleForOrgUpgrade: true,
  },
};

async function mockPulseEndpoint(
  page: import('@playwright/test').Page,
  payload: unknown,
  status = 200,
) {
  await page.route('**/api/ai/program-pulse', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) }),
  );
}

async function mockSnoozeEndpoint(page: import('@playwright/test').Page) {
  await page.route('**/api/admin/program-org-tier-card/snooze', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
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
    }),
  );
  await page.route('**/api/admin/coaches', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ coaches: [], teams: [] }) }),
  );
}

test.describe('Program-Org-Tier card on /admin (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockDataEndpoint(page, {});
  });

  test('an admin on a free org with 3+ paid coaches sees the program-org-tier card with the names + savings math', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'free');
    await mockPulseEndpoint(page, SEEDED_RESPONSE);

    await page.goto('/admin');

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText('Maya');
    await expect(card).toContainText('James');
    await expect(card).toContainText('Lin');
    await expect(card).toContainText('$29.97');
    await expect(card).toContainText('$49.99');
  });

  test('Maybe later hides the card on the current page', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'free');
    await mockPulseEndpoint(page, SEEDED_RESPONSE);
    await mockSnoozeEndpoint(page);

    await page.goto('/admin');
    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /maybe later/i }).click();
    await expect(card).toHaveCount(0);
  });

  test('Show me Organization routes to the preview page', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'free');
    await mockPulseEndpoint(page, SEEDED_RESPONSE);

    await page.goto('/admin');
    const link = page.locator(CARD).getByRole('link', { name: /show me organization/i });
    await expect(link).toBeVisible();
    expect(await link.getAttribute('href')).toBe('/admin/preview-organization');
  });

  test('a non-eligible org (no paid coaches) does not see the card', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'free');
    await mockPulseEndpoint(page, {
      ...SEEDED_RESPONSE,
      programTierState: {
        paidCoachCount: 0,
        paidCoachFirstNames: [],
        monthlySpendCents: 0,
        orgUpgradeSavingsCents: -4999,
        eligibleForOrgUpgrade: false,
      },
    });

    await page.goto('/admin');
    await expect(page.locator(CARD)).toHaveCount(0);
  });
});
