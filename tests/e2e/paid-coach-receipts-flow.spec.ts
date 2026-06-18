/**
 * E2E — ticket 0089 — day-60 paid-coach receipts card.
 *
 * Seed extension: the existing E2E coach (...001) is in the E2E Test Org
 * (...010), which is now stamped with subscription_status='active' and
 * paid_since_at = NOW() - 60 days. That makes the org an active paid
 * org sitting in the middle of the day-56-to-day-90 fire window, so
 * GET /api/coach/paid-receipts returns `eligible: true` for the E2E
 * coach.
 *
 * The card renders UNDER the daily-focus card on /home with a quiet
 * zinc-500 stroke and NO orange accent. Per LESSONS#0029 / #0082,
 * every assertion is scoped by the stable
 * `data-testid="paid-coach-receipts-card"`.
 *
 * Skips when E2E creds are unset (the standard authed-e2e posture).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

test.describe('Day-60 paid-coach receipts card on /home', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('names the day count, the counters, and the next-month compounding line', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    await page.goto('/home');

    const card = page.getByTestId('paid-coach-receipts-card');
    await expect(card).toBeVisible({ timeout: 10000 });

    // Names the integer day count (the headline).
    await expect(card).toContainText(/60/);

    // Names the next-month compounding line. The seeded paid_since_at
    // sits at day 60 (between 56 and 90), so the next-month index is 3
    // and the rendered compounding line names "Month 3" + "returning
    // players".
    await expect(card).toContainText(/month 3/i);
    await expect(card).toContainText(/returning players/i);

    // Defensive: NO upgrade / renew / subscribe CTA on the card. The
    // card is a receipt, not a sales surface.
    const cardText = (await card.textContent()) ?? '';
    expect(cardText.toLowerCase()).not.toContain('upgrade');
    expect(cardText.toLowerCase()).not.toContain('renew');
    expect(cardText.toLowerCase()).not.toContain('subscribe');

    // COPPA: no seeded player name / email / phone / parent message
    // appears in the card (per LESSONS#0029 / #0082 defensive scan).
    await expect(card).not.toContainText(/Alice|Bob|Casey/);
    await expect(card).not.toContainText(/@test\.com/);

    // The card root must NOT carry an orange-accent class (zinc-500
    // stroke posture — orange is reserved for ACTION surfaces).
    const className = (await card.getAttribute('class')) ?? '';
    expect(className).not.toContain('orange-500');
    expect(className).not.toContain('orange-400');
    expect(className).not.toContain('text-orange');
  });

  test('tapping Got it dismisses the card and a reload no longer shows it', async ({ page }) => {
    if (!authenticated) {
      test.skip(
        true,
        'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests',
      );
    }

    await page.goto('/home');
    const card = page.getByTestId('paid-coach-receipts-card');
    if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(
        true,
        'Card already dismissed in a prior run — the POST is idempotent.',
      );
    }

    await page.getByTestId('paid-coach-receipts-card-got-it').click();

    await page.goto('/home');
    await expect(page.getByTestId('paid-coach-receipts-card')).toHaveCount(0);
  });
});
