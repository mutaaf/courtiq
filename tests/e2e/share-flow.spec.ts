/**
 * E2E: Create Share Link → View Parent Portal
 *
 * The share link creation requires authentication (player profile page).
 * The parent portal (/share/[token]) is fully public — tested without auth.
 */
import { test, expect } from '@playwright/test';
import {
  signInViaUI,
  mockMeEndpoint,
  mockDataEndpoint,
  TEST_PLAYERS,
  TEST_OBSERVATIONS,
} from './helpers/auth';

const SHARE_TOKEN = 'test-share-token-e2e-001';
const SHARE_URL = `/share/${SHARE_TOKEN}`;

// Shared portal data mirroring GET /api/share/[token] response
const SHARE_API_DATA = {
  player: { ...TEST_PLAYERS[0], team_id: 'team-e2e-test-001' },
  observations: TEST_OBSERVATIONS,
  teamName: 'E2E Test Team',
  reportDate: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

// ---------------------------------------------------------------------------
// 1. Parent portal — public, no auth required
// ---------------------------------------------------------------------------
test.describe('Parent portal (/share/[token]) — public', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the share token API endpoint (public route)
    await page.route(`**/api/share/${SHARE_TOKEN}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SHARE_API_DATA),
      })
    );
  });

  test('share page loads without authentication', async ({ page }) => {
    await page.goto(SHARE_URL);
    // Should NOT redirect to login
    await expect(page).toHaveURL(new RegExp(SHARE_TOKEN));
  });

  test('share page renders player name and observations', async ({ page }) => {
    await page.goto(SHARE_URL);
    await expect(page.getByText('Alice Walker')).toBeVisible({ timeout: 10000 });
  });

  test('share page shows team name', async ({ page }) => {
    await page.goto(SHARE_URL);
    await expect(page.getByText('E2E Test Team')).toBeVisible({ timeout: 10000 });
  });

  test('expired share token shows error state', async ({ page }) => {
    await page.route(`**/api/share/expired-token`, (route) =>
      route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Share link expired' }),
      })
    );

    await page.goto('/share/expired-token');
    await expect(page).toHaveURL(/\/share\/expired-token/);
    // Page should show some expiry/error message (not a login redirect)
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
  });

  test('invalid share token shows not-found state', async ({ page }) => {
    await page.route(`**/api/share/bad-token-404`, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      })
    );

    await page.goto('/share/bad-token-404');
    await expect(page).toHaveURL(/\/share\/bad-token-404/);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Create share link — authenticated
// ---------------------------------------------------------------------------
test.describe('Create share link (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;

    await mockMeEndpoint(page);
    await mockDataEndpoint(page, {
      players: TEST_PLAYERS,
      observations: TEST_OBSERVATIONS,
    });

    // Mock share link creation
    await page.route('**/api/share/create', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ shareUrl: SHARE_URL }),
      })
    );
  });

  test('player detail page has a Share tab', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    const playerId = TEST_PLAYERS[0].id;
    await page.goto(`/roster/${playerId}`);

    const shareTab = page.getByRole('button', { name: /share/i });
    await expect(shareTab).toBeVisible({ timeout: 10000 });
  });

  test('Share tab shows create link button', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    const playerId = TEST_PLAYERS[0].id;
    await page.goto(`/roster/${playerId}`);

    // Navigate to Share tab
    const shareTab = page.getByRole('button', { name: /share/i });
    await shareTab.click();

    await expect(
      page.getByRole('button', { name: /create.*share.*link|generate.*link/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('clicking create link generates a shareable URL', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    const playerId = TEST_PLAYERS[0].id;
    await page.goto(`/roster/${playerId}`);

    // Navigate to Share tab
    await page.getByRole('button', { name: /share/i }).click();

    // Create the link
    const createBtn = page.getByRole('button', {
      name: /create.*share.*link|generate.*link/i,
    });
    await createBtn.click();

    // Share link input/display should appear
    await expect(page.getByText(/share link created/i)).toBeVisible({ timeout: 10000 });

    // The URL shown should include our share token
    const linkInput = page.locator(`input[value*="${SHARE_TOKEN}"]`);
    await expect(linkInput).toBeVisible();
  });

  test('share link can be copied to clipboard', async ({ page, context }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const playerId = TEST_PLAYERS[0].id;
    await page.goto(`/roster/${playerId}`);
    await page.getByRole('button', { name: /share/i }).click();

    const createBtn = page.getByRole('button', {
      name: /create.*share.*link|generate.*link/i,
    });
    await createBtn.click();
    await expect(page.getByText(/share link created/i)).toBeVisible({ timeout: 10000 });

    // Copy button
    const copyBtn = page.getByRole('button', { name: /copy/i });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Copy success feedback
    await expect(page.getByText(/copied/i)).toBeVisible({ timeout: 3000 });
  });
});
