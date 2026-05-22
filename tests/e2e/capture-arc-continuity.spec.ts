/**
 * E2E: the active Practice Arc continuity line on /capture (ticket 0020).
 *
 * Follows the same convention as capture-usage-meter.spec.ts and
 * capture-carryover.spec.ts:
 *  - /capture is a middleware-protected route — without real auth cookies it
 *    redirects to /login, so these specs sign in via the UI and test.skip() when
 *    E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (the PR-gating CI runner).
 *  - We mock GET /api/ai/practice-arc/active (and /api/me, /api/data, /api/ai/usage)
 *    so the page renders deterministically without depending on seeded DB state.
 *
 * The CI-gating proof for the line's UI states is the component vitest suite in
 * tests/components/arc-continuity-line.test.tsx; these specs guard the live page
 * wiring (the real useQuery → /api/ai/practice-arc/active read) whenever creds are
 * supplied. The endpoint itself is NOT modified (ticket 0018 owns it).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH, TEST_TEAM } from './helpers/auth';

const ARC = '[data-testid="arc-continuity-line"]';
const METER = '[data-testid="ai-usage-meter"]';

/** The real GET /api/ai/practice-arc/active shape (snake_case arc_title). */
const SEEDED_ACTIVE_ARC = {
  active: {
    arc_title: 'Defense Arc',
    total_sessions: 3,
    currentSessionNumber: 2,
    currentSession: {
      session_number: 2,
      theme: 'Help defense',
      key_coaching_point: 'build on closeouts',
      carries_forward: 'keep hands active on the closeout',
    },
    priorSession: { session_number: 1, key_coaching_point: 'stay in a stance' },
    progression_note: 'Layer help onto last week’s on-ball work.',
  },
};

async function mockArcEndpoint(
  page: import('@playwright/test').Page,
  payload: unknown,
  status = 200,
) {
  await page.route('**/api/ai/practice-arc/active*', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
  );
}

async function mockMeWithTier(page: import('@playwright/test').Page, tier: string) {
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

test.describe('Capture Practice Arc continuity line (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockDataEndpoint(page, { players: [] });
  });

  // AC1: seeded active arc → continuity line visible with "session N of M" + title.
  test('shows the arc continuity line with session count and title for an active arc', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'coach');
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unlimited: true, tier: 'coach' }) })
    );
    await mockArcEndpoint(page, SEEDED_ACTIVE_ARC);

    await page.goto('/capture');
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible();
    const line = page.locator(ARC);
    await expect(line).toBeVisible();
    await expect(line).toContainText(/session 2 of 3/i);
    await expect(line).toContainText('Defense Arc');
    // The carried-forward coaching point is surfaced.
    await expect(line).toContainText('build on closeouts');
  });

  // AC2: no active arc ({ active: null }) → line absent; record control operable.
  test('no continuity line when there is no active arc; record button stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'coach');
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unlimited: true, tier: 'coach' }) })
    );
    await mockArcEndpoint(page, { active: null });

    await page.goto('/capture');
    await expect(page.locator(ARC)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });

  // AC3: arc read fails → line absent; record button stays enabled and operable.
  test('continuity line absent when the arc read fails — record button stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'coach');
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unlimited: true, tier: 'coach' }) })
    );
    await mockArcEndpoint(page, { error: 'boom' }, 500);

    await page.goto('/capture');
    await expect(page.locator(ARC)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });

  // AC5: the line is dismissible for the session.
  test('the continuity line can be dismissed and stays hidden', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'coach');
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unlimited: true, tier: 'coach' }) })
    );
    await mockArcEndpoint(page, SEEDED_ACTIVE_ARC);

    await page.goto('/capture');
    const line = page.locator(ARC);
    await expect(line).toBeVisible();
    await page.getByRole('button', { name: /dismiss practice arc reminder/i }).click();
    await expect(line).toHaveCount(0);
  });

  // AC6 (regression): the free-tier usage meter (0008) and the arc line coexist —
  // both present together, neither displaces the other.
  test('the free-tier usage meter and the arc line render together', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'free');
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ used: 2, limit: 5, tier: 'free', remaining: 3 }) })
    );
    await mockArcEndpoint(page, SEEDED_ACTIVE_ARC);

    await page.goto('/capture');
    await expect(page.locator(ARC)).toBeVisible();
    await expect(page.locator(METER)).toContainText(/\d+ of 5/);
  });
});
