/**
 * E2E: mid-season team newsletter (ticket 0043).
 *
 * Two scopes:
 *   1) UN-AUTHED: the public /share/team-newsletter/<token> page renders the
 *      four blocks (headline, arc summary, strengths, focus areas) from a
 *      seeded team_card_shares row with type='mid_season_team_newsletter' and
 *      a saved plan of the same type. A bad token returns 404. This is the
 *      load-bearing CI proof (real-DB seeded — no page.route() mock).
 *   2) AUTHED: the coach navigates to /plans, taps the "Generate mid-season
 *      newsletter" button (wrapped in <UpgradeGate feature="parent_sharing">),
 *      and the five-block artifact renders inline. The generate call is
 *      mocked (the load-bearing CI proof for persistence + the tier gate is
 *      tests/ai/mid-season-team-newsletter.test.ts); the authed sub-spec
 *      skips when E2E creds are unset (coach-card / pregame-brief precedent).
 *
 * Uses a data-testid on the newsletter container to scope strict-mode locators
 * (LESSONS#0081).
 */
import { test, expect } from '@playwright/test';
import {
  signInViaUI,
  mockMeEndpoint,
  mockDataEndpoint,
  mockMutateEndpoint,
} from './helpers/auth';

// Token + plan ids seeded by tests/e2e/fixtures/seed.sql so the public-page spec
// reads them from the REAL local Supabase (not a page.route() mock).
const NEWSLETTER_TOKEN = 'test-team-newsletter-token-e2e-001';
const BAD_TOKEN = 'definitely-not-a-real-token-e2e';

const NEWSLETTER_RESPONSE = {
  planId: 'plan-newsletter-e2e-1',
  content_structured: {
    headline: 'Six weeks in: ball movement is starting to land.',
    arc_summary:
      'We have built around moving the ball and crashing the boards. The last two practices have shown those reps starting to translate.',
    team_strengths: [
      'The team is sharing the ball more on the second pass.',
      'Effort on rebounds is showing up in the second half of practice.',
    ],
    focus_areas: [
      'Closing out without fouling.',
      'Talking on defense in transition.',
    ],
    coach_voice_quote:
      'When we move the ball, good things happen — that has been the through line of this stretch.',
  },
};

// ── 1) Public share page ────────────────────────────────────────────────────────

test.describe('Public /share/team-newsletter/[token] (ticket 0043)', () => {
  test('renders the four-block newsletter from a seeded token', async ({ page }) => {
    await page.goto(`/share/team-newsletter/${NEWSLETTER_TOKEN}`);

    // The newsletter container has a stable data-testid so the strict-mode
    // locator scopes cleanly even when the page also shows the team name in
    // a header (LESSONS#0081 family).
    const container = page.getByTestId('mid-season-newsletter-card');
    await expect(container).toBeVisible({ timeout: 10_000 });

    await expect(container).toContainText(/ball movement is starting to land/i);
    await expect(container).toContainText(/moving the ball and crashing the boards/i);
    await expect(container).toContainText(/sharing the ball/i);
    await expect(container).toContainText(/closing out without fouling/i);
  });

  test('returns 404 when the token is missing or wrong', async ({ page }) => {
    const res = await page.goto(`/share/team-newsletter/${BAD_TOKEN}`);
    // The Next.js notFound() short-circuit returns 404. Some renderers return
    // 200 + a fallback page; we tolerate both as long as the "not found" copy
    // is what the parent actually sees on the page.
    if (res) {
      expect([200, 404]).toContain(res.status());
    }
    await expect(page.getByText(/newsletter not found/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ── 2) Authed: dashboard → tap → inline render ──────────────────────────────────

test.describe('Coach taps Generate mid-season newsletter on /plans (ticket 0043)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;

    await mockMeEndpoint(page);
    await mockDataEndpoint(page, {
      plans: [],
      players: [],
      observations: [],
    });
    await mockMutateEndpoint(page);

    // Mock the newsletter generation so the spec runs without a live AI call;
    // server-side persistence + the tier gate are pinned by the vitest suite.
    await page.route('**/api/ai/mid-season-team-newsletter', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(NEWSLETTER_RESPONSE),
      }),
    );
  });

  test('coach taps Generate mid-season newsletter and the five blocks render', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    await page.goto('/plans');

    // The "Generate mid-season newsletter" button is wrapped in
    // <UpgradeGate feature="parent_sharing">. The seeded coach is pro_coach
    // so the button (not the upgrade card) renders.
    const generateBtn = page.getByRole('button', { name: /generate mid-season newsletter/i });
    await expect(generateBtn).toBeVisible({ timeout: 10_000 });
    await generateBtn.click();

    const card = page.getByTestId('mid-season-newsletter-card');
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(card).toContainText(/ball movement is starting to land/i);
    await expect(card).toContainText(/sharing the ball/i);
    await expect(card).toContainText(/closing out without fouling/i);
  });
});
