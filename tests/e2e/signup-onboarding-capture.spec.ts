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

  // ── Warm referral landing (ticket 0021) ──────────────────────────────────
  // The signup page client-fetches /api/referrals/lookup?code=<ref> and, when
  // it resolves, names the inviting coach in the banner. The lookup is backed by
  // the seeded coach whose preferences.referral_code = 'AAAAAA' (= makeReferralCode
  // of the seeded coach UUID, full_name 'E2E Test Coach'), so /signup?ref=AAAAAA
  // resolves to "Coach E2E invited you". This is the SAME code the team-card /
  // season-recap CTAs already deep-link to.
  const SEEDED_REF = 'AAAAAA';

  test('signup?ref=<valid code> names the inviting coach in the banner', async ({ page }) => {
    await page.goto(`/signup?ref=${SEEDED_REF}`);

    // Generic "a fellow coach" copy is replaced by the named-coach copy once the
    // lookup resolves (text matches /coach \w+ invited/i per the ticket AC).
    await expect(page.getByText(/coach \w+ invited/i).first()).toBeVisible({ timeout: 10000 });
    // The anonymous fallback copy must NOT be the visible description anymore.
    await expect(page.getByText('You were invited by a fellow coach!')).toHaveCount(0);
    // The form still works — the page is the real signup, not an error.
    await expect(page.getByLabel('Full Name')).toBeVisible();
  });

  test('signup?ref=<unresolvable code> falls back to the generic referral banner', async ({ page }) => {
    // A well-formed-but-unknown code resolves to no coach → the lookup returns
    // { coachFirstName: null } and the page keeps today's generic copy.
    await page.goto('/signup?ref=ZZZZZZ');

    await expect(page.getByText('You were invited by a fellow coach!')).toBeVisible({ timeout: 10000 });
    // No named-coach banner for an unresolvable code.
    await expect(page.getByText(/coach \w+ invited/i)).toHaveCount(0);
    // Signup still works.
    await expect(page.getByLabel('Full Name')).toBeVisible();
  });

  test('signup with NO ref param shows the default headline and no referral banner', async ({ page }) => {
    await page.goto('/signup');

    // Default headline only when no code is present.
    await expect(page.getByText('Start coaching smarter with SportsIQ')).toBeVisible();
    // Neither referral banner variant appears.
    await expect(page.getByText('You were invited by a fellow coach!')).toHaveCount(0);
    await expect(page.getByText(/coach \w+ invited/i)).toHaveCount(0);
    await expect(page.getByText(/referral applied/i)).toHaveCount(0);
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
// 3. Onboarding — public page (combined sport + team setup)
// ---------------------------------------------------------------------------
// Sport selection and team creation were merged into a single
// /onboarding/setup page; the legacy /onboarding/sport and /onboarding/team
// routes now redirect() here (ticket 0007, spawned from 0006). /onboarding is
// in middleware publicPaths, so the page renders without auth — these blocks
// assert against its real DOM (the SPORTS array, the age-group <select>, the
// team-name + season Inputs, and the single Continue button's enable logic).

test.describe('Onboarding — sport selection', () => {
  // The combined setup page exposes one <button> card per sport in the SPORTS
  // array. Each card holds two spans — the emoji icon and the name — so the
  // button's accessible name is "<emoji> <name>" (e.g. "🏀 Basketball"). Match
  // by a name *substring* regex (not exact) so the emoji prefix doesn't break
  // the locator; the names below are unique enough that the regex stays
  // strict-mode-safe.
  const EXPECTED_SPORTS = [
    /basketball/i,
    /soccer/i,
    /volleyball/i,
    /flag football/i,
    /baseball/i,
    /softball/i,
    /lacrosse/i,
    /swimming/i,
    /tennis/i,
    /gymnastics/i,
  ];

  test('shows the combined setup page with all 10 sports', async ({ page }) => {
    await page.goto('/onboarding/setup');
    // CardTitle renders a <div> (not an <hN>) app-wide, so match by text —
    // same pattern the Signup/Login blocks above use for their card titles.
    await expect(page.getByText(/set up your team/i)).toBeVisible();

    // Each sport is its own button; Basketball/Soccer/Volleyball are called out
    // explicitly by the ticket acceptance criteria.
    for (const sport of EXPECTED_SPORTS) {
      await expect(page.getByRole('button', { name: sport })).toBeVisible();
    }
  });

  test('continue button is disabled until a sport is selected', async ({ page }) => {
    await page.goto('/onboarding/setup');
    // No sport picked and team name empty → primary button stays disabled.
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeDisabled();
  });

  test('selecting a sport alone is not enough to enable Continue', async ({ page }) => {
    await page.goto('/onboarding/setup');

    // Picking a sport reflects the active (orange) state on the card...
    const basketball = page.getByRole('button', { name: /basketball/i });
    await basketball.click();
    await expect(basketball).toHaveClass(/border-orange-500/);

    // ...but canSubmit = !!sport && teamName.trim() > 0, so an empty team name
    // keeps Continue disabled.
    await expect(page.getByRole('button', { name: /continue/i })).toBeDisabled();
  });
});

test.describe('Onboarding — team creation', () => {
  test('shows team-name, age-group, and season controls', async ({ page }) => {
    await page.goto('/onboarding/setup');

    await expect(page.getByPlaceholder('Blue Tigers')).toBeVisible();
    // Age-group control is a native <select> (no htmlFor on its label), so we
    // target it by role rather than getByLabel.
    await expect(page.getByRole('combobox')).toBeVisible();
    // Season Input is pre-filled by defaultSeason(); its placeholder still resolves it.
    await expect(page.getByPlaceholder('Spring 2026')).toBeVisible();
  });

  test('Continue is disabled with an empty team name even after picking a sport', async ({ page }) => {
    await page.goto('/onboarding/setup');
    await page.getByRole('button', { name: /basketball/i }).click();
    await expect(page.getByPlaceholder('Blue Tigers')).toHaveValue('');
    await expect(page.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  test('picking a sport and naming the team enables Continue', async ({ page }) => {
    await page.goto('/onboarding/setup');

    await page.getByRole('button', { name: /basketball/i }).click();
    await page.getByPlaceholder('Blue Tigers').fill('Thunder Hawks');

    await expect(page.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  test('the age-group control offers the four AGE_GROUPS options', async ({ page }) => {
    await page.goto('/onboarding/setup');

    const select = page.getByRole('combobox');
    // Defaults to the 8-10 ("Juniors") band.
    await expect(select).toHaveValue('8-10');
    await expect(select.getByRole('option')).toHaveCount(4);
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
