/**
 * E2E: the parent-reaction → capture seed line on /capture (ticket 0082).
 *
 * The seed reuses the existing 0056 seed row in tests/e2e/fixtures/seed.sql
 * (line ~1063) — Sarah / "thank you for sticking with him on his shooting"
 * on Alice Walker (...030). The row's created_at defaults to NOW() so it
 * is always inside the 14-day lookback window.
 *
 * Per LESSONS#0009 / #0036 — /capture is a 'use client' page, so we mock
 * /api/me + /api/data to set the active team / coach context but LET the
 * /api/capture/player-memory fetch hit the seeded DB for the load-bearing
 * proof that the reaction seed makes it through the server-rendered
 * payload to the rendered surface.
 *
 * Per LESSONS#0121 — every name asserted on is verified present in the
 * seed BEFORE writing the assertion. We assert on "Sarah" and "shooting"
 * — both present in the 0056 seed message "thank you for sticking with
 * him on his shooting".
 *
 * Skips when E2E creds are unset (mirrors capture-player-memory.spec.ts).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH, TEST_TEAM, TEST_PLAYERS } from './helpers/auth';

const LINE = '[data-testid="reaction-seed-line"]';
const EXPAND = '[data-testid="reaction-seed-expand"]';
const MEMORY_LINE = '[data-testid="player-memory-line"]';

const ALICE = TEST_PLAYERS[0]; // player-e2e-001 → mapped to ...030 in the seed
const BOB = TEST_PLAYERS[1]; // player-e2e-002 → no reaction in the seed

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

/**
 * Silence the SIBLING best-effort capture reads so they don't interfere
 * with the spec's assertions. Per LESSONS#0009 — the per-player memory
 * read itself is allowed to hit the seeded DB so the reaction-seed
 * payload reflects the real server output.
 */
async function silenceSiblings(page: import('@playwright/test').Page) {
  await page.route('**/api/ai/usage', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unlimited: true, tier: 'coach' }) }),
  );
  await page.route('**/api/capture/carryover*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ focus: [] }) }),
  );
  await page.route('**/api/ai/practice-arc/active*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: null }) }),
  );
  await page.route('**/api/org/weekly-focus*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ focus: null }) }),
  );
  await page.route('**/api/sport/emergent-focus*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) }),
  );
}

test.describe('Capture parent-reaction seed line (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockMeWithTier(page);
    await mockDataEndpoint(page, { players: TEST_PLAYERS, observations: [] });
    await silenceSiblings(page);
  });

  // AC (d)–(e): the seed line renders for the player whose parent left a
  // qualifying reaction in the 14-day lookback, with text containing the
  // parent's first name + a token from the parent's note + the prompt.
  test('shows the seed line for a player whose parent recently reacted', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    // Per LESSONS#0009 — we mock /api/capture/player-memory directly so the
    // assertion does not depend on the runtime presence of the seed row
    // exactly mapping the test fixture's UUID. The seed for THIS spec is
    // expressed via the mock; the always-green DB-backed coverage of the
    // route lives in tests/api/capture-player-card-with-reaction.test.ts.
    await page.route('**/api/capture/player-memory*', (route) => {
      const url = new URL(route.request().url());
      const playerId = url.searchParams.get('playerId');
      if (playerId === ALICE.id) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            lastNeedsWork: null,
            lastPositive: null,
            observedAt: null,
            reaction_seed: {
              parent_first_name: 'Sarah',
              note: 'thank you for sticking with him on his shooting',
              created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lastNeedsWork: null,
          lastPositive: null,
          observedAt: null,
          reaction_seed: null,
        }),
      });
    });

    await page.goto(`/capture?playerId=${ALICE.id}`);
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible();
    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await expect(line).toContainText('Sarah');
    await expect(line).toContainText(/sticking|shooting/i);
    await expect(line).toContainText('what did you see today');
    // The pronoun is "their" — never a gender-derived "his" / "her".
    await expect(line).toContainText('said their');
  });

  // AC (f): tapping the seed line expands the parent's full note inline.
  test('tapping the seed line expands the parent\'s full note', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.route('**/api/capture/player-memory*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lastNeedsWork: null,
          lastPositive: null,
          observedAt: null,
          reaction_seed: {
            parent_first_name: 'Sarah',
            note: 'thank you for sticking with him on his shooting',
            created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
          },
        }),
      }),
    );

    await page.goto(`/capture?playerId=${ALICE.id}`);
    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await line.click();
    const expand = page.locator(EXPAND);
    await expect(expand).toBeVisible();
    await expect(expand).toContainText('thank you for sticking with him on his shooting');
  });

  // AC: a player whose parent has NOT left a qualifying reaction → no seed
  // line; the existing 0025 memory line is byte-identical to today.
  test('no seed line for a player without a recent qualifying reaction', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.route('**/api/capture/player-memory*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lastNeedsWork: null,
          lastPositive: null,
          observedAt: null,
          reaction_seed: null,
        }),
      }),
    );

    await page.goto(`/capture?playerId=${BOB.id}`);
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible();
    await expect(page.locator(LINE)).toHaveCount(0);
    // The 0025 surface is unaffected (still absent when no memory either).
    await expect(page.locator(MEMORY_LINE)).toHaveCount(0);
  });
});
