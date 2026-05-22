/**
 * E2E: "Invite your assistant coach" button on /settings/referrals (ticket 0015).
 *
 * Follows the same convention as capture-usage-meter.spec.ts and capture-carryover.spec.ts:
 *  - Requires real auth (signs in via UI); test.skip() when creds are unset (CI runner).
 *  - Mocks /api/referrals so the share URL is deterministic.
 *
 * AC5: authenticated coach sees the invite button with data-share-url containing /signup?ref=
 * AC6 (signup capture regression): already covered by share-flow.spec.ts — /signup?ref=CODE
 *     still records referred_by_code. No new spec needed here.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, TEST_COACH, TEST_TEAM } from './helpers/auth';

// The seeded coach's lazily-generated code (all-zero hex → CHARS[0]='A' ×6)
const INVITE_CODE = 'AAAAAA';

async function mockReferralsEndpoint(page: import('@playwright/test').Page, code: string | null) {
  await page.route('**/api/referrals', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code, referralCount: 0, rewardEarned: false }),
    })
  );
}

async function mockMeEndpoint(page: import('@playwright/test').Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coach: { ...TEST_COACH, organizations: { id: TEST_COACH.org_id, tier: 'coach' } },
        teams: [TEST_TEAM],
      }),
    })
  );
}

test.describe('Invite coach button on /settings/referrals (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  // AC5: coach sees the invite button with /signup?ref= in data-share-url
  test('invite button is visible and data-share-url carries the referral code', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);
    await mockReferralsEndpoint(page, INVITE_CODE);

    await page.goto('/settings/referrals');

    const btn = page.getByRole('button', { name: /invite your assistant coach/i });
    await expect(btn).toBeVisible();
    const shareUrl = await btn.getAttribute('data-share-url');
    expect(shareUrl).toContain(`/signup?ref=${INVITE_CODE}`);
  });

  // Fallback: invite button still visible when code is null; falls back to bare URL
  test('invite button visible and falls back to base URL when code is null', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);
    await mockReferralsEndpoint(page, null);

    await page.goto('/settings/referrals');

    const btn = page.getByRole('button', { name: /invite your assistant coach/i });
    await expect(btn).toBeVisible();
    const shareUrl = await btn.getAttribute('data-share-url');
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';
    expect(shareUrl).toBe(base);
  });
});
