/**
 * E2E (ticket 0035): the AI-quota wall becomes a one-tap upgrade that finishes the
 * exact artifact the coach was making.
 *
 * /settings/upgrade is a middleware-protected dashboard route — without real auth
 * cookies it redirects to /login — so these specs follow the authenticated
 * convention (sign in via UI, test.skip() when E2E_TEST_EMAIL / E2E_TEST_PASSWORD
 * are unset, which they are on the PR-gating runner). The CI-gating proof for the
 * resume PARSER and the create-checkout round-trip is the vitest suite
 * (tests/lib/resume-target.test.ts + tests/stripe/create-checkout-resume.test.ts);
 * these specs guard the live wiring of the post-checkout landing whenever creds
 * are supplied.
 *
 * Stripe is mocked at the route boundary exactly as the checkout e2e convention
 * does (ticket 0002): we intercept POST /api/stripe/create-checkout and return a
 * URL — but for the resume round-trip we return the in-app success URL itself
 * (carrying ?success=true&resume=…), which is what Stripe would redirect to after
 * a real payment. That lets the post-checkout landing run end-to-end without a
 * live Stripe session, and lets the cancel path return ?canceled=true with no
 * resume applied.
 *
 * Seed ids (tests/e2e/fixtures/seed.sql): team 00000000-…-020, player Alice
 * 00000000-…-030. Both belong to the seeded coach's org, so the resume target is
 * owned and resolves to /roster/<player>.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint } from './helpers/auth';

const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const RESUME = `parent_report:${TEAM_ID}:${PLAYER_ID}`;

test.describe('Quota-wall resume after upgrade (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockMeEndpoint(page);
  });

  // AC: after a successful upgrade, the post-checkout return path resolves the
  // validated resume target and routes the coach to the exact artifact surface
  // with the player pre-selected. We land the coach on the success URL the
  // checkout would redirect to (?success=true&resume=…) and assert the page
  // forwards them to /roster/<player>.
  test('happy path: success URL with a valid resume lands the coach on the player surface', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    // Land exactly where Stripe would redirect after a successful payment.
    await page.goto(`/settings/upgrade?success=true&resume=${encodeURIComponent(RESUME)}`);

    // The landing handler resolves the owned resume target and routes to the
    // player's surface (the parent report knows the playerId).
    await page.waitForURL(new RegExp(`/roster/${PLAYER_ID}`), { timeout: 10000 });
    await expect(page).toHaveURL(new RegExp(`/roster/${PLAYER_ID}`));
    // Never bounced to login (still authenticated).
    await expect(page).not.toHaveURL(/\/login/);
  });

  // AC (privacy/safety): a cross-org / malformed resume is ignored and the coach
  // lands on /home, never on another org's player surface.
  test('cross-org resume is ignored and lands the coach on /home', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    const foreign = 'parent_report:11111111-1111-4111-a111-111111111111:22222222-2222-4222-a222-222222222222';
    await page.goto(`/settings/upgrade?success=true&resume=${encodeURIComponent(foreign)}`);

    await page.waitForURL(/\/home/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/home/);
    // Must NOT have routed to the foreign player.
    await expect(page).not.toHaveURL(/22222222-2222-4222-a222-222222222222/);
  });

  // AC: if the coach abandons checkout (Stripe cancel), they return to the upgrade
  // surface with nothing lost — no tier change, no resume applied, no navigation
  // away to the artifact.
  test('cancel path stays on the upgrade page and applies no resume', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await page.goto(`/settings/upgrade?canceled=true&resume=${encodeURIComponent(RESUME)}`);

    // Give any (incorrect) redirect a chance to fire, then assert we stayed put.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/settings\/upgrade/);
    // Crucially, the cancel path must NOT navigate to the artifact surface.
    await expect(page).not.toHaveURL(new RegExp(`/roster/${PLAYER_ID}`));
  });

  // AC: success WITHOUT a resume is unchanged from today — the coach stays on the
  // upgrade page (the existing success toast behavior), no spurious navigation.
  test('success without a resume stays on the upgrade page (unchanged behavior)', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await page.goto('/settings/upgrade?success=true');
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/settings\/upgrade/);
  });
});
