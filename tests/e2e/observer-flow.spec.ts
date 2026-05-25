/**
 * E2E (ticket 0029): the conversion footer on the public, no-auth observer page
 * at /observe/[token].
 *
 * The observer page is a CLIENT component that fetches its data from
 * /api/observe/[token] (service-role read) — so every assertion below is backed
 * by REAL rows in tests/e2e/fixtures/seed.sql:
 *   - the seeded practice session (...040) on the E2E Test Team
 *   - that team's roster (Alice Walker, Bob Carter)
 *   - the seeded host coach 'E2E Test Coach' whose deterministic
 *     makeReferralCode is 'AAAAAA' (the all-zero UUID → CHARS[0]='A'), the same
 *     code every other referral surface deep-links to (LESSONS.md 2026-05-21
 *     ship/0011 — reuse the seeded coach so the code matches without a new row).
 *
 * The observer token is a stateless HMAC over `${sessionId}:${expires}` signed
 * with the server's secret (SUPABASE_SERVICE_ROLE_KEY in CI, available to this
 * step via $GITHUB_ENV). We mint it here with the SAME algorithm + secret
 * resolution as src/lib/observer-utils.ts so the server validates it. When the
 * secret is unset (local runs without CI env), we skip — matching the
 * E2E-creds-unset convention used by the authenticated share-control specs.
 */
import { test, expect } from '@playwright/test';
import crypto from 'crypto';

// Mirror the seed: the practice session id + the host coach's deterministic code.
const SESSION_ID = '00000000-0000-4000-a000-000000000040';
const COACH_REF = 'AAAAAA';
// Host coach full_name is 'E2E Test Coach'; the footer names the FIRST name only.
const COACH_FIRST = 'E2E';

// Same secret resolution order as src/lib/observer-utils.ts getSecret().
function observerSecret(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    null
  );
}

// Same token construction as generateObserverToken() — base64url(payload).sig.
function mintObserverToken(sessionId: string, secret: string): string {
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${sessionId}:${expires}`;
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

test.describe('Observer conversion footer (/observe/[token]) — helper-to-coach', () => {
  const secret = observerSecret();

  test.beforeEach(() => {
    test.skip(
      !secret,
      'Set SUPABASE_SERVICE_ROLE_KEY (CI provides it) to sign a valid observer token'
    );
  });

  test('no conversion footer before any observation is saved', async ({ page }) => {
    const token = mintObserverToken(SESSION_ID, secret!);
    await page.goto(`/observe/${token}`);

    // The capture UI has loaded (the sentiment toggle is present) but nothing
    // is saved yet, so the footer CTA must NOT be on the page.
    await expect(page.getByRole('button', { name: /positive/i })).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('link', { name: /start your own team/i })
    ).toHaveCount(0);
  });

  test('after saving one observation the footer shows the count + coach + ref CTA', async ({ page }) => {
    const token = mintObserverToken(SESSION_ID, secret!);
    await page.goto(`/observe/${token}`);

    // Step 1 — sentiment.
    await page.getByRole('button', { name: /positive/i }).click();
    // Step 2 — template (basketball default; "Great shooting form" is first).
    await page.getByRole('button', { name: /great shooting form/i }).click();
    // Step 3 — pick the first player to save.
    await page.getByRole('button', { name: /alice/i }).click();

    // A save succeeded — the saved-count strip confirms it.
    await expect(page.getByText(/1 observation saved/i)).toBeVisible({ timeout: 10000 });

    // The conversion footer now names the count + the host coach FIRST name…
    const footer = page.getByRole('link', { name: /start your own team/i });
    await expect(footer).toBeVisible();
    await expect(page.getByText(new RegExp(COACH_FIRST))).toBeVisible();

    // …and the CTA deep-links to /signup?ref=<host code>.
    const href = await footer.getAttribute('href');
    expect(href).toContain(`/signup?ref=${COACH_REF}`);

    // COPPA: the footer carries no player name.
    const footerContainer = page.getByTestId('observer-conversion-footer');
    await expect(footerContainer).not.toContainText('Alice');
    await expect(footerContainer).not.toContainText('Walker');
  });
});
