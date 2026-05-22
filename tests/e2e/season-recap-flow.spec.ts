/**
 * E2E (ticket 0017): public, no-auth season-recap card at /season-recap/[token].
 *
 * The page is a SERVER component whose getSeasonRecapData() fetch runs server-side
 * and is NOT intercepted by page.route() (browser layer only) — so every assertion
 * below is backed by a REAL row in tests/e2e/fixtures/seed.sql:
 *   - a season_summary plan for "E2E Test Team"
 *   - a season_recap_shares row with token SEASON_RECAP_TOKEN
 *   - the seeded coach's referral code resolves to SEASON_RECAP_REF (the same
 *     deterministic makeReferralCode of the coach UUID — the all-zero coach id
 *     yields 'AAAAAA').
 * The constants here mirror that seed 1:1 (LESSONS.md 2026-05-21 ship/0009).
 */
import { test, expect } from '@playwright/test';

// Matches the season_recap_shares row in tests/e2e/fixtures/seed.sql.
const SEASON_RECAP_TOKEN = 'test-season-recap-token-e2e-001';
const SEASON_RECAP_URL = `/season-recap/${SEASON_RECAP_TOKEN}`;

// content_structured.headline / closing_message of the seeded season_summary plan
// — asserted on the rendered (seed-backed) page.
const HEADLINE = 'A Season of Breakthroughs';
const CLOSING = 'That is what a real season looks like';

// makeReferralCode('00000000-0000-4000-a000-000000000001') — the seeded coach id
// (the first 12 hex bytes are all 0x00, each → CHARS[0] = 'A'). The coach is
// seeded WITHOUT a referral_code so the GET route lazily generates this exact
// code; the CTA href must carry it.
const SEASON_RECAP_REF = 'AAAAAA';

test.describe('Public season recap (/season-recap/[token]) — coach referral surface', () => {
  test('renders without authentication (no login redirect)', async ({ page }) => {
    await page.goto(SEASON_RECAP_URL);
    // Stays on the season-recap URL — middleware must treat it as public.
    await expect(page).toHaveURL(new RegExp(SEASON_RECAP_TOKEN));
    // Never bounces to /login.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('renders the season headline and the closing message', async ({ page }) => {
    await page.goto(SEASON_RECAP_URL);
    await expect(page.getByText(HEADLINE).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(CLOSING, { exact: false })).toBeVisible();
  });

  test('shows a "start free" CTA that deep-links to /signup?ref=<code>', async ({ page }) => {
    await page.goto(SEASON_RECAP_URL);
    const cta = page.getByRole('link', { name: /start free|make your|recap/i });
    await expect(cta.first()).toBeVisible({ timeout: 10000 });
    const href = await cta.first().getAttribute('href');
    expect(href).toContain(`/signup?ref=${SEASON_RECAP_REF}`);
  });

  test('has NO dashboard chrome (it is a standalone public surface)', async ({ page }) => {
    await page.goto(SEASON_RECAP_URL);
    // The authenticated app shell renders a bottom nav / greeting; the public
    // recap must not. Assert the page didn't become the logged-in app.
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });

  test('exposes an OG title containing the headline (or team name) for rich previews', async ({ page }) => {
    await page.goto(SEASON_RECAP_URL);
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveCount(1);
    const content = await ogTitle.getAttribute('content');
    expect(content).toContain(HEADLINE);
  });

  test('an unknown token does not redirect to login (renders a not-found state)', async ({ page }) => {
    await page.goto('/season-recap/bad-token-404');
    await expect(page).toHaveURL(/\/season-recap\/bad-token-404/);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
  });
});
