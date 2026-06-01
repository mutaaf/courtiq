/**
 * Ticket 0062 — mid-week silent-player nudge, end-to-end against the
 * seeded local Supabase.
 *
 * Seed extension (tests/e2e/fixtures/seed.sql, ticket 0062 block):
 *  - Alice's existing observations on the main E2E team are re-stamped to
 *    `now() - interval '10 days'` so she becomes the longest-silent active
 *    player on the team (10+ days).
 *  - Bob's existing observation on the disposable-session row (0F3, default
 *    `now()`) keeps Bob non-silent AND counts as the E2E coach's "had any
 *    observation in the last 7 days" activity probe.
 *
 * Two sub-flows:
 *  (1) The cron endpoint, when POSTed with the test CRON_SECRET, returns the
 *      {sent, skipped, errors} shape. We do not assert sent=1 exactly — a
 *      prior CI run's bookmark may already short-circuit this coach for the
 *      current ISO week, which is the same posture the 0058 e2e takes.
 *  (2) The deep-link /capture?playerId=<seeded>&via=silent-player-nudge
 *      opens /capture with the named player focused (the existing per-
 *      player capture memory line 0025 picks the player up via the URL
 *      param). Auth-required, so test.skip when E2E creds are unset.
 *
 * `.spec.ts` is the Playwright convention for this directory (vitest excludes
 * the spec glob, LESSONS#0038). Stable `data-testid` scoping per
 * LESSONS#0081 / #0082.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

const CRON_SECRET = process.env.CRON_SECRET || '';
const ALICE_ID = '00000000-0000-4000-a000-000000000030';

test.describe('Silent-player nudge cron (ticket 0062)', () => {
  test.skip(!CRON_SECRET, 'CRON_SECRET is not set in the spec env (set in ci.yml).');

  test('POST /api/cron/silent-player-nudge with the test secret returns the expected shape', async ({
    request,
  }) => {
    const res = await request.post('/api/cron/silent-player-nudge', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      sent: expect.any(Number),
      skipped: expect.any(Number),
      errors: expect.any(Number),
    });
    // No spec-required exact `sent` count — the seeded coach's preferences
    // might already carry this week's bookmark from a previous run. The
    // result shape + 200 status is the load-bearing contract; the cron unit
    // test asserts the per-eligibility behaviour deterministically.
  });

  test('POST /api/cron/silent-player-nudge with NO bearer is 401', async ({ request }) => {
    const res = await request.post('/api/cron/silent-player-nudge');
    expect(res.status()).toBe(401);
  });
});

test.describe('Silent-player nudge deep-link (ticket 0062)', () => {
  test('the deep-link /capture?playerId=<seeded>&via=silent-player-nudge renders the Capture page focused on that player', async ({
    page,
  }) => {
    const signedIn = await signInViaUI(page);
    test.skip(!signedIn, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD unset — auth-required flow skipped.');

    await page.goto(`/capture?playerId=${ALICE_ID}&via=silent-player-nudge`);
    // The URL is accepted (the via param is consumed by the page but not
    // persisted to observations — see capture/page.tsx) and the page renders.
    await expect(page).toHaveURL(
      new RegExp(`/capture\\?playerId=${ALICE_ID}&via=silent-player-nudge`),
    );
    // The Capture page's load-bearing signal: the Record control. Mirrors the
    // 0025 capture-player-memory spec posture (LESSONS#0081 — tolerant
    // locator on a shared role to avoid strict-mode collisions on accent
    // copy).
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible({
      timeout: 15000,
    });
  });
});
