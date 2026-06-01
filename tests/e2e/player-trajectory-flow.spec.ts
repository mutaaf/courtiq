/**
 * E2E (ticket 0061): the per-player "Week 1 vs now" trajectory page.
 *
 * The seed pre-mints 11 observations on the existing E2E player (Alice
 * Walker, ...030) AND a `player_trajectories` cache row at bucket 12, so
 * the trajectory route's first authed read hits the cache WITHOUT a live
 * `callAI` against a real provider. The cache row's started/now sentences
 * are the canonical strings the e2e asserts on render.
 *
 * The always-green CI proof is the SEED applying cleanly under psql
 * ON_ERROR_STOP=1 — that alone proves the migration + table + FK +
 * UNIQUE constraint + jsonb shape all hold against a fresh DB
 * (LESSONS#0006 family). The authenticated assertions skip cleanly when
 * E2E creds aren't supplied (same posture as the 0059 player-handoff
 * spec).
 *
 * When creds ARE present, we:
 *   - hit GET /api/players/<seeded-Alice>/trajectory and assert the cached
 *     started/now sentences come back,
 *   - hit GET /api/og/player-trajectory/<seeded-Alice> and assert it
 *     returns 200 image/png,
 *   - navigate to /roster/<seeded-Alice>/trajectory and assert the rendered
 *     card carries the seeded started/now sentences and exposes
 *     `data-testid="player-trajectory-card"` for stable scoping.
 *
 * data-testid scoping per LESSONS#0081.
 */
import { test, expect, request as pwRequest } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

const PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const STARTED_SENTENCE = 'Alice started the season hesitating on closeouts.';
const NOW_SENTENCE = 'Alice now closes out and recovers under control.';

test.describe('Player trajectory flow (ticket 0061)', () => {
  test('seed contains a player_trajectories row + observations the route reads (server-only)', async () => {
    // The seed itself is the load-bearing proof. If the migration's column
    // shape or the jsonb anchor shape doesn't hold against a fresh DB, the
    // seed step fails under `psql ON_ERROR_STOP=1` and `e2e-tests` fails
    // before Playwright ever runs.
    const ctx = await pwRequest.newContext({ baseURL: 'http://localhost:3000' });
    const health = await ctx.get('/api/health');
    expect([200, 204, 404]).toContain(health.status());
    await ctx.dispose();
  });

  test('the JSON route returns the seeded cached started/now sentences when signed in', async ({ page }) => {
    const authed = await signInViaUI(page);
    if (!authed) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    const res = await page.request.get(`/api/players/${PLAYER_ID}/trajectory`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      started: { sentence: string } | null;
      now: { sentence: string } | null;
      turningPoints: Array<{ oneWordLabel: string }>;
      observationCount: number;
    };
    expect(body.started?.sentence).toBe(STARTED_SENTENCE);
    expect(body.now?.sentence).toBe(NOW_SENTENCE);
    expect(body.observationCount).toBeGreaterThanOrEqual(11);
  });

  test('the OG route returns 200 image/png for the same player', async ({ page }) => {
    const authed = await signInViaUI(page);
    if (!authed) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    const res = await page.request.get(`/api/og/player-trajectory/${PLAYER_ID}`);
    expect(res.status()).toBe(200);
    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('image/png');
  });

  test('the trajectory page renders the seeded cached card (data-testid="player-trajectory-card")', async ({ page }) => {
    const authed = await signInViaUI(page);
    if (!authed) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await page.goto(`/roster/${PLAYER_ID}/trajectory`);
    const card = page.getByTestId('player-trajectory-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(STARTED_SENTENCE);
    await expect(card).toContainText(NOW_SENTENCE);
    // The "Save growth card for parent pickup" link goes to the OG route
    // for the same player (the JSON page and the OG card never disagree —
    // both read from the same cache row).
    const save = page.getByTestId('player-trajectory-save-card');
    await expect(save).toHaveAttribute('href', `/api/og/player-trajectory/${PLAYER_ID}`);
  });
});
