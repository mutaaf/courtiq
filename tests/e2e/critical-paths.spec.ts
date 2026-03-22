import { test, expect } from '@playwright/test';

test.describe('Critical User Journeys', () => {
  test('Login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('Signup page loads', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('text=Create your account')).toBeVisible();
  });

  test('Health check returns ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('Unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Parent portal share page loads for valid token format', async ({ page }) => {
    // Even with invalid token, the page structure should load
    await page.goto('/share/test-token-123');
    // The page should attempt to load (won't redirect to login)
    await expect(page).toHaveURL(/\/share\/test-token-123/);
  });
});
