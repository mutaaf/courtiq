/**
 * E2E (ticket 0010): public, no-auth coach-to-coach referral card at
 * /team-card/[token].
 *
 * The page is a SERVER component whose getTeamCardData() fetch runs server-side
 * and is NOT intercepted by page.route() (browser layer only) — so every
 * assertion below is backed by a REAL row in tests/e2e/fixtures/seed.sql:
 *   - a team_personality plan for "E2E Test Team"
 *   - a team_card_shares row with token TEAM_CARD_TOKEN
 *   - the seeded coach's referral code resolves to TEAM_CARD_REF (the same
 *     deterministic makeReferralCode of the coach UUID).
 * The constants here mirror that seed 1:1 (LESSONS.md 2026-05-21 ship/0009).
 */
import { test, expect } from '@playwright/test';

// Matches the team_card_shares row in tests/e2e/fixtures/seed.sql.
const TEAM_CARD_TOKEN = 'test-team-card-token-e2e-001';
const TEAM_CARD_URL = `/team-card/${TEAM_CARD_TOKEN}`;

// content_structured.team_type / tagline / first trait of the seeded
// team_personality plan — asserted on the rendered (seed-backed) page.
const TEAM_TYPE = 'The Grinders';
const TEAM_TAGLINE = 'Hard work is their superpower';
const FIRST_TRAIT = 'Work Ethic';

// makeReferralCode('00000000-0000-4000-a000-000000000001') — the seeded coach
// id (the first 12 hex bytes are all 0x00, each → CHARS[0] = 'A'). The coach is
// seeded WITHOUT a referral_code so the GET route lazily generates this exact
// code; the CTA href must carry it.
const TEAM_CARD_REF = 'AAAAAA';

test.describe('Public team card (/team-card/[token]) — coach referral surface', () => {
  test('renders without authentication (no login redirect)', async ({ page }) => {
    await page.goto(TEAM_CARD_URL);
    // Stays on the team-card URL — middleware must treat it as public.
    await expect(page).toHaveURL(new RegExp(TEAM_CARD_TOKEN));
    // Never bounces to /login.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('renders the team type, tagline, and at least one trait', async ({ page }) => {
    await page.goto(TEAM_CARD_URL);
    await expect(page.getByText(TEAM_TYPE).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(TEAM_TAGLINE)).toBeVisible();
    await expect(page.getByText(FIRST_TRAIT)).toBeVisible();
  });

  test('shows a "start free" CTA that deep-links to /signup?ref=<code>', async ({ page }) => {
    await page.goto(TEAM_CARD_URL);
    const cta = page.getByRole('link', { name: /start free|make your team|make your own/i });
    await expect(cta.first()).toBeVisible({ timeout: 10000 });
    const href = await cta.first().getAttribute('href');
    expect(href).toContain(`/signup?ref=${TEAM_CARD_REF}`);
  });

  test('has NO dashboard chrome (it is a standalone public surface)', async ({ page }) => {
    await page.goto(TEAM_CARD_URL);
    // The authenticated app shell renders a bottom nav / "Capture" tab; the
    // public card must not. Assert the page didn't become the logged-in app.
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });

  test('exposes an OG title containing the team type for rich link previews', async ({ page }) => {
    await page.goto(TEAM_CARD_URL);
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveCount(1);
    const content = await ogTitle.getAttribute('content');
    expect(content).toContain(TEAM_TYPE);
  });

  test('an unknown token does not redirect to login (renders a not-found state)', async ({ page }) => {
    await page.goto('/team-card/bad-token-404');
    await expect(page).toHaveURL(/\/team-card\/bad-token-404/);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
  });
});
