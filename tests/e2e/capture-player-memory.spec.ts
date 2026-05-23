/**
 * E2E: the per-player capture memory line on /capture (ticket 0025).
 *
 * Follows the same convention as capture-carryover.spec.ts / capture-usage-meter.spec.ts:
 *  - Requires real auth cookies (signs in via UI); test.skip() when
 *    E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (PR-gating CI runner).
 *  - Mocks /api/capture/player-memory (and /api/me, /api/data, the sibling
 *    capture reads) so the UI renders deterministically without relying on the
 *    exact seeded DB state at the time of the run.
 *
 * The unit-test suite (tests/capture/player-memory.test.ts) gates CI on the route
 * contract and tests/components/player-memory-line.test.tsx gates the render
 * states; these specs guard the page wiring (focused playerId → useQuery → line
 * visibility) whenever creds are supplied.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH, TEST_TEAM, TEST_PLAYERS } from './helpers/auth';

const LINE = '[data-testid="player-memory-line"]';

const PLAYER_WITH_HISTORY = TEST_PLAYERS[0].id; // Alice Walker
const PLAYER_NO_HISTORY = TEST_PLAYERS[1].id; // Bob Carter

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

/** Route /api/capture/player-memory per focused playerId so switching focus updates the line. */
async function mockPlayerMemory(page: import('@playwright/test').Page) {
  await page.route('**/api/capture/player-memory*', (route) => {
    const url = new URL(route.request().url());
    const playerId = url.searchParams.get('playerId');
    if (playerId === PLAYER_WITH_HISTORY) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lastNeedsWork: 'hesitated on closeouts',
          lastPositive: 'first one back on defense',
          observedAt: '2026-05-09T10:00:00.000Z',
        }),
      });
    }
    // No history for anyone else.
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lastNeedsWork: null, lastPositive: null }),
    });
  });
}

test.describe('Capture per-player memory line (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockMeWithTier(page);
    await mockDataEndpoint(page, { players: TEST_PLAYERS, observations: [] });
    // Silence the sibling best-effort capture reads so they don't interfere.
    await page.route('**/api/ai/usage', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unlimited: true, tier: 'coach' }) })
    );
    await page.route('**/api/capture/carryover*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ focus: [] }) })
    );
    await page.route('**/api/ai/practice-arc/active*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: null }) })
    );
  });

  // AC6: focusing a player with prior needs-work shows the line near the record
  // control; switching focus to a player with no history hides it.
  test('shows the memory line for a player with history and updates on focus switch', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockPlayerMemory(page);

    await page.goto(`/capture?playerId=${PLAYER_WITH_HISTORY}`);
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible();
    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await expect(line).toContainText('hesitated on closeouts');

    // Switch focus to a player with no prior observations — the line disappears.
    await page.goto(`/capture?playerId=${PLAYER_NO_HISTORY}`);
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible();
    await expect(page.locator(LINE)).toHaveCount(0);
  });

  // AC7 (page-wiring half): a player with no prior observations shows NO line and
  // the record button stays operable.
  test('player with no prior observations shows no memory line and record stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockPlayerMemory(page);

    await page.goto(`/capture?playerId=${PLAYER_NO_HISTORY}`);
    await expect(page.locator(LINE)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });

  // AC7 (degrade-silently half): when the memory read fails, the line is absent
  // and the record button stays enabled — capture never waits on this read.
  test('memory line absent when /api/capture/player-memory fails — record stays operable', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await page.route('**/api/capture/player-memory*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
    );

    await page.goto(`/capture?playerId=${PLAYER_WITH_HISTORY}`);
    await expect(page.locator(LINE)).toHaveCount(0);
    const record = page.getByRole('button', { name: /record/i });
    await expect(record).toBeVisible();
    await expect(record).toBeEnabled();
  });
});
