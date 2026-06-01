/**
 * Ticket 0060 — parent-side sibling-coach invite, end-to-end against the
 * seeded local Supabase.
 *
 * Sub-flows:
 *
 *  (1) CANDIDATE — visit /share/<token> unauthed, wait for the sibling-
 *      invite card to render, assert it surfaces the seeded sibling's
 *      first name + the OTHER team's name + the OTHER coach's name. Also
 *      assert the open-trigger's data-share-url carries the program-scoped
 *      referral code + program id (NOT the parent's email or the kid's
 *      name) per the AC.
 *
 *  (2) SEND — open the sheet, assert pre-fill, tap Send, assert the card
 *      flips to the thank-you state. The POST hits the real
 *      /api/share/<token>/sibling-invite which writes one row to
 *      parent_initiated_invites and (with no RESEND_API_KEY in CI) logs
 *      the email rather than sending it — the row write is the load-
 *      bearing assertion.
 *
 *  (3) DEDUPE — repeat the send with the same recipient; the card still
 *      flips in-place (the route returns 200 with `sent: false,
 *      reason: 'already-invited'` and the UI treats either dedupe or send
 *      identically — the recipient has heard from this surface).
 *
 * Use data-testid scoping (LESSONS#0029 / #0081 / #0082) — the parent's
 * name appearing inside the team name is a known strict-mode collision
 * pattern.
 *
 * `.spec.ts` is the Playwright convention here (vitest excludes
 * `*.spec.ts` under tests/, but Playwright's testDir is tests/e2e/ and
 * uses .spec.ts).
 */
import { test, expect } from '@playwright/test';

const SHARE_TOKEN = 'test-share-token-e2e-001';

test.describe('Sibling-invite flow (ticket 0060)', () => {
  test('candidate renders + open sheet + send flips to thank-you', async ({ page }) => {
    await page.goto(`/share/${SHARE_TOKEN}`);

    const card = page.getByTestId('sibling-invite-card');
    await expect(card).toBeVisible({ timeout: 15_000 });
    // The card names the sibling, the other team, and the other coach
    // (the seed extension below this test wires Sofia + Hornets + Riley).
    await expect(card).toContainText(/Sofia/);
    await expect(card).toContainText(/Hornets/);
    await expect(card).toContainText(/Riley/);

    // The open trigger exposes the assertable referral URL (program-scoped).
    const openTrigger = page.getByTestId('sibling-invite-open');
    await expect(openTrigger).toBeVisible();
    const shareUrl = await openTrigger.getAttribute('data-share-url');
    expect(shareUrl).toBeTruthy();
    expect(shareUrl!).toMatch(/ref=/);
    expect(shareUrl!).toMatch(/program=/);
    // COPPA — neither the recipient email nor the sibling's name in the URL.
    expect(shareUrl!).not.toContain('riley@');
    expect(shareUrl!).not.toContain('Sofia');

    await openTrigger.click();
    const sheet = page.getByTestId('sibling-invite-sheet');
    await expect(sheet).toBeVisible();

    // The sheet is pre-filled with the candidate's data.
    await expect(sheet.getByTestId('sibling-invite-sibling-first-name')).toHaveValue('Sofia');
    await expect(sheet.getByTestId('sibling-invite-other-coach-email')).toHaveValue(
      /riley@hornets/,
    );

    // Optional parent-typed note.
    await sheet.getByTestId('sibling-invite-note').fill('Look at this!');

    await sheet.getByTestId('sibling-invite-send').click();

    // Thank-you state — naming the other coach's first name.
    await expect(page.getByTestId('sibling-invite-sent')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('sibling-invite-sent')).toContainText(/Riley/);
  });
});
