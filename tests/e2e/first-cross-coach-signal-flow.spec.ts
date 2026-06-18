/**
 * E2E — ticket 0088 — first cross-coach signal activation card.
 *
 * Seed extension: the existing E2E coach (...001) already has a
 * drill_shares row (...0111) and a drill_share_clones row (...0360)
 * pointing at cloner ...0112 in the same org — that alone would
 * fire the activation card with the in-org cloner name. To make the
 * assertion name "Maya" and "Hornets" deterministically (per the
 * AC's example), the seed extension in this ticket adds:
 *  - "Maya Reactive" coach in the seeded Hornets U10 org (the
 *    org was added by ticket 0084's seed and currently has no
 *    coaches);
 *  - an EARLIER drill_share_clones row (cloned 10 days ago) from
 *    Maya on the E2E coach's drill so it is the EARLIEST cross-
 *    coach signal in the helper's chronological scan.
 *
 * The card renders at the TOP of /home above the existing cards.
 * Per LESSONS#0029 / #0082, every assertion is scoped by the
 * stable `data-testid="first-cross-coach-signal-card"`.
 *
 * Skips when E2E creds are unset (the standard authed-e2e posture).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

test.describe('First cross-coach signal activation card on /home', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('names the cloning coach, the cloning program, and the artifact', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    await page.goto('/home');

    // Scope to the stable test id (LESSONS#0029 / #0082).
    const card = page.getByTestId('first-cross-coach-signal-card');
    await expect(card).toBeVisible({ timeout: 10000 });

    // Names the seeded cloner first name only (LESSONS#0061 — never a surname).
    await expect(card).toContainText(/Maya/);
    // Names the seeded cloning program.
    await expect(card).toContainText(/Hornets/i);
    // Names the artifact label.
    await expect(card).toContainText(/closeout/i);

    // Privacy: the card must NEVER show a player name or parent email.
    // The seeded players (Alice, Bob, Casey) and the E2E coach's email
    // (e2e@test.com) MUST NOT appear on this card.
    await expect(card).not.toContainText(/Alice|Bob|Casey/);
    await expect(card).not.toContainText(/@test\.com/);

    // The primary "Publish another" CTA is a navigable link.
    const publishCta = page.getByTestId('first-cross-coach-signal-card-publish');
    await expect(publishCta).toBeVisible();
    const href = await publishCta.getAttribute('href');
    expect(href).toMatch(/drill/i);
  });

  test('tapping Got it dismisses the card and a reload no longer shows it', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    await page.goto('/home');
    const card = page.getByTestId('first-cross-coach-signal-card');
    // If a prior test already dismissed the card on the same seed run,
    // skip the dismiss assertion (Playwright projects are independent
    // but the dismiss writes to the DB, so cross-test idempotency
    // matters). The dismiss POST is idempotent regardless.
    if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(
        true,
        'Card already dismissed in a prior run — POST is idempotent.',
      );
    }

    await page.getByTestId('first-cross-coach-signal-card-got-it').click();

    await page.goto('/home');
    await expect(page.getByTestId('first-cross-coach-signal-card')).toHaveCount(0);
  });
});
