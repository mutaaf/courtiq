/**
 * E2E: the cross-program emergent-focus line on /capture (ticket 0075).
 *
 * Mirrors capture-carryover.spec.ts:
 *   - Requires real auth cookies (signs in via UI); test.skip() when
 *     E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (PR-gating CI runner).
 *   - Mocks /api/sport/emergent-focus and the 0064 clone POST so the UI
 *     renders deterministically without relying on seeded DB state.
 *
 * The unit-test suite (tests/api/sport-emergent-focus.test.ts +
 * tests/components/cross-program-focus-line.test.tsx) gates CI on the
 * route + component contracts; this spec guards the page wiring
 * (useQuery → line visibility → clone POST) whenever creds are supplied.
 *
 * .spec.ts is the Playwright glob — distinct from the vitest `.test.ts`
 * glob (LESSONS#0038).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint, mockDataEndpoint, TEST_COACH, TEST_TEAM } from './helpers/auth';

const LINE = '[data-testid="cross-program-focus-line"]';

async function mockCrossProgramEndpoint(
  page: import('@playwright/test').Page,
  payload: {
    focus:
      | {
          skill: string;
          distinctProgramCount: number;
          drill: {
            sourceDrillShareId: string;
            name: string;
            duration_minutes: number | null;
            setup_lines: string[];
          } | null;
        }
      | null;
  },
) {
  await page.route('**/api/sport/emergent-focus*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
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
    })
  );
}

test.describe('Capture cross-program focus line (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockMeWithTier(page);
    await mockDataEndpoint(page, { players: [] });
    // Silence sibling Capture reads so they don't interfere with the line.
    await page.route('**/api/capture/carryover*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ focus: [] }) })
    );
    await page.route('**/api/ai/practice-arc/active*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: null }) })
    );
    await page.route('**/api/org/weekly-focus*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ focus: null }) })
    );
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unlimited: true, tier: 'coach' }) })
    );
  });

  // AC: coach on a sport with cross-program convergence sees the line with
  // the seeded skill + sport + drill name + duration + a Save button.
  test('coach with cross-program convergence sees the line with skill, drill and a Save button', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockCrossProgramEndpoint(page, {
      focus: {
        skill: 'closeouts',
        distinctProgramCount: 3,
        drill: {
          sourceDrillShareId: 'share-e2e-001',
          name: 'Live closeout 1-on-1',
          duration_minutes: 8,
          setup_lines: ['Defender starts at the rim.'],
        },
      },
    });

    await page.goto('/capture');
    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await expect(line).toContainText(/three coaches/i);
    await expect(line).toContainText('closeouts');
    await expect(line).toContainText('Live closeout 1-on-1');
    await expect(line.getByRole('button', { name: /save to my drills/i })).toBeVisible();
  });

  // AC: tapping Save fires the 0064 clone POST with the seeded
  // sourceDrillShareId and the button updates to "Saved".
  test('tapping Save fires the 0064 clone POST and the button flips to Saved', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockCrossProgramEndpoint(page, {
      focus: {
        skill: 'closeouts',
        distinctProgramCount: 3,
        drill: {
          sourceDrillShareId: 'share-e2e-001',
          name: 'Live closeout 1-on-1',
          duration_minutes: 8,
          setup_lines: ['Defender starts at the rim.'],
        },
      },
    });
    let cloneCalledWith: string | null = null;
    await page.route('**/api/drill-shares/*/clone', async (route) => {
      cloneCalledWith = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ alreadyFavorited: false }),
      });
    });

    await page.goto('/capture');
    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await line.getByRole('button', { name: /save to my drills/i }).click();

    await expect.poll(() => cloneCalledWith).not.toBeNull();
    expect(String(cloneCalledWith)).toContain('share-e2e-001');

    await expect(line.getByRole('button', { name: /^saved$/i })).toBeDisabled();
  });

  // AC: coach on a sport with NO cross-program convergence sees no line.
  // The 0014 carryover surface and the record button stay operable.
  test('coach on a sport with no convergence sees no line — Capture is byte-identical', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockCrossProgramEndpoint(page, { focus: null });

    await page.goto('/capture');
    await expect(page.locator(LINE)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });

  // AC: a failed read leaves the line absent — capture is never blocked.
  test('line absent when /api/sport/emergent-focus fails — record button stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await page.route('**/api/sport/emergent-focus*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
    );

    await page.goto('/capture');
    await expect(page.locator(LINE)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });
});
