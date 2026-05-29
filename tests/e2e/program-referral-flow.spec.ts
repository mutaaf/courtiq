/**
 * Ticket 0050 — parent-to-program-director referral, end-to-end against the
 * seeded local Supabase.
 *
 * Two sub-flows:
 *
 *  (1) PARENT FLOW — visit /share/<token> unauthed, tap the "Send this to our
 *      program director" CTA, fill the three required fields, submit, and
 *      assert the section swaps to the confirmation copy. The POST writes one
 *      row to program_referrals (the API test in
 *      tests/api/share-program-referral.test.ts covers the row shape; here
 *      we assert the user-visible confirmation only).
 *
 *  (2) DIRECTOR FLOW — visit /share/<token>?pr=<signed_director_id> with a
 *      LOCALLY-COMPUTED HMAC under the same CRON_SECRET the server uses, and
 *      assert the director-side banner + claim CTA render. Visit the same
 *      URL without `pr` (and with a tampered `pr`) and assert no banner —
 *      same posture as 0042's pause-token verify.
 *
 * Use `data-testid` scoping (LESSONS#0081). Skip when the server-side CRON_SECRET
 * isn't shared with this spec (it always IS in CI — see ci.yml — but a local
 * run without it falls back to skip). `.spec.ts` is the Playwright convention
 * for the e2e directory (vitest excludes `*.spec.ts`).
 */
import { test, expect, Page } from '@playwright/test';
import { createHash, createHmac } from 'node:crypto';

const SHARE_TOKEN = 'test-share-token-e2e-001';
const DIRECTOR_EMAIL = `e2e-director-${Date.now()}@league.org`;
const CRON_SECRET = process.env.CRON_SECRET || '';

// Local helpers — re-implementations of the server signing primitives so the
// spec can verify the director-side render without an additional read
// endpoint. They MUST match src/lib/program-referral-utils.ts byte-for-byte
// (if either changes, both update in the same PR).
function hashDirectorEmail(raw: string): string {
  return createHash('sha256').update(raw.trim().toLowerCase()).digest('hex');
}
function signDirectorId(shareToken: string, hash: string, secret: string): string {
  const hmac = createHmac('sha256', secret)
    .update(`${shareToken}.${hash}`)
    .digest('base64url');
  return `${shareToken}.${hash}.${hmac}`;
}

test.describe('Program-referral flow (ticket 0050)', () => {
  test.skip(!CRON_SECRET, 'CRON_SECRET is not set in the spec env (set in ci.yml).');

  test('parent fills the modal and gets the confirmation', async ({ page }) => {
    // Each spec uses its own director email so the 30-day dedup query
    // doesn't short-circuit across re-runs.
    const localDirector = `parent-flow-${Date.now()}@league.org`;
    await page.goto(`/share/${SHARE_TOKEN}`);

    const section = page.getByTestId('program-referral-section');
    await expect(section).toBeVisible();

    await page.getByTestId('program-referral-open').click();
    const modal = page.getByTestId('program-referral-modal');
    await expect(modal).toBeVisible();

    await modal.getByTestId('program-referral-director-name').fill('Jordan');
    await modal.getByTestId('program-referral-director-email').fill(localDirector);
    await modal.getByTestId('program-referral-note').fill('You have to see this.');
    await modal.getByTestId('program-referral-submit').click();

    // Section swaps to the confirmation copy.
    await expect(
      page.getByTestId('program-referral-section').getByText(/sent to jordan\./i),
    ).toBeVisible();

    // Modal is gone.
    await expect(page.getByTestId('program-referral-modal')).toHaveCount(0);
  });

  test('director-side banner renders only with a verified pr; absent / tampered hides it', async ({ page }) => {
    // 1) Seed a referral via the public POST so a program_referrals row
    //    exists for this director email.
    const submit = await page.request.post(`/api/share/${SHARE_TOKEN}/program-referral`, {
      data: {
        parentFirstName: 'Maria',
        directorFirstName: 'Jordan',
        directorEmail: DIRECTOR_EMAIL,
        note: 'Bringing this back to you.',
      },
    });
    expect(submit.ok()).toBe(true);

    const verifiedPr = signDirectorId(
      SHARE_TOKEN,
      hashDirectorEmail(DIRECTOR_EMAIL),
      CRON_SECRET,
    );

    // 2) With the verified pr → banner + claim CTA render.
    await page.goto(`/share/${SHARE_TOKEN}?pr=${encodeURIComponent(verifiedPr)}`);
    await expect(page.getByTestId('director-referral-banner')).toBeVisible();
    await expect(page.getByTestId('director-referral-banner')).toContainText(/Maria/);
    const claimCta = page.getByTestId('director-claim-cta');
    await expect(claimCta).toBeVisible();
    await expect(claimCta).toHaveAttribute('href', /\/org\/e2e-test-org/);
    await expect(claimCta).toHaveAttribute('href', new RegExp(`pr=${encodeURIComponent(verifiedPr).replace(/[.+?^${}()|[\]\\]/g, '\\$&')}`));

    // 3) Without pr → banner is absent (byte-identical to today's render).
    await page.goto(`/share/${SHARE_TOKEN}`);
    await expect(page.getByTestId('director-referral-banner')).toHaveCount(0);
    await expect(page.getByTestId('director-claim-cta')).toHaveCount(0);

    // 4) With a tampered pr → banner is absent (no banner on a forged token).
    const [tok, hash] = verifiedPr.split('.');
    const forged = `${tok}.${hash}.AAAAAAAAAAAAAAAA`;
    await page.goto(`/share/${SHARE_TOKEN}?pr=${encodeURIComponent(forged)}`);
    await expect(page.getByTestId('director-referral-banner')).toHaveCount(0);
    await expect(page.getByTestId('director-claim-cta')).toHaveCount(0);
  });
});
