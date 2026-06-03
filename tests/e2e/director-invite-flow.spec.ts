/**
 * E2E (ticket 0065): the new director-invite section beneath the 0057
 * weekly-pulse share sheet's Copy-link button.
 *
 * Seeded fixtures:
 *  - the existing 0057 weekly_pulse_shares row owned by the E2E coach
 *    (token `test-weekly-pulse-token-e2e-001`).
 *  - a pre-seeded coach_director_contacts row (Mike, mike+seed@example.test)
 *    so the pre-fill GET returns a contact on the first sheet open.
 *
 * The authed flow:
 *   1) sign in as the E2E coach
 *   2) open /home
 *   3) tap the existing 0057 "Share this week" button
 *   4) the new section renders with the pre-filled name + masked email
 *   5) the test types the email and taps Send
 *   6) the success state surfaces
 *
 * Mock pattern: the create endpoint is mocked at the browser route layer
 * so the test does not depend on a real email send. The component test
 * is the always-green proof that the section mounts + the create POST
 * fires; this spec is the real-rendered proof that the section actually
 * appears inside the 0057 sheet.
 *
 * Scope to data-testid per LESSONS#0081 / #0082 — the E2E coach's first
 * name "E2E" overlaps with the team name "E2E Test Team" per LESSONS
 * #0029. Skip when E2E creds are unset.
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint } from './helpers/auth';

const WEEKLY_PULSE_TOKEN = 'test-weekly-pulse-token-e2e-001';

test.describe('Director-invite section on the weekly-pulse share sheet (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('the section renders inside the share sheet with the pre-filled name + masked email, and Send fires success', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);

    // Mock the create POST so the test does not depend on a real email
    // send. The contact-prefill GET and weekly-pulse/* routes hit the
    // seeded DB for real (browser-side fetch in the client component).
    let createCalled = 0;
    await page.route('**/api/program-director-invites/create', async (route) => {
      createCalled += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sent: true, inviteCount: 2 }),
      });
    });

    await page.goto('/home');

    // The 0057 share card surfaces because the seeded weekly_pulse_shares
    // row + the seeded observations are present. Open the sheet.
    const shareCard = page.getByTestId('weekly-pulse-share-card');
    await expect(shareCard).toBeVisible({ timeout: 10000 });
    const shareButton = page.getByTestId('weekly-pulse-share-button');
    await shareButton.click();

    // The sheet now shows the existing 0057 surfaces AND the new
    // director-invite section beneath the Copy-link / caption block.
    const section = page.getByTestId('director-invite-section');
    await expect(section).toBeVisible({ timeout: 10000 });

    // The Send button's data-share-url is the public URL — the same URL
    // the email carries (LESSONS#0056 / #0082).
    const sendButton = page.getByTestId('director-invite-send-button');
    const shareUrl = await sendButton.getAttribute('data-share-url');
    expect(shareUrl).toContain(`/week/${WEEKLY_PULSE_TOKEN}`);

    // The pre-filled name (Mike) lands in the name input.
    const nameInput = page.getByTestId('director-invite-name-input');
    await expect(nameInput).toHaveValue(/mike/i);

    // The masked email is visible inside the section.
    await expect(section).toContainText(/m\*\*\*@example\.test/);

    // Type the email and tap Send.
    const emailInput = page.getByTestId('director-invite-email-input');
    await emailInput.fill('mike+seed@example.test');
    await sendButton.click();

    // The success state surfaces with the director's name.
    await expect(page.getByTestId('director-invite-success')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('director-invite-success')).toContainText(/sent\. mike will see this card/i);

    // The create POST fired exactly once.
    expect(createCalled).toBe(1);
  });
});
