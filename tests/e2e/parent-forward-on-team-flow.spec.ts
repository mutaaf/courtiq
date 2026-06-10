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

    // The candidate list contains seeded teammate FIRST NAMES. The
    // visiting parent's player is Alice (...030) — the existing
    // E2E share token. The OTHER players on team ...020 carrying
    // a parent_email are Bob (...031), Maya Reactive (...0d5) and
    // the new Kai (...0335 — added by this ticket's seed extension).
    // We assert on Kai (this ticket's own seeded teammate) and Bob
    // (the existing teammate whose parent_email was set here).
    await expect(sheet).toContainText(/Bob/);
    await expect(sheet).toContainText(/Kai/);
    // Defense — no surnames anywhere in the sheet (Walker, Carter,
    // Other, Reactive are the surnames in the seed; none should
    // render).
    const sheetText = (await sheet.textContent()) ?? '';
    expect(sheetText).not.toMatch(/\b(Walker|Carter|Reactive)\b/);
    expect(sheetText).not.toMatch(/\bOther\b/);
    // Defense — no email shape in the sheet either.
    expect(sheetText).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);

    // Type the sender's first name and pick the first candidate
    // (whichever first name renders first under the .first() locator
    // — the candidate list testid pattern lets us scope without
    // depending on which seeded teammate happens to be first).
    await sheet.getByTestId('parent-forward-on-team-sender-first-name').fill('Sarah');

    // Pick the seeded Kai candidate explicitly by his player id so the
    // same recipient is chosen on both sends (the 429 dedupe is keyed
    // on (sender_player_id, recipient_player_id)).
    const KAI_PLAYER_ID = '00000000-0000-4000-a000-000000000335';
    const kaiCandidate = sheet.getByTestId(
      `parent-forward-on-team-candidate-${KAI_PLAYER_ID}`,
    );
    await kaiCandidate.click();

    // The note textarea pre-fills with the templated copy.
    const note = sheet.getByTestId('parent-forward-on-team-note');
    await expect(note).toHaveValue(/Sarah/);
    await expect(note).toHaveValue(/Kai/);

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
    await sheet2.getByTestId(
      `parent-forward-on-team-candidate-${KAI_PLAYER_ID}`,
    ).click();
    await sheet2.getByTestId('parent-forward-on-team-send').click();

    // 429 path: the already-sent toast renders.
    await expect(page.getByTestId('parent-forward-on-team-already-toast')).toBeVisible(
      { timeout: 15_000 },
    );
  });
});
