/**
 * E2E: the coach-private weekly coaching digest card on /home (ticket 0023).
 *
 * Follows the same convention as capture-arc-continuity.spec.ts:
 *  - /home is a middleware-protected route — without real auth cookies it
 *    redirects to /login, so these specs sign in via the UI and test.skip() when
 *    E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (the PR-gating CI runner).
 *  - We mock POST /api/ai/weekly-digest (and /api/me, /api/data) so the page
 *    renders deterministically without depending on a live AI call. The endpoint
 *    is server-backed; the CI-gating proof for the card's UI states is the
 *    component vitest suite in tests/components/weekly-digest-card.test.tsx +
 *    the route suite in tests/ai/weekly-digest.test.ts. This spec guards the live
 *    page wiring (the real useQuery → POST /api/ai/weekly-digest read and the
 *    free-tier UpgradeGate) whenever creds are supplied. The seed provides a week
 *    of observations for the seeded team so the un-mocked endpoint also resolves.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockDataEndpoint, TEST_COACH, TEST_TEAM } from './helpers/auth';

const CARD = '[data-testid="weekly-digest-card"]';

/** The real POST /api/ai/weekly-digest shape ({ digest }). */
const SEEDED_DIGEST = {
  digest: {
    week_summary: 'Last week — 2 practices, 5 notes. The team brought real defensive energy.',
    top_players: [
      { player_name: 'Alice', note: 'Locked down on defense and led the hustle.' },
      { player_name: 'Bob', note: 'Read the help defense and finished strong.' },
    ],
    next_action: {
      label: "Send Alice's parents her report",
      kind: 'parent_report',
      rationale: "It has been three weeks since Alice's family got an update.",
    },
  },
};

async function mockDigestEndpoint(
  page: import('@playwright/test').Page,
  payload: unknown,
  status = 200,
) {
  await page.route('**/api/ai/weekly-digest', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
  );
}

async function mockMeWithTier(page: import('@playwright/test').Page, tier: string) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coach: { ...TEST_COACH, organizations: { id: TEST_COACH.org_id, tier } },
        teams: [TEST_TEAM],
      }),
    })
  );
}

test.describe('Weekly coaching digest card on /home (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
    await mockDataEndpoint(page, {});
  });

  // AC (Playwright): a coach-tier coach with a week of observations sees the
  // digest card with the week summary text and a next-action button.
  test('a coach-tier coach sees the digest card with the week summary and a next-action button', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'coach');
    await mockDigestEndpoint(page, SEEDED_DIGEST);

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText(/2 practices, 5 notes/i);
    await expect(card.getByRole('link', { name: /send alice's parents her report/i })).toBeVisible();
  });

  // AC (Playwright): a free-tier coach sees an UpgradeGate prompt for the digest,
  // not the digest itself.
  test('a free-tier coach sees the upgrade prompt for the digest, not the digest', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'free');
    // Even if the endpoint would return a digest, the free coach never sees it.
    await mockDigestEndpoint(page, SEEDED_DIGEST);

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();

    // The digest body is gated; the upgrade prompt for the weekly digest is shown.
    await expect(page.getByText(/weekly digest/i).first()).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  // AC (best-effort): when the digest read fails, the home screen renders normally
  // and the card is absent — the digest never blocks the home screen.
  test('home renders normally and the digest card is absent when the read fails', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'coach');
    await mockDigestEndpoint(page, { error: 'boom' }, 500);

    await page.goto('/home');
    // Home screen still renders its primary heading.
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  // AC (best-effort): a quiet week ({ digest: null }) → card absent, home normal.
  test('a quiet week with a null digest shows no card and a normal home screen', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeWithTier(page, 'coach');
    await mockDigestEndpoint(page, { digest: null });

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: TEST_TEAM.name })).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(0);
  });
});
