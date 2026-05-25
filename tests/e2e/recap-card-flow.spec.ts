/**
 * E2E (ticket 0027): public, no-auth game-recap card at /recap/[token].
 *
 * The page is a SERVER component whose getRecapData() fetch runs server-side and
 * is NOT intercepted by page.route() (browser layer only) — so every public
 * assertion below is backed by REAL rows in tests/e2e/fixtures/seed.sql:
 *   - a game_recap plan for "E2E Test Team" (type allowed by plans_type_check via
 *     migration 034) whose content_structured deliberately INCLUDES player_highlights
 *     (with per-minor names) so the COPPA strip is exercised end-to-end
 *   - a game_recap_shares row with token GAME_RECAP_TOKEN
 *   - the seeded coach has NO preferences.referral_code on the season/team path, but
 *     the coaches row carries 'AAAAAA' (set for 0026); either way the GET resolves
 *     GAME_RECAP_REF and the CTA href carries it.
 * The constants here mirror that seed 1:1 (LESSONS.md 2026-05-21 ship/0009).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint } from './helpers/auth';

// Matches the game_recap_shares row in tests/e2e/fixtures/seed.sql.
const GAME_RECAP_TOKEN = 'test-game-recap-token-e2e-001';
const GAME_RECAP_URL = `/recap/${GAME_RECAP_TOKEN}`;

// content_structured.result_headline / coach_message of the seeded game_recap plan
// — asserted on the rendered (seed-backed) page.
const RESULT_HEADLINE = 'Victory Over the Eagles';
const COACH_MESSAGE = 'That was a team win';
const KEY_MOMENT = 'Defensive stand';

// Per-minor content seeded inside player_highlights that the COPPA allow-list MUST
// strip — these names must NOT appear on the public page.
const MINOR_NAME = 'Alice Walker';
const MINOR_STAT = '12 pts, 6 reb';

// makeReferralCode of the seeded coach id '00000000-0000-4000-a000-000000000001'
// → all-zero leading hex bytes → 'AAAAAA'. The CTA href must carry it.
const GAME_RECAP_REF = 'AAAAAA';

test.describe('Public game recap (/recap/[token]) — coach referral surface', () => {
  test('renders without authentication (no login redirect)', async ({ page }) => {
    await page.goto(GAME_RECAP_URL);
    // Stays on the recap URL — middleware must treat it as public.
    await expect(page).toHaveURL(new RegExp(GAME_RECAP_TOKEN));
    // Never bounces to /login.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('renders the result headline, a key moment, and the coach message', async ({ page }) => {
    await page.goto(GAME_RECAP_URL);
    await expect(page.getByText(RESULT_HEADLINE).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(KEY_MOMENT, { exact: false })).toBeVisible();
    await expect(page.getByText(COACH_MESSAGE, { exact: false })).toBeVisible();
  });

  test('shows a "follow your team — free" CTA that deep-links to /signup?ref=<code>', async ({ page }) => {
    await page.goto(GAME_RECAP_URL);
    const cta = page.getByRole('link', { name: /follow your team|start free|make your/i });
    await expect(cta.first()).toBeVisible({ timeout: 10000 });
    const href = await cta.first().getAttribute('href');
    expect(href).toContain(`/signup?ref=${GAME_RECAP_REF}`);
  });

  // COPPA: the public card shows team-level narrative only — no per-minor name or
  // stat line. player_highlights is stripped server-side by the allow-list.
  test('does NOT show any per-minor player highlight name or stat line', async ({ page }) => {
    await page.goto(GAME_RECAP_URL);
    // The headline must be present (the page actually rendered the recap)…
    await expect(page.getByText(RESULT_HEADLINE).first()).toBeVisible({ timeout: 10000 });
    // …but no minor name or stat line from player_highlights appears anywhere.
    await expect(page.locator('body')).not.toContainText(MINOR_NAME);
    await expect(page.locator('body')).not.toContainText(MINOR_STAT);
  });

  test('has NO dashboard chrome (it is a standalone public surface)', async ({ page }) => {
    await page.goto(GAME_RECAP_URL);
    // The authenticated app shell renders a bottom nav / greeting; the public
    // recap must not. Assert the page didn't become the logged-in app.
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });

  test('an unknown token does not redirect to login (renders a not-found state)', async ({ page }) => {
    await page.goto('/recap/bad-token-404');
    await expect(page).toHaveURL(/\/recap\/bad-token-404/);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
  });
});

test.describe('In-app "Share this recap" control (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  // AC: a coach viewing a generated game recap has a "Share this recap" control
  // whose data-share-url carries /recap/<token>. The share button renders no
  // <a href>, so the URL is asserted via the stable attribute (LESSONS.md
  // 2026-05-21). The seeded game session auto-loads the seeded game_recap plan,
  // so the GameRecapCard renders the control without a live AI call.
  test('control exposes /recap/<token> on data-share-url', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);
    // Stub the create call so the share URL resolves onto the attribute without a
    // real DB write (the public render path above already exercises the real route).
    await page.route('**/api/recap-card/create', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: GAME_RECAP_TOKEN, url: `/recap/${GAME_RECAP_TOKEN}` }),
      })
    );

    // The seeded game session whose game_recap plan auto-loads in GameRecapCard.
    await page.goto('/sessions/00000000-0000-4000-a000-000000000042');

    const btn = page.getByRole('button', { name: /share this recap/i });
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await expect(async () => {
      const shareUrl = await btn.getAttribute('data-share-url');
      expect(shareUrl).toContain(`/recap/${GAME_RECAP_TOKEN}`);
    }).toPass();
  });
});
