/**
 * E2E: the director-private "program pulse" card on the admin surface (ticket 0028).
 *
 * Follows the weekly-digest-flow.spec.ts convention:
 *  - /admin is a middleware-protected route — without real auth cookies it
 *    redirects to /login, so these specs sign in via the UI and test.skip() when
 *    E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (the PR-gating CI runner).
 *  - We mock /api/me (to drive the org tier + admin role into the client) and
 *    POST /api/ai/program-pulse so the page renders deterministically without a
 *    live AI call. The endpoint is server-backed; the CI-gating proof for the
 *    card's UI states is the component vitest suite in
 *    tests/components/program-pulse-card.test.tsx + the route suite in
 *    tests/ai/program-pulse.test.ts. The seed (tests/e2e/fixtures/seed.sql) adds
 *    an Organization-tier org with an admin coach + several coaches + a week of
 *    sessions/observations so the un-mocked endpoint ALSO resolves deterministically.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH } from './helpers/auth';

const CARD = '[data-testid="program-pulse-card"]';

/** The real POST /api/ai/program-pulse shape ({ pulse }). */
const SEEDED_PULSE = {
  pulse: {
    week_summary: 'Last week — 2 of 3 coaches logged notes, 3 practices across the program.',
    active_coaches: 2,
    total_coaches: 3,
    teams_to_watch: [
      { team_name: 'Program U12s', note: 'Plenty of needs-work notes worth a check-in.' },
    ],
    next_action: {
      label: 'Nudge Coach Quiet — no notes logged this week',
      kind: 'nudge_coach',
      rationale: 'Coach Quiet has not logged any activity this week.',
    },
  },
};

async function mockPulseEndpoint(
  page: import('@playwright/test').Page,
  payload: unknown,
  status = 200,
) {
  await page.route('**/api/ai/program-pulse', (route) =>
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
}

test.describe('Program pulse card on /admin (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockDataEndpoint(page, {});
  });

  // AC (Playwright): an org-admin on an Organization-tier org sees the program-pulse
  // card with the week summary and a next-action button.
  test('an org admin on the Organization tier sees the program-pulse card with the summary and a next-action button', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockPulseEndpoint(page, SEEDED_PULSE);

    await page.goto('/admin');

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText(/2 of 3 coaches/i);
    await expect(card.getByRole('link', { name: /nudge coach quiet/i })).toBeVisible();
  });

  // AC (Playwright): a non-admin org coach does NOT see the card.
  test('a non-admin org coach does not see the program-pulse card', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'coach', 'organization');
    // Even if the endpoint would return a pulse, a non-admin never sees the card.
    await mockPulseEndpoint(page, SEEDED_PULSE);

    await page.goto('/admin');
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  // AC (Playwright): a non-org-tier coach (admin role but not Organization tier)
  // does NOT see the card — the surface is Organization-tier only.
  test('an admin on a non-organization tier does not see the program-pulse card', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'pro_coach');
    await mockPulseEndpoint(page, SEEDED_PULSE);

    await page.goto('/admin');
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  // AC (best-effort): when the pulse read fails, the admin screen renders normally
  // and the card is absent — the pulse never blocks the page.
  test('admin renders normally and the pulse card is absent when the read fails', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockPulseEndpoint(page, { error: 'boom' }, 500);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible({ timeout: 10000 });
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  // AC (best-effort): a quiet week ({ pulse: null }) → card absent, admin normal.
  test('a quiet week with a null pulse shows no card and a normal admin screen', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockPulseEndpoint(page, { pulse: null });

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible({ timeout: 10000 });
    await expect(page.locator(CARD)).toHaveCount(0);
  });
});
