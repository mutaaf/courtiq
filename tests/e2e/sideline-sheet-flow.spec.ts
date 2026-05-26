/**
 * E2E: sideline cheat sheet (ticket 0046).
 *
 * The authed coach navigates to /home, sees the new sideline-cheat-sheet card,
 * taps "Generate sideline cheat sheet", and the per-player rows render inline.
 * The sheet is rendered by mocking /api/ai/sideline-talking-points — the
 * load-bearing CI proof (server-side persistence + tier gate + COPPA boundary)
 * is the seeded vitest suite under tests/ai/. This spec proves the UI surface
 * assembles around the route's response and that one row per seeded player
 * renders.
 *
 * Per LESSONS#0081 the card + rows carry stable data-testid attributes so the
 * strict-mode locators stay scoped (the home page has many "Generate …"
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

const SIDELINE_RESPONSE = {
  planId: 'plan-sideline-e2e-1',
  content_structured: {
    team_id: 'team-e2e-test-001',
    entries: [
      {
        player_id: 'player-e2e-001',
        player_first_name: 'Alice',
        lead_line: 'Closeouts have come a long way — mention her hustle on Tuesday.',
        working_on_line: 'We are working on her finishing with contact.',
      },
      {
        player_id: 'player-e2e-002',
        player_first_name: 'Bob',
        lead_line: 'First to dive for the loose ball this week.',
        working_on_line: 'We are working on holding his position on rebounds.',
      },
    ],
  },
  interactionId: 'ai-int-sideline-e2e-1',
};

test.describe('Sideline cheat sheet from /home (ticket 0046)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;

    await mockMeEndpoint(page);
    await mockDataEndpoint(page);
    await mockMutateEndpoint(page);

    await page.route('**/api/ai/sideline-talking-points', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SIDELINE_RESPONSE),
      }),
    );
  });

  test('coach taps Generate sideline cheat sheet and one row per player renders', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    await page.goto('/home');

    const card = page.getByTestId('sideline-cheat-sheet-card');
    await expect(card).toBeVisible({ timeout: 10000 });

    // Scope the button by testid (LESSONS#0081) so the strict-mode locator
    // does not collide with other "Generate …" buttons on the home page.
    const generateBtn = page.getByTestId('sideline-cheat-sheet-button');
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
    await generateBtn.click();

    const entries = page.getByTestId('sideline-cheat-sheet-entries');
    await expect(entries).toBeVisible({ timeout: 5000 });

    const rows = page.getByTestId('sideline-cheat-sheet-row');
    await expect(rows).toHaveCount(SIDELINE_RESPONSE.content_structured.entries.length);

    await expect(card).toContainText(/Alice/);
    await expect(card).toContainText(/closeouts have come a long way/i);
    await expect(card).toContainText(/finishing with contact/i);
    await expect(card).toContainText(/Bob/);
    await expect(card).toContainText(/loose ball/i);
  });
});
