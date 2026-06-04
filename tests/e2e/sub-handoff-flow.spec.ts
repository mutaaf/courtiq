/**
 * E2E (ticket 0067): substitute-coach Tuesday-night handoff.
 *
 * The /sub/[token] page is a 'use client' component whose GET to
 * /api/sub-handoff/[token] is browser-side (LESSONS#0036), but the route
 * validates the HMAC observer token (same secret as observer-flow). We
 * mint the token + the sub_handoffs row at runtime via the supabase JS
 * client (service role available in CI as SUPABASE_SERVICE_ROLE_KEY).
 *
 * Same skip posture as tests/e2e/observer-flow.spec.ts — skips locally
 * when the service-role key is unset.
 */
import { test, expect } from '@playwright/test';
import crypto from 'crypto';

const SESSION_ID = '00000000-0000-4000-a000-000000000040';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const COACH_ID = '00000000-0000-4000-a000-000000000001';

function observerSecret(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    null
  );
}

function mintObserverToken(sessionId: string, secret: string): string {
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${sessionId}:${expires}`;
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Insert a sub_handoffs row directly via the Supabase REST API using the
 * service-role key. We avoid pulling supabase-js into the spec deps; the
 * `/rest/v1` insert posture is well-known and mirrors what
 * createServiceSupabase() does in the routes.
 */
async function ensureSubHandoff(
  token: string,
  opts: { drills?: boolean; focus?: boolean; eyes?: boolean } = {},
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('seeding requires Supabase URL + service-role key');
  // Idempotent: delete any prior row for this (session, coach) so re-runs
  // don't collide on the UNIQUE constraint.
  await fetch(
    `${url}/rest/v1/sub_handoffs?session_id=eq.${SESSION_ID}&coach_id=eq.${COACH_ID}`,
    {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  );
  const res = await fetch(`${url}/rest/v1/sub_handoffs`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      session_id: SESSION_ID,
      coach_id: COACH_ID,
      observer_token: token,
      sub_first_name: 'Mark',
      include_queued_drills: opts.drills !== false,
      include_weekly_focus: opts.focus !== false,
      include_eyes_on_players: opts.eyes !== false,
    }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`sub_handoffs insert failed: ${res.status} ${await res.text()}`);
  }
}

test.describe('Sub-handoff public page (/sub/[token])', () => {
  const secret = observerSecret();

  test.beforeEach(() => {
    test.skip(
      !secret,
      'Set SUPABASE_SERVICE_ROLE_KEY (CI provides it) to sign a valid sub-handoff token',
    );
  });

  test('renders unauthed (no login redirect) with the seeded H1', async ({ page }) => {
    const token = mintObserverToken(SESSION_ID, secret!);
    await ensureSubHandoff(token);
    await page.goto(`/sub/${token}`);
    await expect(page).not.toHaveURL(/\/login/);
    const h1 = page.getByTestId('sub-handoff-h1');
    await expect(h1).toBeVisible({ timeout: 10000 });
    // Scope to the H1 so the team name doesn't strict-mode-collide with the
    // "E2E" coach first name elsewhere on the page (LESSONS#0082).
    await expect(h1).toContainText('Mark');
  });

  test('drops the focus section when include_weekly_focus is false', async ({ page }) => {
    const token = mintObserverToken(SESSION_ID, secret!);
    await ensureSubHandoff(token, { focus: false });
    await page.goto(`/sub/${token}`);
    await expect(page.getByTestId('sub-handoff-h1')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('sub-handoff-focus')).toHaveCount(0);
  });

  test('an unknown token does not redirect to login', async ({ page }) => {
    await page.goto('/sub/bad-token-does-not-exist');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('NO dashboard chrome on the public surface', async ({ page }) => {
    const token = mintObserverToken(SESSION_ID, secret!);
    await ensureSubHandoff(token);
    await page.goto(`/sub/${token}`);
    await expect(page.getByRole('navigation', { name: /primary|main/i })).toHaveCount(0);
  });
});
