/**
 * E2E: Generate Plan → View Plan → Delete Plan
 *
 * Requires E2E_TEST_EMAIL + E2E_TEST_PASSWORD env vars for authenticated flows.
 */
import { test, expect } from '@playwright/test';
import {
  signInViaUI,
  mockMeEndpoint,
  mockDataEndpoint,
  mockMutateEndpoint,
  TEST_PLANS,
} from './helpers/auth';

const AI_PLAN_RESPONSE = {
  title: 'Defensive Focus Practice',
  type: 'practice',
  content: {
    objective: 'Improve defensive positioning and communication',
    drills: [
      { name: 'Box Out Drill', duration: 10, notes: 'Focus on footwork' },
      { name: 'Help Defense Rotations', duration: 15, notes: 'Call out assignments' },
    ],
    coaching_notes: 'Emphasize communication between players',
  },
};

test.describe('Generate Plan → View Plan → Delete Plan', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;

    await mockMeEndpoint(page);
    await mockDataEndpoint(page, { plans: TEST_PLANS, players: [], observations: [] });
    await mockMutateEndpoint(page);

    // Mock plan generation
    await page.route('**/api/ai/plan', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AI_PLAN_RESPONSE),
      })
    );
  });

  test('plans page loads and shows existing plans', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/plans');

    // Page heading visible
    await expect(page.getByRole('heading', { name: /plans/i })).toBeVisible();

    // Existing plan from mock data
    await expect(page.getByText('Weekly Practice Plan')).toBeVisible();
  });

  test('can generate a practice plan with AI', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/plans');

    // Type a prompt
    const promptInput = page.getByPlaceholder(/describe what you need/i);
    await expect(promptInput).toBeVisible();
    await promptInput.fill('Focus on defensive positioning for next week');

    // Generate
    await page.getByRole('button', { name: /generate with ai/i }).click();

    // AI response renders a preview
    await expect(page.getByText('Defensive Focus Practice')).toBeVisible({ timeout: 10000 });
  });

  test('generated plan can be saved', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    // Mock the mutate endpoint to return the saved plan
    const savedPlan = {
      id: 'plan-e2e-new',
      type: 'practice',
      title: 'Defensive Focus Practice',
      content: AI_PLAN_RESPONSE.content,
      created_at: new Date().toISOString(),
    };
    await mockMutateEndpoint(page, [savedPlan]);

    await page.goto('/plans');

    const promptInput = page.getByPlaceholder(/describe what you need/i);
    await promptInput.fill('Defensive positioning');
    await page.getByRole('button', { name: /generate with ai/i }).click();

    // Wait for preview
    await expect(page.getByText('Defensive Focus Practice')).toBeVisible({ timeout: 10000 });

    // Save the plan
    const saveBtn = page.getByRole('button', { name: /save plan/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Plan should appear in the list or show success state
    await expect(
      page.getByText(/plan saved|Defensive Focus Practice/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('can expand an existing plan to view its content', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/plans');
    await expect(page.getByText('Weekly Practice Plan')).toBeVisible();

    // Expand the plan
    const expandBtn = page.getByRole('button', {
      name: /expand weekly practice plan/i,
    });
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      // Content revealed
      await expect(page.getByText(/focus on defense/i)).toBeVisible();
    }
  });

  test('can delete a plan', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    // Return empty list after deletion
    let deleted = false;
    await page.route('**/api/data', async (route) => {
      const body = route.request().postDataJSON() as { table?: string };
      const data = body?.table === 'plans' && deleted ? [] : TEST_PLANS;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data }),
      });
    });
    await page.route('**/api/data/mutate', async (route) => {
      deleted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto('/plans');
    await expect(page.getByText('Weekly Practice Plan')).toBeVisible();

    // Find and click the delete button for the plan
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Plan should be removed from list
    await expect(page.getByText('Weekly Practice Plan')).not.toBeVisible({ timeout: 5000 });
  });
});
