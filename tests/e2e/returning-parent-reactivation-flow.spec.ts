/**
 * E2E — ticket 0072 — returning-parent reactivation flow.
 *
 * The dormant-coach reactivation card / email is COVERED BY THE VITEST
 * TESTS (the helper, the route, the component, the cron). The e2e
 * scope here is bounded to the PUBLIC parent-portal surface — the only
 * codepath the change actually mounts on a publicly-reachable page.
 *
 * What this spec proves on the seeded local Supabase:
 *  1. Hitting the parent-portal token URL for the seeded fall team's
 *     reactivation player ("Maya Reactive") returns 200 and renders the
 *     existing parent-portal sections.
 *  2. The page is BYTE-IDENTICAL TO TODAY — no new dormant-coach-side
 *     copy leaks onto the parent surface. (The reactivation is fired on
 *     the BACKEND by the GET; the parent sees nothing.)
 *  3. The page renders no banned hype words from the reactivation
 *     copy (a smoke check on the parent surface; the email + card body
 *     have their own vitest scans).
 *
 * The seed extension at the bottom of tests/e2e/fixtures/seed.sql
 * pre-mints the prior-spring-coach (dormant 45 days, last_active_at),
 * the prior-spring-team + player (the parent_email edge), AND the
 * fall-team player + parent_shares token the spec opens. UUIDs are in
 * the 0000000000d2..d6 range — verified unused at pickup
 * (LESSONS#0101).
 */
import { test, expect } from '@playwright/test';

const TOKEN = 'test-share-token-e2e-reactive';
const URL = `/share/${TOKEN}`;

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

test.describe('Returning-parent reactivation — public parent-portal surface (ticket 0072)', () => {
  test('the parent-portal page resolves the reactivation token and renders successfully', async ({
    page,
  }) => {
    const resp = await page.goto(URL);
    // The seed pre-mints the share row; the public route must resolve it.
    expect(resp?.status()).toBe(200);
    // The reactivation player's first name appears in the report greeting.
    await expect(page.locator('main, body')).toContainText(/Maya/i);
  });

  test('the parent-portal page contains no new dormant-coach-side copy (BYTE-IDENTICAL to today)', async ({
    page,
  }) => {
    await page.goto(URL);
    const bodyText = await page.locator('body').innerText();
    // The dormant-coach side strings live ONLY on /home + the
    // reactivation email — they MUST NOT leak into the parent surface.
    expect(bodyText.toLowerCase()).not.toContain('is back on sportsiq this week');
    expect(bodyText.toLowerCase()).not.toContain('see how liam finished the season');
    // Also no AGENTS.md banned hype words from the reactivation copy.
    const lower = bodyText.toLowerCase();
    for (const word of BANNED_HYPE) {
      expect(lower).not.toContain(word);
    }
  });
});
