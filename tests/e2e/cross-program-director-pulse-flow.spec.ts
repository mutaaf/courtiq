/**
 * E2E: the director-side cross-program peer pulse line on /admin
 * (ticket 0077).
 *
 * Mirrors program-pulse-flow.spec.ts + emergent-focus-flow.spec.ts:
 *  - /admin is middleware-protected. We sign in via the UI and
 *    test.skip() when E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset
 *    (the PR-gating CI runner has no creds).
 *  - We mock /api/me (admin role + organization tier) and the
 *    cross-program-pulse endpoint so the line renders deterministically.
 *  - The seed (tests/e2e/fixtures/seed.sql, ticket 0077 block) pre-mints
 *    TWO neighboring basketball programs each with plans on
 *    `skills_targeted = '{transitions}'` so the un-mocked endpoint also
 *    resolves a real pulse when authed creds point at the existing
 *    Organization-tier program.
 *
 * Per LESSONS#0029 / #0082, every assertion is scoped to the
 * data-testid so the seeded E2E director's first name cannot strict-
 * mode-collide with team / program strings.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH } from './helpers/auth';

const LINE = '[data-testid="cross-program-director-pulse-line"]';

/** The real GET /api/program/cross-program-pulse shape. */
const SEEDED_PULSE = {
  topSkill: 'transitions',
  neighborPrograms: [
    {
      org_id: 'org-riverside',
      org_name: 'Riverside Basketball',
      practice_count: 7,
      director_first_name: 'Anna',
      director_contact_email: 'anna@riverside.test',
    },
    {
      org_id: 'org-westview',
      org_name: 'Westview Hoops',
      practice_count: 5,
      director_first_name: 'Ben',
      director_contact_email: 'ben@westview.test',
    },
  ],
};

async function mockCrossProgramEndpoint(
  page: import('@playwright/test').Page,
  payload: unknown,
  status = 200,
) {
  await page.route('**/api/program/cross-program-pulse*', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) }),
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
  // The admin page also lists coaches; keep deterministic.
  await page.route('**/api/admin/coaches', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ coaches: [], teams: [] }) }),
  );
  // The 0028 pulse + 0071 emergent-focus cards live next door — return null
  // so their cards are absent and never collide with the 0077 assertions.
  await page.route('**/api/ai/program-pulse', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pulse: null }) }),
  );
  await page.route('**/api/org/emergent-focus*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ focuses: [] }) }),
  );
}

test.describe('Cross-program director pulse line on /admin (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockDataEndpoint(page, {});
  });

  // AC (Playwright a): org admin sees the line with both seeded program
  // names + "transitions" + aggregated practice count + visible Invite
  // button.
  test('an org admin sees the cross-program pulse line with both program names and an Invite button', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockCrossProgramEndpoint(page, SEEDED_PULSE);

    await page.goto('/admin');

    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await expect(line).toContainText('Riverside Basketball');
    await expect(line).toContainText('Westview Hoops');
    await expect(line).toContainText('transitions');
    await expect(line).toContainText('12'); // 7 + 5

    const invite = line.getByRole('button', { name: /Invite the Riverside Basketball director/i });
    await expect(invite).toBeVisible();
  });

  // AC (Playwright d): when the endpoint returns empty neighborPrograms,
  // the line is ABSENT and the admin surface renders normally.
  test('a quiet week with empty neighborPrograms shows no line and a normal admin screen', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockCrossProgramEndpoint(page, { topSkill: null, neighborPrograms: [] });

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible({ timeout: 10000 });
    await expect(page.locator(LINE)).toHaveCount(0);
  });

  // AC (Playwright): a non-admin org coach does NOT see the line.
  test('a non-admin org coach does not see the cross-program pulse line', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'coach', 'organization');
    await mockCrossProgramEndpoint(page, SEEDED_PULSE);

    await page.goto('/admin');
    await expect(page.locator(LINE)).toHaveCount(0);
  });

  // AC (best-effort): a read failure → line absent + admin screen normal.
  test('admin renders normally and the line is absent when the read fails', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithRoleTier(page, 'admin', 'organization');
    await mockCrossProgramEndpoint(page, { error: 'boom' }, 500);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible({ timeout: 10000 });
    await expect(page.locator(LINE)).toHaveCount(0);
  });
});
