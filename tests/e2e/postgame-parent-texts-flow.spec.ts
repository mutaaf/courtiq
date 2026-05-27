/**
 * E2E: post-game parent texts on the game session page (ticket 0048).
 *
 * The authed coach navigates to a seeded GAME session, sees the new
 * "Post-game parent texts" card under the game recap, taps "Generate parent
 * texts", and the per-player rows render inline with one Copy button per row.
 *
 * Two surface assertions:
 *  - on a GAME session the card and button appear (and after the mocked POST
 *    fulfils, one row per seeded player renders).
 *  - on a PRACTICE session the card is absent — the analog there is the 0046
 *    sideline cheat sheet on /home.
 *
 * The seeded /api/ai/postgame-parent-texts is mocked here — the load-bearing
 * CI proof (server-side persistence + tier gate + COPPA boundary) is the
 * seeded vitest suite under tests/ai/. This spec proves the UI surface
 * assembles around the route's response and that one row per seeded player
 * renders.
 *
 * Per LESSONS#0081 the card + rows carry stable data-testid attributes so the
 * strict-mode locators stay scoped (the session page has many "Generate …"
 * buttons across surfaces).
 *
 * Skips when E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset.
 */
import { test, expect } from '@playwright/test';
import {
  signInViaUI,
  mockMeEndpoint,
  mockDataEndpoint,
  mockMutateEndpoint,
} from './helpers/auth';

const POSTGAME_RESPONSE = {
  planId: 'plan-postgame-e2e-1',
  content_structured: {
    session_id: '00000000-0000-4000-a000-000000000042',
    entries: [
      {
        player_id: 'player-e2e-001',
        player_first_name: 'Alice',
        text_message: "Alice's defense in the second half was the difference today; she boxed out twice in a row.",
      },
      {
        player_id: 'player-e2e-002',
        player_first_name: 'Bob',
        text_message: 'Bob was first to dive for the loose ball today and held his position all four quarters.',
      },
    ],
  },
  interactionId: 'ai-int-postgame-e2e-1',
};

const GAME_SESSION_ID = '00000000-0000-4000-a000-000000000042';

test.describe('Post-game parent texts on the game session page (ticket 0048)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;

    await mockMeEndpoint(page);
    await mockDataEndpoint(page);
    await mockMutateEndpoint(page);

    await page.route('**/api/ai/postgame-parent-texts', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(POSTGAME_RESPONSE),
      }),
    );
  });

  test('on a GAME session, the card renders and the per-player rows show after tapping Generate', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    // Game session — seeded as type='game' in tests/e2e/fixtures/seed.sql
    // (id ending in …042). The session page renders the postgame card only
    // when session.type === 'game' (game-only by design — the practice
    // analog is the 0046 sideline sheet on /home).
    await page.goto(`/sessions/${GAME_SESSION_ID}`);

    const card = page.getByTestId('postgame-parent-texts');
    await expect(card).toBeVisible({ timeout: 10000 });

    // Scope the button by testid (LESSONS#0081) so the strict-mode locator
    // does not collide with other "Generate …" buttons on the session page.
    const generateBtn = page.getByTestId('postgame-parent-texts-button');
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
    await generateBtn.click();

    const entries = page.getByTestId('postgame-parent-texts-entries');
    await expect(entries).toBeVisible({ timeout: 5000 });

    const rows = page.getByTestId(/^postgame-parent-texts-row-/);
    await expect(rows).toHaveCount(POSTGAME_RESPONSE.content_structured.entries.length);

    await expect(card).toContainText(/Alice/);
    await expect(card).toContainText(/defense in the second half/i);
    await expect(card).toContainText(/Bob/);
    await expect(card).toContainText(/loose ball/i);
  });

  test('on a PRACTICE session, the card is ABSENT (the analog is the 0046 sideline sheet on /home)', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    // Practice session — seeded as type='practice' (id ending in …040).
    // The page must NOT render the postgame card. We give the page a few
    // seconds to mount before asserting absence so we are not racing the
    // initial render.
    const PRACTICE_SESSION_ID = '00000000-0000-4000-a000-000000000040';
    await page.goto(`/sessions/${PRACTICE_SESSION_ID}`);

    // Wait for some other persistent surface on the session page so we know
    // the page mounted before asserting the postgame card is absent.
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('postgame-parent-texts')).toHaveCount(0);
    await expect(page.getByTestId('postgame-parent-texts-button')).toHaveCount(0);
  });
});
