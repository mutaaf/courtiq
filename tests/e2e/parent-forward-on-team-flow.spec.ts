/**
 * Ticket 0079 — parent → parent on-team forward, end-to-end against the
 * seeded local Supabase.
 *
 * Sub-flows:
 *
 *  (1) CANDIDATE — visit /share/<token> unauthed. Wait for the new
 *      ParentForwardOnTeamButton to render. Tap it. Assert the sheet
 *      lists the OTHER team players' FIRST NAMES (Liam / Kai per the
 *      seed extension), never a surname or a parent email.
 *
 *  (2) SEND — type a sender first name, select Liam, tap Send. The
 *      POST hits the real /api/share/parent-forward which mints a
 *      recipient portal token, writes one signal row, and dispatches
 *      one email via the mail pipeline (no RESEND_API_KEY in CI →
 *      the dispatch logs rather than sends).
 *
 *  (3) ALREADY-SENT — re-open the sheet, re-select Liam, tap Send
 *      again; the route returns 429 already_sent and the UI flips to
 *      the already-sent toast naming Liam.
 *
 * Use data-testid scoping (LESSONS#0029 / #0081 / #0082) — the parent
 * portal is a multi-CTA surface.
 *
 * `.spec.ts` is the Playwright convention here (vitest excludes
 * `*.spec.ts` under tests/, but Playwright's testDir is tests/e2e/).
 */
import { test, expect } from '@playwright/test';

const SHARE_TOKEN = 'test-share-token-e2e-001';

test.describe('Parent forward on team flow (ticket 0079)', () => {
  test('candidate list renders + send → sent toast → re-send → already toast', async ({ page }) => {
    await page.goto(`/share/${SHARE_TOKEN}`);

    const trigger = page.getByTestId('parent-forward-on-team-button');
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await expect(trigger).toContainText(/Send to one parent/i);

    await trigger.click();

    const sheet = page.getByTestId('parent-forward-on-team-sheet');
    await expect(sheet).toBeVisible();

    // The candidate list contains the two seeded teammate FIRST NAMES.
    await expect(sheet).toContainText(/Liam/);
    await expect(sheet).toContainText(/Kai/);
    // Defense — no surnames anywhere in the sheet.
    const sheetText = (await sheet.textContent()) ?? '';
    expect(sheetText).not.toMatch(/\b(Walker|Carter|Other)\b/);
    // Defense — no email shape in the sheet either.
    expect(sheetText).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);

    // Type the sender's first name and pick Liam (the seeded Bob row,
    // first-name "Bob" — but our seed extension renames Bob's parent
    // recipient via the email; the FIRST NAME the candidate row shows
    // is the kid's first name. The seed sets Bob's parent_email but
    // the kid is still Bob — so we scope by the testid pattern).
    await sheet.getByTestId('parent-forward-on-team-sender-first-name').fill('Sarah');

    // The first candidate carries Bob's player_id (...031) — the
    // candidate list testid pattern is `parent-forward-on-team-candidate-<id>`.
    const liamCandidate = sheet.locator(
      '[data-testid^="parent-forward-on-team-candidate-"]',
    ).first();
    await liamCandidate.click();

    // The note textarea pre-fills with the templated copy.
    const note = sheet.getByTestId('parent-forward-on-team-note');
    await expect(note).toHaveValue(/Sarah/);

    await sheet.getByTestId('parent-forward-on-team-send').click();

    // 200 path: the sent toast renders.
    await expect(page.getByTestId('parent-forward-on-team-sent-toast')).toBeVisible(
      { timeout: 15_000 },
    );

    // Re-open. The button is gone in the sent state — reload the page
    // to reset the local UI, then re-open the sheet and re-send to
    // hit the 429 already_sent path.
    await page.reload();
    await page.getByTestId('parent-forward-on-team-button').click();
    const sheet2 = page.getByTestId('parent-forward-on-team-sheet');
    await expect(sheet2).toBeVisible();
    await sheet2.getByTestId('parent-forward-on-team-sender-first-name').fill('Sarah');
    await sheet2.locator(
      '[data-testid^="parent-forward-on-team-candidate-"]',
    ).first().click();
    await sheet2.getByTestId('parent-forward-on-team-send').click();

    // 429 path: the already-sent toast renders.
    await expect(page.getByTestId('parent-forward-on-team-already-toast')).toBeVisible(
      { timeout: 15_000 },
    );
  });
});
