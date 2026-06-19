/**
 * E2E: the sport-wide convergence line on /capture (ticket 0091).
 *
 * Mirrors cross-program-focus-flow.spec.ts (the 0075 sibling):
 *   - Requires real auth cookies (signs in via UI); test.skip() when
 *     E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (PR-gating CI runner).
 *   - Mocks /api/sport/emergent-focus AND /api/sport-wide-convergence
 *     so the UI renders deterministically without relying on seeded DB
 *     state. The unit-test + component suite already gates CI on the
 *     route / helper / component contracts; this spec guards the page
 *     wiring (useQuery → line visibility → overlay tap).
 *
 * The full 25-org seeded fixture variant the ticket prose names is the
 * structural truth the route reads against in production; the e2e here
 * stubs at the API boundary so the test stays deterministic across
 * future seed reshuffles. The migration test + the API unit test cover
 * the SQL + helper paths against real fixtures.
 *
 * .spec.ts is the Playwright glob — distinct from the vitest `.test.ts`
 * glob (LESSONS#0038).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH, TEST_TEAM } from './helpers/auth';

const LINE = '[data-testid="sport-wide-convergence-line"]';
const OVERLAY = '[data-testid="sport-wide-convergence-overlay"]';
const COUNT_TRIGGER = '[data-testid="sport-wide-convergence-count-trigger"]';

async function mockSportWideEndpoint(
  page: import('@playwright/test').Page,
  payload: {
    eligible: boolean;
    distinctProgramCount: number;
    totalPlanCount: number;
    namedPrograms: Array<{
      orgId: string;
      programName: string;
      directorFirstName: string;
      planCount: number;
      ageGroupsServed: string[];
    }>;
    eligibilityReason?: string;
  },
) {
  await page.route('**/api/sport-wide-convergence*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    }),
  );
}

async function mockSibling0075(
  page: import('@playwright/test').Page,
  skill = 'closeouts',
) {
  // The new line depends on the 0075 line firing first (the queried
  // skill is the 0075 focus.skill). Mock 0075 to surface a focus.
  await page.route('**/api/sport/emergent-focus*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        focus: {
          skill,
          distinctProgramCount: 3,
          drill: null,
        },
      }),
    }),
  );
}

async function mockMeWithTier(page: import('@playwright/test').Page, tier = 'coach') {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coach: { ...TEST_COACH, organizations: { id: TEST_COACH.org_id, tier } },
        teams: [TEST_TEAM],
      }),
    }),
  );
}

test.describe('Capture sport-wide convergence line (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockMeWithTier(page);
    await mockDataEndpoint(page, { players: [] });
    // Silence sibling Capture reads so they don't interfere.
    await page.route('**/api/capture/carryover*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ focus: [] }) }),
    );
    await page.route('**/api/ai/practice-arc/active*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: null }) }),
    );
    await page.route('**/api/org/weekly-focus*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ focus: null }) }),
    );
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unlimited: true, tier: 'coach' }) }),
    );
  });

  // AC: with 25 programs + 2 named directors → the line renders with
  // the program names, director names, count, and the sport name.
  test('eligible payload with 2 named programs → line renders with names + counts', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockSibling0075(page);
    await mockSportWideEndpoint(page, {
      eligible: true,
      distinctProgramCount: 25,
      totalPlanCount: 6,
      namedPrograms: [
        {
          orgId: 'org-hawks',
          programName: 'Hawks Basketball',
          directorFirstName: 'Riya',
          planCount: 4,
          ageGroupsServed: ['U10', 'U12'],
        },
        {
          orgId: 'org-riverside',
          programName: 'Riverside U10',
          directorFirstName: 'Ben',
          planCount: 2,
          ageGroupsServed: ['U10'],
        },
      ],
    });

    await page.goto('/capture');
    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await expect(line).toContainText('Hawks Basketball');
    await expect(line).toContainText('Riya');
    await expect(line).toContainText('Riverside U10');
    await expect(line).toContainText('Ben');
    await expect(line).toContainText('25');
    await expect(line).toContainText('6');
  });

  // AC: tapping the count phrase opens the overlay listing the named
  // programs with their plan count + age groups.
  test('tapping the count phrase opens the overlay with the named programs', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockSibling0075(page);
    await mockSportWideEndpoint(page, {
      eligible: true,
      distinctProgramCount: 25,
      totalPlanCount: 6,
      namedPrograms: [
        {
          orgId: 'org-hawks',
          programName: 'Hawks Basketball',
          directorFirstName: 'Riya',
          planCount: 4,
          ageGroupsServed: ['U10'],
        },
        {
          orgId: 'org-riverside',
          programName: 'Riverside U10',
          directorFirstName: 'Ben',
          planCount: 2,
          ageGroupsServed: ['U10'],
        },
      ],
    });

    await page.goto('/capture');
    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    await page.locator(COUNT_TRIGGER).click();
    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Hawks Basketball');
    await expect(overlay).toContainText('Riverside U10');
    await expect(overlay).toContainText('U10');
  });

  // AC: a below-bar payload → line absent → Capture byte-identical.
  test('eligible: false → line absent, capture byte-identical', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockSibling0075(page);
    await mockSportWideEndpoint(page, {
      eligible: false,
      distinctProgramCount: 10,
      totalPlanCount: 20,
      namedPrograms: [],
      eligibilityReason: 'too_few_programs',
    });

    await page.goto('/capture');
    await expect(page.locator(LINE)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });

  // AC: a failed read leaves the line absent — capture is never blocked.
  test('line absent when /api/sport-wide-convergence fails — record button stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockSibling0075(page);
    await page.route('**/api/sport-wide-convergence*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
    );

    await page.goto('/capture');
    await expect(page.locator(LINE)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });
});
