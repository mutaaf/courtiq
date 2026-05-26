/**
 * E2E: pre-game brief (ticket 0040).
 *
 * The authed coach navigates to /plans, opens a saved opponent profile, taps
 * "Generate pre-game brief", and the four-block brief renders inline. The brief
 * is rendered by mocking /api/ai/pregame-brief — the load-bearing CI proof
 * (server-side persistence + tier gate + COPPA boundary) is the seeded vitest
 * suite under tests/ai/. This spec proves the UI surface assembles around the
 * route's response and that the four output blocks render.
 *
 * Skips when E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (the coach-card / share
 * specs follow the same skip pattern).
 */
import { test, expect } from '@playwright/test';
import {
  signInViaUI,
  mockMeEndpoint,
  mockDataEndpoint,
  mockMutateEndpoint,
} from './helpers/auth';

const OPPONENT_PROFILE_PLAN = {
  id: 'plan-opp-e2e-1',
  team_id: 'team-e2e-test-001',
  coach_id: 'coach-e2e-test-001',
  type: 'opponent_profile',
  title: 'Riverside Hawks',
  content: '{}',
  content_structured: {
    name: 'Riverside Hawks',
    strengths: ['fast breaks', 'press defense'],
    weaknesses: ['weak perimeter shooting'],
    key_players: ['#23 tall center'],
    notes: 'They sub a fresh five every four minutes.',
  },
  player_id: null,
  curriculum_week: null,
  skills_targeted: null,
  created_at: new Date(Date.now() - 86_400_000).toISOString(),
};

const PREGAME_BRIEF_RESPONSE = {
  plan: { id: 'plan-brief-e2e-1', type: 'pregame_brief' },
  brief: {
    opponent_read:
      'Riverside leans on a press to force turnovers and breaks fast off the steal. They get tired late and their second unit is a notch behind.',
    our_edge:
      'We have worked Spacing and closeouts for four weeks; both are the answer to their press. Effort has been our calling card.',
    huddle_points: [
      'Beat the press with two short passes before the half line.',
      'Closeouts under control — do not bite on the first pump fake.',
      'When their second five comes in, push the pace.',
    ],
    coach_note: 'Sub aggressively in the third quarter; that is when their starters get tired.',
  },
};

test.describe('Pre-game brief from opponent profile (ticket 0040)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;

    await mockMeEndpoint(page);
    await mockDataEndpoint(page, {
      plans: [OPPONENT_PROFILE_PLAN],
      players: [],
      observations: [],
    });
    await mockMutateEndpoint(page);

    // Mock the brief generation so the spec runs without a live AI call.
    await page.route('**/api/ai/pregame-brief', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PREGAME_BRIEF_RESPONSE),
      }),
    );
  });

  test('coach taps Generate pre-game brief and the four blocks render', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    await page.goto('/plans');

    // Open the opponent profile card.
    await expect(page.getByText('Riverside Hawks').first()).toBeVisible();
    await page.getByText('Riverside Hawks').first().click();

    // The "Generate pre-game brief" button is wrapped in <UpgradeGate
    // feature="feature_pregame_brief">. The seeded coach is pro_coach so the
    // button (not the upgrade card) renders.
    const generateBtn = page.getByRole('button', { name: /generate pre-game brief/i });
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
    await generateBtn.click();

    // The four-block brief renders inline.
    const brief = page.getByTestId('pregame-brief-card');
    await expect(brief).toBeVisible({ timeout: 5000 });
    await expect(brief).toContainText(/riverside leans on a press/i);
    await expect(brief).toContainText(/spacing and closeouts/i);
    await expect(brief).toContainText(/beat the press/i);
    await expect(brief).toContainText(/sub aggressively/i);
  });
});
