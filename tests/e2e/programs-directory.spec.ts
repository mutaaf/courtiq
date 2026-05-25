/**
 * E2E (ticket 0033): the public, no-auth program directory at /programs and the
 * per-team "Coach this team — free" claim CTA on /org/<slug>.
 *
 * Both pages are SERVER components whose data-fetching runs server-side and is
 * NOT intercepted by page.route() (browser layer only) — so every assertion
 * below is backed by REAL rows in tests/e2e/fixtures/seed.sql:
 *   - a DISCOVERABLE org ('Discoverable Rec League', slug 'discoverable-rec')
 *     with settings.discoverable = true + one active team ('U10 Hawks').
 *   - the existing default org ('E2E Test Org', slug 'e2e-test-org') has NO
 *     discoverable flag → it is the negative (must-be-absent) case.
 * Constants here mirror that seed 1:1 (LESSONS.md 2026-05-21 ship/0009).
 *
 * Name/text assertions are scoped to stable data-testid containers to avoid
 * strict-mode collisions (LESSONS.md re: 0022/0029).
 */
import { test, expect } from '@playwright/test';

// Matches the seed: the opted-in org and its team.
const DISCOVERABLE_ORG_NAME = 'Discoverable Rec League';
const DISCOVERABLE_ORG_SLUG = 'discoverable-rec';
const DISCOVERABLE_TEAM_ID = '00000000-0000-4000-a000-000000000220';

// The default E2E org — present in the DB but NOT opted into discovery.
const NON_OPTED_ORG_NAME = 'E2E Test Org';

test.describe('Public program directory (/programs) — cold-inbound discovery', () => {
  test('renders without authentication (no login redirect)', async ({ page }) => {
    await page.goto('/programs');
    await expect(page).toHaveURL(/\/programs/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('lists the opted-in program and NOT a non-opted-in org', async ({ page }) => {
    await page.goto('/programs');
    const directory = page.getByTestId('programs-directory');
    // The discoverable org appears by name.
    await expect(directory.getByText(DISCOVERABLE_ORG_NAME)).toBeVisible({ timeout: 10000 });
    // The non-opted-in org must NOT appear (the opt-in gate working).
    await expect(directory.getByText(NON_OPTED_ORG_NAME)).toHaveCount(0);
  });

  test('each listed program links to /org/<slug>', async ({ page }) => {
    await page.goto('/programs');
    const row = page
      .getByTestId('program-row')
      .filter({ hasText: DISCOVERABLE_ORG_NAME });
    await expect(row).toBeVisible({ timeout: 10000 });
    const href = await row.getAttribute('href');
    expect(href).toBe(`/org/${DISCOVERABLE_ORG_SLUG}`);
  });

  test('exposes NO player name and no dashboard chrome (COPPA + public surface)', async ({ page }) => {
    await page.goto('/programs');
    // Seeded minor names must never render on the directory.
    await expect(page.locator('body')).not.toContainText('Alice Walker');
    await expect(page.locator('body')).not.toContainText('Bob Carter');
    // Not the logged-in app.
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
  });

  test('exposes an OG title naming the directory for cold-search indexability', async ({ page }) => {
    await page.goto('/programs');
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveCount(1);
    const content = await ogTitle.getAttribute('content');
    expect(content).toMatch(/program directory/i);
  });
});

test.describe('Per-team claim CTA on /org/<slug>', () => {
  test('shows a "Coach this team — free" CTA deep-linking to the claim signup', async ({ page }) => {
    await page.goto(`/org/${DISCOVERABLE_ORG_SLUG}`);
    await expect(page).not.toHaveURL(/\/login/);

    const cta = page.getByTestId('claim-team-cta').first();
    await expect(cta).toBeVisible({ timeout: 10000 });
    await expect(cta).toContainText(/coach this team/i);

    const href = await cta.getAttribute('href');
    expect(href).toBe(
      `/signup?org=${DISCOVERABLE_ORG_SLUG}&team=${DISCOVERABLE_TEAM_ID}`,
    );
  });
});
