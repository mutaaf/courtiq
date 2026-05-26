/**
 * E2E (ticket 0038): /sitemap.xml is publicly reachable and lists every public
 * coach surface in the seed; /share/<token> renders a `noindex` meta tag.
 *
 * /sitemap.xml is server-rendered XML — page.goto('/sitemap.xml') + the
 * response body is the right surface (no page.route mock needed and the
 * LESSONS.md 2026-05-21 server-component caveat does NOT apply: we WANT the
 * real server output here).
 *
 * Seeded surfaces this asserts on (mirroring tests/e2e/fixtures/seed.sql 1:1):
 *  - /programs (static directory page).
 *  - /org/discoverable-rec (the opted-in org from ticket 0033).
 *  - /team-card/test-team-card-token-e2e-001 (ticket 0010).
 *  - /season-recap/test-season-recap-token-e2e-001 (ticket 0017).
 *  - /coach/test-coach-card-token-e2e-001 (ticket 0026).
 *  - /recap/test-game-recap-token-e2e-001 (ticket 0027).
 *
 * And asserts that the parent portal at /share/<seeded token> renders a
 * robots: noindex meta tag (the share-page is a server component — server
 * HTML is asserted directly via page.locator('meta[name="robots"]'), per
 * LESSONS.md 2026-05-21 server-component caveat).
 */
import { test, expect } from '@playwright/test';

// Match the seed.
const DISCOVERABLE_ORG_SLUG = 'discoverable-rec';
const TEAM_CARD_TOKEN = 'test-team-card-token-e2e-001';
const SEASON_RECAP_TOKEN = 'test-season-recap-token-e2e-001';
const COACH_CARD_TOKEN = 'test-coach-card-token-e2e-001';
const GAME_RECAP_TOKEN = 'test-game-recap-token-e2e-001';
const SHARE_TOKEN = 'test-share-token-e2e-001';

test.describe('Public sitemap (/sitemap.xml) — cold-search discoverability', () => {
  test('returns 200 application/xml and lists the marketing routes + /programs', async ({
    request,
  }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const contentType = res.headers()['content-type'] ?? '';
    // Next can emit application/xml; charset suffix optional.
    expect(contentType).toMatch(/xml/i);

    const xml = await res.text();
    // Static marketing entries + the cold-traffic directory.
    expect(xml).toMatch(/<loc>[^<]*\/programs<\/loc>/);
    expect(xml).toMatch(/<loc>[^<]*\/privacy<\/loc>/);
    expect(xml).toMatch(/<loc>[^<]*\/terms<\/loc>/);
  });

  test('includes the seeded opted-in org and every seeded active token', async ({
    request,
  }) => {
    const res = await request.get('/sitemap.xml');
    const xml = await res.text();

    // The opted-in org from ticket 0033's seed block.
    expect(xml).toContain(`/org/${DISCOVERABLE_ORG_SLUG}`);

    // The four shipped public-token surfaces with their seeded tokens.
    expect(xml).toContain(`/team-card/${TEAM_CARD_TOKEN}`);
    expect(xml).toContain(`/season-recap/${SEASON_RECAP_TOKEN}`);
    expect(xml).toContain(`/coach/${COACH_CARD_TOKEN}`);
    expect(xml).toContain(`/recap/${GAME_RECAP_TOKEN}`);
  });

  test('NEVER includes a parent-portal /share/<token> URL (per-minor surface)', async ({
    request,
  }) => {
    const res = await request.get('/sitemap.xml');
    const xml = await res.text();
    expect(xml).not.toContain('/share/');
  });
});

test.describe('Parent portal (/share/<token>) — robots noindex', () => {
  test('renders a robots meta tag containing noindex', async ({ page }) => {
    await page.goto(`/share/${SHARE_TOKEN}`);
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveCount(1);
    const content = (await robots.getAttribute('content')) ?? '';
    expect(content.toLowerCase()).toContain('noindex');
  });
});
