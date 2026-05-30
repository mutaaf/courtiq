/**
 * E2E (ticket 0057): public weekly-pulse share page at /week/[token].
 *
 * The page is a SERVER component whose getPulseData() fetch runs server-side
 * and is NOT intercepted by page.route() (browser layer only — LESSONS#0009).
 * Every assertion is backed by REAL rows in tests/e2e/fixtures/seed.sql:
 *
 *   - a weekly_pulse_shares row with token WEEKLY_PULSE_TOKEN, coach_id =
 *     the E2E coach (...001), team_id = the E2E team (...020), iso_week =
 *     '2026-W22', caption = "anyone want to swap closeout drills?"
 *   - two observations stamped inside the W22 range (2026-05-27 + 2026-05-28)
 *     with categories Defense + Effort so topCategories aggregates a
 *     deterministic list
 *
 * The authed in-app share-control flow skips when E2E creds are unset
 * (coach-card / practice-plan-shares precedent — the always-green CI proof
 * is the vitest + the public-page e2e here).
 */
import { test, expect } from '@playwright/test';

const WEEKLY_PULSE_TOKEN = 'test-weekly-pulse-token-e2e-001';
const WEEKLY_PULSE_URL = `/week/${WEEKLY_PULSE_TOKEN}`;

// Asserted fields the seed guarantees on /week/<token>.
const TEAM_NAME = 'E2E Test Team';
const COACH_FIRST_NAME = 'E2E';   // splits from coach.full_name = 'E2E Test Coach'
const SPORT_NAME = 'Basketball';
const AGE_GROUP = '11-13';
const CAPTION_FRAGMENT = 'closeout drills';
const SEED_REFERRAL_CODE = 'AAAAAA'; // makeReferralCode of the seed coach UUID

test.describe('Public weekly-pulse share (/week/[token]) — coach-to-coach league-chat surface', () => {
  test('renders without authentication (no login redirect)', async ({ page }) => {
    await page.goto(WEEKLY_PULSE_URL);
    await expect(page).toHaveURL(new RegExp(WEEKLY_PULSE_TOKEN));
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('renders the team name, the coach first name, and the seeded caption', async ({ page }) => {
    await page.goto(WEEKLY_PULSE_URL);
    // Scope assertions to the stable testid container (LESSONS#0081) so the
    // page-wide getByText never strict-mode-collides on substrings (LESSONS
    // #0022/#0029 — coach first name "E2E" is a substring of team name).
    const header = page.getByTestId('weekly-pulse-header');
    await expect(header).toBeVisible({ timeout: 10000 });
    await expect(header).toContainText(TEAM_NAME);
    await expect(header).toContainText(`Coach ${COACH_FIRST_NAME}`);
    await expect(header).toContainText(SPORT_NAME);
    await expect(header).toContainText(AGE_GROUP);
    await expect(page.getByTestId('weekly-pulse-caption')).toContainText(CAPTION_FRAGMENT);
  });

  test('the CTA href carries the publisher referral code (warm-landing per 0011/0021)', async ({ page }) => {
    await page.goto(WEEKLY_PULSE_URL);
    const ctaContainer = page.getByTestId('weekly-pulse-cta');
    await expect(ctaContainer).toBeVisible({ timeout: 10000 });
    // The CTA's accessible name + the href both confirm the warm-landing.
    const link = ctaContainer.getByRole('link', { name: /i coach too/i });
    await expect(link).toHaveAttribute('href', `/signup?ref=${SEED_REFERRAL_CODE}`);
  });

  test('NEVER renders any player name, observation text, or parent contact (COPPA)', async ({ page }) => {
    await page.goto(WEEKLY_PULSE_URL);
    // The seeded observations have text mentioning "E2E seed: 0057 obs". The
    // route's allow-list never returns observation text, so it must NOT be on
    // the page. Same for the seeded Alice Walker player name (linked on the
    // obs rows via player_id).
    const body = page.locator('body');
    await expect(body).not.toContainText('Alice Walker');
    await expect(body).not.toContainText('Bob Carter');
    await expect(body).not.toContainText('0057 obs');
    await expect(body).not.toContainText('parent_email');
    await expect(body).not.toContainText('Walker Family');
  });

  test('has NO dashboard chrome (standalone public surface)', async ({ page }) => {
    await page.goto(WEEKLY_PULSE_URL);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });

  test('an unknown token does not redirect to login (renders a not-found state)', async ({ page }) => {
    await page.goto('/week/bad-weekly-pulse-token-does-not-exist');
    await expect(page).toHaveURL(/\/week\/bad-weekly-pulse-token-does-not-exist/);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByText(/weekly pulse not found/i)).toBeVisible({ timeout: 10000 });
  });

  test('the dynamic sitemap includes the seeded weekly-pulse token at /week/<token>', async ({ request }) => {
    // LESSONS#0038 — the sitemap is publicly reachable, no auth. The seeded
    // active token must appear so cold-search discovery can find it.
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain(`/week/${WEEKLY_PULSE_TOKEN}`);
  });
});
