/**
 * E2E (ticket 0026): public, no-auth coach profile card at /coach/[token].
 *
 * The page is a SERVER component whose getCoachCardData() fetch runs server-side
 * and is NOT intercepted by page.route() (browser layer only) — so every assertion
 * below is backed by REAL rows in tests/e2e/fixtures/seed.sql:
 *   - the seeded coach 'E2E Test Coach' on a basketball team (age_group '11-13')
 *     with seeded practice sessions + observations
 *   - a coach_card_shares row with token COACH_CARD_TOKEN
 *   - the seeded coach's referral code 'AAAAAA' (set explicitly in the coaches
 *     seed row), carried on the CTA href.
 * The constants here mirror that seed 1:1 (LESSONS.md 2026-05-21 ship/0009).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint } from './helpers/auth';

// Matches the coach_card_shares row in tests/e2e/fixtures/seed.sql.
const COACH_CARD_TOKEN = 'test-coach-card-token-e2e-001';
const COACH_CARD_URL = `/coach/${COACH_CARD_TOKEN}`;

// The seeded coach's full_name and the basketball sport / age group they coach.
const COACH_NAME = 'E2E Test Coach';
const SPORT = 'Basketball';

// preferences.referral_code seeded explicitly as 'AAAAAA' on the coach row; the
// CTA href must carry it.
const COACH_CARD_REF = 'AAAAAA';

test.describe('Public coach profile card (/coach/[token]) — coach referral surface', () => {
  test('renders without authentication (no login redirect)', async ({ page }) => {
    await page.goto(COACH_CARD_URL);
    // Stays on the coach URL — middleware must treat it as public.
    await expect(page).toHaveURL(new RegExp(COACH_CARD_TOKEN));
    // Never bounces to /login.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('renders the coach display name and the sport/age-group line', async ({ page }) => {
    await page.goto(COACH_CARD_URL);
    await expect(page.getByText(COACH_NAME).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(SPORT).first()).toBeVisible();
  });

  test('renders a stats block (practices logged)', async ({ page }) => {
    await page.goto(COACH_CARD_URL);
    // The aggregate counts label "practices" appears in the stats block.
    await expect(page.getByText(/practices/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('shows a "start free" CTA that deep-links to /signup?ref=<code>', async ({ page }) => {
    await page.goto(COACH_CARD_URL);
    const cta = page.getByRole('link', { name: /start free|start coaching|make your own/i });
    await expect(cta.first()).toBeVisible({ timeout: 10000 });
    const href = await cta.first().getAttribute('href');
    expect(href).toContain(`/signup?ref=${COACH_CARD_REF}`);
  });

  test('has NO dashboard chrome (it is a standalone public surface)', async ({ page }) => {
    await page.goto(COACH_CARD_URL);
    // The authenticated app shell renders a bottom nav / greeting; the public
    // card must not. Assert the page didn't become the logged-in app.
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });

  test('an unknown token does not redirect to login (renders a not-found state)', async ({ page }) => {
    await page.goto('/coach/bad-token-404');
    await expect(page).toHaveURL(/\/coach\/bad-token-404/);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
  });
});

test.describe('Coach "Share my coaching profile" control (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  // AC: an authenticated coach has a "Share my coaching profile" control whose
  // data-share-url carries /coach/<token> (the share button renders no <a href>,
  // so the URL is asserted via the stable attribute — LESSONS.md 2026-05-21).
  test('control is visible and data-share-url carries /coach/<token>', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';
    const url = `${base}/coach/${COACH_CARD_TOKEN}`;
    await page.route('**/api/coach-card/create', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: COACH_CARD_TOKEN, url: `/coach/${COACH_CARD_TOKEN}` }),
      })
    );

    await page.goto('/settings/referrals');

    const btn = page.getByRole('button', { name: /share my coaching profile/i });
    await expect(btn).toBeVisible();
    // Trigger the create so the share URL is resolved onto the attribute.
    await btn.click();
    await expect(async () => {
      const shareUrl = await btn.getAttribute('data-share-url');
      expect(shareUrl).toContain(`/coach/${COACH_CARD_TOKEN}`);
    }).toPass();
    expect(url).toContain(`/coach/${COACH_CARD_TOKEN}`);
  });
});
