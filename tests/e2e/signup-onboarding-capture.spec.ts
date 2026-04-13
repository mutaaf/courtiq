/**
 * E2E: Signup → Onboarding → Capture → Review → Save
 *
 * Public flows (signup form, onboarding pages) run unconditionally.
 * Authenticated flows (capture → review → save) run when E2E_TEST_EMAIL
 * and E2E_TEST_PASSWORD env vars are set, or when using a saved auth state.
 */
import { test, expect } from '@playwright/test';
import {
  signInViaUI,
  mockMeEndpoint,
  mockDataEndpoint,
  mockMutateEndpoint,
  injectPendingObservations,
} from './helpers/auth';

// ---------------------------------------------------------------------------
// 1. Signup page
// ---------------------------------------------------------------------------
test.describe('Signup page', () => {
  test('renders signup form with all required fields', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByLabel('Full Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByText(/13 years or older/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('submit button is disabled until age confirmation is checked', async ({ page }) => {
    await page.goto('/signup');

    await page.getByLabel('Full Name').fill('Test Coach');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');

    const submitBtn = page.getByRole('button', { name: /create account/i });
    // Button is disabled until the age checkbox is ticked
    await expect(submitBtn).toBeDisabled();

    await page.getByText(/13 years or older/i).click();
    await expect(submitBtn).toBeEnabled();
  });

  test('shows sign-in link for existing users', async ({ page }) => {
    await page.goto('/signup');
    const signInLink = page.getByRole('link', { name: /sign in/i });
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute('href', '/login');
  });
});

// ---------------------------------------------------------------------------
// 2. Login page
// ---------------------------------------------------------------------------
test.describe('Login page', () => {
  test('renders login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/welcome back/i)).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows signup link', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible();
  });

  test('unauthenticated request to /home redirects to login', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ---------------------------------------------------------------------------
// 3. Onboarding — public pages
// ---------------------------------------------------------------------------
test.describe('Onboarding — sport selection', () => {
  test('shows sport selection with at least 3 sports', async ({ page }) => {
    await page.goto('/onboarding/sport');
    await expect(page.getByText(/choose your sport/i)).toBeVisible();

    const sportCards = page.locator('[class*="cursor-pointer"]').filter({ hasText: /basketball|football|soccer/i });
    await expect(sportCards).toHaveCount(3, { timeout: 5000 });
  });

  test('continue button is disabled until a sport is selected', async ({ page }) => {
    await page.goto('/onboarding/sport');
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeDisabled();
  });

  test('selecting a sport enables the continue button', async ({ page }) => {
    await page.goto('/onboarding/sport');

    // Click on Basketball card
    await page.getByText('Basketball').click();
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeEnabled();
  });
});

test.describe('Onboarding — team creation', () => {
  test('shows team creation form', async ({ page }) => {
    await page.goto('/onboarding/team');
    await expect(page.getByText(/create your team/i)).toBeVisible();
    await expect(page.getByPlaceholder('Blue Tigers')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
    await expect(page.getByPlaceholder('Spring 2026')).toBeVisible();
  });

  test('create team button is disabled with empty team name', async ({ page }) => {
    await page.goto('/onboarding/team');
    const createBtn = page.getByRole('button', { name: /create team/i });
    await expect(createBtn).toBeDisabled();
  });

  test('filling team name enables create button', async ({ page }) => {
    await page.goto('/onboarding/team');
    await page.getByPlaceholder('Blue Tigers').fill('Thunder Hawks');
    const createBtn = page.getByRole('button', { name: /create team/i });
    await expect(createBtn).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// 4. Authenticated: Capture → Review → Save
// ---------------------------------------------------------------------------
test.describe('Capture → Review → Save (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;

    await mockMeEndpoint(page);
    await mockDataEndpoint(page, { players: [] });
    await mockMutateEndpoint(page, [{ id: 'obs-new-001' }]);
  });

  test('capture page loads with recording controls', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await page.goto('/capture');
    await expect(page.getByRole('heading', { name: /capture/i })).toBeVisible();
    // Quick note input is visible in idle state
    await expect(page.getByPlaceholder(/marcus showed great/i)).toBeVisible();
  });

  test('review page shows pending observations from sessionStorage', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await injectPendingObservations(page);
    await page.goto('/capture/review');

    await expect(page.getByRole('heading', { name: /review observations/i })).toBeVisible();
    await expect(page.getByText('Great lateral movement on defense')).toBeVisible();
    await expect(page.getByText('Struggled with ball handling under pressure')).toBeVisible();
  });

  test('can save observations from review page', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await injectPendingObservations(page);
    await page.goto('/capture/review');

    // Confirm all observations
    const confirmAllBtn = page.getByRole('button', { name: /confirm all/i });
    if (await confirmAllBtn.isVisible()) {
      await confirmAllBtn.click();
    }

    // Click the save button
    const saveBtn = page.getByRole('button', { name: /save \d+ observation/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Success state
    await expect(page.getByText(/observations saved/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /capture more/i })).toBeVisible();
  });

  test('review page shows back link to /capture', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await injectPendingObservations(page);
    await page.goto('/capture/review');

    const backLink = page.getByRole('link', { name: /capture/i }).first();
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', '/capture');
  });

  test('can edit an observation before saving', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    await injectPendingObservations(page);
    await page.goto('/capture/review');

    // Click Edit on the first observation
    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Textarea should appear
    const textarea = page.locator('textarea[rows="3"]');
    await expect(textarea).toBeVisible();
    await textarea.clear();
    await textarea.fill('Excellent lateral movement — improved from last week');

    // Save the edit
    await page.getByRole('button', { name: /save/i }).first().click();

    // Updated text should appear
    await expect(page.getByText('Excellent lateral movement — improved from last week')).toBeVisible();
  });
});
