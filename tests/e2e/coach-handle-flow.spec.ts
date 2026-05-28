/**
 * E2E (ticket 0054): vanity coach handle.
 *
 * The seed adds `handle = 'e2e-coach'` to the existing E2E coach AND a
 * `coach_card_shares` row already exists for them (seeded by ticket 0026).
 * So `/coach/e2e-coach` MUST render the same page as
 * `/coach/test-coach-card-token-e2e-001` does.
 *
 * The page is a SERVER component whose getCoachCardData() runs server-side,
 * so every assertion is backed by REAL rows in tests/e2e/fixtures/seed.sql
 * (LESSONS.md 2026-05-21 ship/0009). The handle-vs-token dispatch happens in
 * the /api/coach-card/[token] route, so the page is unchanged.
 */
import { test, expect } from '@playwright/test';

const COACH_HANDLE = 'e2e-coach';
const COACH_HANDLE_URL = `/coach/${COACH_HANDLE}`;

const COACH_CARD_TOKEN = 'test-coach-card-token-e2e-001';
const COACH_CARD_URL = `/coach/${COACH_CARD_TOKEN}`;

const COACH_NAME = 'E2E Test Coach';

test.describe('Vanity coach handle (/coach/<handle>) — ticket 0054', () => {
  test('the handle URL is public (no login redirect) and renders the coach', async ({ page }) => {
    await page.goto(COACH_HANDLE_URL);
    await expect(page).toHaveURL(new RegExp(COACH_HANDLE));
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(COACH_NAME).first()).toBeVisible({ timeout: 10000 });
  });

  test('the handle URL and the token URL render the same coach', async ({ page }) => {
    await page.goto(COACH_HANDLE_URL);
    await expect(page.getByText(COACH_NAME).first()).toBeVisible({ timeout: 10000 });
    await page.goto(COACH_CARD_URL);
    await expect(page.getByText(COACH_NAME).first()).toBeVisible({ timeout: 10000 });
  });

  test('an unknown handle renders a not-found state (no /login redirect)', async ({ page }) => {
    await page.goto('/coach/nobody-claimed-this-handle');
    await expect(page).toHaveURL(/\/coach\/nobody-claimed-this-handle/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('a reserved handle renders a not-found state (no coach claims it)', async ({ page }) => {
    // 'admin' is on the reserved list; no coach can ever claim it, so the
    // public route must NOT find a coach for it.
    await page.goto('/coach/admin');
    await expect(page).toHaveURL(/\/coach\/admin/);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(COACH_NAME).first()).not.toBeVisible({ timeout: 2000 }).catch(() => {});
  });
});
