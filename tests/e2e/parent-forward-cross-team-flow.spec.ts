/**
 * Ticket 0080 — parent → parent cross-team-same-program forward,
 * end-to-end against the seeded local Supabase.
 *
 * Sub-flows:
 *
 *  (1) CANDIDATE LIST — visit /share/<token> unauthed. Wait for the
 *      ParentForwardOnTeamButton to render. Tap it. Switch to the
 *      "In your program" tab. Assert the candidate list lists the
 *      seeded Bears players (Bear + Cub — the seed extension), each
 *      labelled with the team name ("E2E Bears U12"). NEVER a
 *      surname or a parent email shape.
 *
 *  (2) SEND — type a sender first name, select Bear, tap Send. The
 *      POST hits the real /api/share/parent-forward, asserts SAME
 *      `org_id`, mints a recipient portal token against the Bears
 *      coach (NOT the Hawks coach), writes ONE parent_forward_signals
 *      row with `cross_team = true`, and dispatches ONE email (no
 *      RESEND_API_KEY in CI → the dispatch logs rather than sends).
 *
 *  (3) ALREADY-SENT — re-open the sheet, re-select Bear, tap Send
 *      again; the route returns 429 already_sent and the UI flips to
 *      the cross-team already-sent toast naming Bear.
 *
 * Use data-testid scoping (LESSONS#0029 / #0081 / #0082) — the parent
 * portal is a multi-CTA surface with two forward tabs.
 *
 * The parent-portal page is a SERVER component (LESSONS#0009): every
 * assertion is backed by a real seeded row (the seeded second team,
 * its head coach in team_coaches, and the two seeded Bears players).
 *
 * `.spec.ts` is the Playwright convention here (vitest excludes
 * `*.spec.ts` under tests/, but Playwright's testDir is tests/e2e/).
 */
import { test, expect } from '@playwright/test';

const SHARE_TOKEN = 'test-share-token-e2e-001';
const BEAR_PLAYER_ID = '00000000-0000-4000-a000-000000000342';
const CUB_PLAYER_ID = '00000000-0000-4000-a000-000000000343';

test.describe('Parent forward cross-team-same-program flow (ticket 0080)', () => {
  test('program tab candidate list + send → sent toast → re-send → already toast', async ({ page }) => {
    await page.goto(`/share/${SHARE_TOKEN}`);

    const trigger = page.getByTestId('parent-forward-on-team-button');
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();

    // Switch to the "In your program" tab — only renders when there
    // ARE program-mate candidates.
    const programTab = page.getByTestId('parent-forward-in-program-tab');
    await expect(programTab).toBeVisible();
    await programTab.click();

    const sheet = page.getByTestId('parent-forward-in-program-sheet');
    await expect(sheet).toBeVisible();

    // The candidate list contains both seeded Bears players, labelled
    // with the seeded team name. Per LESSONS#0121 the names Bear /
    // Cub are seeded explicitly so the spec asserts on names that
    // actually exist (no Liam / Devon collisions with prose).
    await expect(sheet).toContainText(/Bear/);
    await expect(sheet).toContainText(/Cub/);
    await expect(sheet).toContainText(/E2E Bears U12/);

    // Defense — no email shape anywhere in the sheet.
    const sheetText = (await sheet.textContent()) ?? '';
    expect(sheetText).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    // Defense — no Hawks players (those live on the first tab).
    expect(sheetText).not.toMatch(/\bKai\b/);
    expect(sheetText).not.toMatch(/\bBob\b/);

    // Type the sender's first name and pick the Bear candidate by id.
    await sheet
      .getByTestId('parent-forward-in-program-sender-first-name')
      .fill('Sarah');
    const bearCandidate = sheet.getByTestId(
      `parent-forward-in-program-candidate-${BEAR_PLAYER_ID}`,
    );
    await bearCandidate.click();

    // The note textarea pre-fills with the cross-team templated copy.
    const note = sheet.getByTestId('parent-forward-in-program-note');
    await expect(note).toHaveValue(/Sarah/);
    await expect(note).toHaveValue(/Bear/);
    await expect(note).toHaveValue(/program/i);

    await sheet.getByTestId('parent-forward-in-program-send').click();

    // 200 path: the cross-team sent toast renders.
    const sentToast = page.getByTestId('parent-forward-in-program-sent-toast');
    await expect(sentToast).toBeVisible({ timeout: 15_000 });
    await expect(sentToast).toContainText(/parent in your program/i);

    // Re-open. The button is gone in the sent state — reload the
    // page to reset the local UI, then re-open the sheet and re-send
    // to hit the 429 already_sent path.
    await page.reload();
    await page.getByTestId('parent-forward-on-team-button').click();
    await page.getByTestId('parent-forward-in-program-tab').click();
    const sheet2 = page.getByTestId('parent-forward-in-program-sheet');
    await expect(sheet2).toBeVisible();
    await sheet2
      .getByTestId('parent-forward-in-program-sender-first-name')
      .fill('Sarah');
    await sheet2
      .getByTestId(`parent-forward-in-program-candidate-${BEAR_PLAYER_ID}`)
      .click();
    await sheet2.getByTestId('parent-forward-in-program-send').click();

    // 429 path: the cross-team already-sent toast renders.
    const alreadyToast = page.getByTestId(
      'parent-forward-in-program-already-toast',
    );
    await expect(alreadyToast).toBeVisible({ timeout: 15_000 });
    await expect(alreadyToast).toContainText(/Bear/);

    // The cross-team Cub candidate stays selectable (its own edge is
    // independent under UNIQUE(sender_player_id, recipient_player_id)).
    // Reload one more time and confirm Cub is still in the list.
    await page.reload();
    await page.getByTestId('parent-forward-on-team-button').click();
    await page.getByTestId('parent-forward-in-program-tab').click();
    const sheet3 = page.getByTestId('parent-forward-in-program-sheet');
    await expect(
      sheet3.getByTestId(`parent-forward-in-program-candidate-${CUB_PLAYER_ID}`),
    ).toBeVisible();
  });
});
