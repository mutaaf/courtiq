/**
 * E2E: Admin Panel → Invite Coach → Change Role
 *
 * Requires E2E_TEST_EMAIL + E2E_TEST_PASSWORD env vars AND the account must
 * have the 'admin' role. Tests skip gracefully when credentials are absent.
 */
import { test, expect } from '@playwright/test';
import {
  signInViaUI,
  mockMeEndpoint,
  TEST_COACH,
} from './helpers/auth';

const MOCK_COACHES = [
  {
    id: TEST_COACH.id,
    full_name: 'E2E Test Coach',
    email: 'e2e@test.com',
    role: 'admin',
  },
  {
    id: 'coach-e2e-002',
    full_name: 'Jane Assistant',
    email: 'jane@test.com',
    role: 'assistant',
  },
  {
    id: 'coach-e2e-003',
    full_name: 'Sam Head Coach',
    email: 'sam@test.com',
    role: 'head_coach',
  },
];

test.describe('Admin Panel → Invite Coach → Change Role', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;

    await mockMeEndpoint(page);

    // Mock GET /api/admin/coaches
    await page.route('**/api/admin/coaches', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ coaches: MOCK_COACHES }),
        });
      } else if (route.request().method() === 'POST') {
        // Invite a new coach
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else if (route.request().method() === 'PATCH') {
        // Update role
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Admin panel loads
  // -------------------------------------------------------------------------
  test('admin page loads and shows coach list', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/admin');

    // Admin heading
    await expect(
      page.getByRole('heading', { name: /admin|organization/i })
    ).toBeVisible({ timeout: 10000 });

    // Coach names from mock
    await expect(page.getByText('Jane Assistant')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Sam Head Coach')).toBeVisible();
  });

  test('shows each coach email', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/admin');
    await expect(page.getByText('jane@test.com')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('sam@test.com')).toBeVisible();
  });

  test('shows role badges for each coach', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/admin');
    // Role options exist in the selects rendered for each coach
    const roleSelects = page.locator('select');
    await expect(roleSelects).toHaveCount(MOCK_COACHES.length, { timeout: 10000 });
  });

  // -------------------------------------------------------------------------
  // Invite coach
  // -------------------------------------------------------------------------
  test('invite section is visible with email input', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/admin');

    await expect(page.getByText(/invite coach/i)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /invite/i })).toBeVisible();
  });

  test('invite button is disabled with empty email', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/admin');
    await expect(page.getByRole('button', { name: /^invite$/i })).toBeDisabled({ timeout: 10000 });
  });

  test('can invite a coach by email', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/admin');

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('newcoach@example.com');
    await expect(page.getByRole('button', { name: /^invite$/i })).toBeEnabled();

    await page.getByRole('button', { name: /^invite$/i }).click();

    // Success message
    await expect(
      page.getByText(/invitation sent to newcoach@example.com/i)
    ).toBeVisible({ timeout: 5000 });

    // Input clears after successful invite
    await expect(emailInput).toHaveValue('');
  });

  // -------------------------------------------------------------------------
  // Change role
  // -------------------------------------------------------------------------
  test('role select is pre-filled with current role', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Jane's select should show 'assistant'
    const janeRow = page.locator('[class*="flex"]').filter({ hasText: 'Jane Assistant' });
    const janeSelect = janeRow.locator('select');
    await expect(janeSelect).toHaveValue('assistant', { timeout: 10000 });
  });

  test('changing a role sends PATCH request and shows updated value', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    // Track PATCH call
    let patchedRole = '';
    await page.route('**/api/admin/coaches', async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as { role?: string };
        patchedRole = body?.role ?? '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ coaches: MOCK_COACHES }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Change Jane's role from assistant → coach
    const janeRow = page.locator('[class*="flex"]').filter({ hasText: 'Jane Assistant' });
    const janeSelect = janeRow.locator('select');
    await janeSelect.selectOption('coach');

    // PATCH should have been called with the new role
    await page.waitForTimeout(500); // allow debounce/async update
    expect(patchedRole).toBe('coach');
  });

  // -------------------------------------------------------------------------
  // Non-admin guard
  // -------------------------------------------------------------------------
  test('non-admin coaches cannot see the admin page', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    // Override /api/me to return a non-admin coach
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          coach: { ...TEST_COACH, role: 'coach' },
          teams: [],
        }),
      })
    );

    await page.goto('/admin');

    // Should show an access denied message (not the coach list)
    await expect(page.getByText(/jane assistant/i)).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/access denied|admin only|not authorized/i)
    ).toBeVisible({ timeout: 5000 });
  });
});
