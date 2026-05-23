/**
 * E2E (ticket 0024): the program-staff-invite growth surface.
 *
 * Two surfaces:
 *  1. The PUBLIC org landing page /org/<slug>?invite=staff — a SERVER component
 *     whose getOrgData() fetch runs server-side and is NOT intercepted by
 *     page.route() (browser layer only), so its assertions are backed by REAL
 *     rows in tests/e2e/fixtures/seed.sql (the seeded org 'e2e-test-org' with
 *     branding + a team). LESSONS.md 2026-05-21 ship/0009.
 *  2. The AUTHENTICATED director-side "Bring your coaching staff" control on
 *     /settings/referrals — requires real auth, so it test.skip()s on the CI
 *     runner (no creds) exactly like invite-coach-button.spec.ts; /api/org/invite
 *     is mocked so the share URL is deterministic.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint } from './helpers/auth';

// Matches the organizations row seeded in tests/e2e/fixtures/seed.sql.
const ORG_SLUG = 'e2e-test-org';
const ORG_NAME = 'E2E Test Org';
const ORG_INVITE_URL = `/org/${ORG_SLUG}?invite=staff`;

test.describe('Public org landing page with staff invite (/org/[slug])', () => {
  // AC8: visiting /org/<slug>?invite=staff unauthenticated renders the branded
  // page with NO dashboard chrome and NO login required.
  test('renders without authentication (no login redirect)', async ({ page }) => {
    await page.goto(ORG_INVITE_URL);
    await expect(page).toHaveURL(new RegExp(ORG_SLUG));
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('renders the branded program hero (org name)', async ({ page }) => {
    await page.goto(ORG_INVITE_URL);
    await expect(page.getByRole('heading', { name: ORG_NAME })).toBeVisible({ timeout: 10000 });
  });

  // AC8: the "Get started free" CTA deep-links to /signup?org=<slug>.
  test('shows a "Get Started Free" CTA that deep-links to /signup?org=<slug>', async ({ page }) => {
    await page.goto(ORG_INVITE_URL);
    const cta = page.getByRole('link', { name: /get started free/i });
    await expect(cta.first()).toBeVisible({ timeout: 10000 });
    const href = await cta.first().getAttribute('href');
    expect(href).toContain(`/signup?org=${ORG_SLUG}`);
  });

  test('has NO dashboard chrome (it is a standalone public surface)', async ({ page }) => {
    await page.goto(ORG_INVITE_URL);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });
});

test.describe('Director "Bring your coaching staff" control (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  // AC7: a director whose org has a slug sees the control with the org link.
  test('control is visible and data-share-url carries /org/<slug>?invite=staff', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';
    const url = `${base}/org/${ORG_SLUG}?invite=staff`;
    await page.route('**/api/org/invite', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url }),
      })
    );

    await page.goto('/settings/referrals');

    const btn = page.getByRole('button', { name: /bring your coaching staff/i });
    await expect(btn).toBeVisible();
    const shareUrl = await btn.getAttribute('data-share-url');
    expect(shareUrl).toContain(`/org/${ORG_SLUG}?invite=staff`);
  });

  // AC7: a coach with no org slug sees a "create your program first" hint.
  test('shows a "create your program first" hint when url is null', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);
    await page.route('**/api/org/invite', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: null }),
      })
    );

    await page.goto('/settings/referrals');

    await expect(page.getByText(/create your program first/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /bring your coaching staff/i })
    ).toHaveCount(0);
  });
});
