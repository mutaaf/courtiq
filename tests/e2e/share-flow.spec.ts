/**
 * E2E: Create Share Link → View Parent Portal
 *
 * The share link creation requires authentication (player profile page).
 * The parent portal (/share/[token]) is fully public — tested without auth.
 */
import { test, expect } from '@playwright/test';
import {
  signInViaUI,
  mockMeEndpoint,
  mockDataEndpoint,
  TEST_PLAYERS,
  TEST_OBSERVATIONS,
} from './helpers/auth';

// SHARE_TOKEN matches the parent_shares row in tests/e2e/fixtures/seed.sql
// (applied to the real local Supabase in CI). The portal assertions below are
// fed by the SHARE_API_DATA mock at the browser layer, but the seed mirrors
// the same player ("Alice Walker") / team ("E2E Test Team") so the un-mocked
// /api/share/<token> route renders identical data — see ticket 0006.
const SHARE_TOKEN = 'test-share-token-e2e-001';
const SHARE_URL = `/share/${SHARE_TOKEN}`;

// Ticket 0011: the seeded coach (id 00000000-0000-4000-a000-000000000001) has
// NO preferences.referral_code, so GET /api/share/<token> lazily generates
// makeReferralCode(coach uuid) — all-zero hex bytes → CHARS[0]='A' ×6 = 'AAAAAA'
// (the same code team-card-flow.spec.ts asserts for the same coach). The
// "Share with your other coach" CTA must thread it into /signup?ref=AAAAAA.
const SHARE_REF = 'AAAAAA';

// Shared portal data mirroring GET /api/share/[token] response.
//
// NOTE: the parent portal is a SERVER component — its getShareData() fetch runs
// server-side and is NOT intercepted by page.route() (which only sees the
// browser network layer). In CI the rendered HTML therefore comes entirely from
// the SEEDED Supabase via the real /api/share/<token> route. These mock objects
// mirror the seed 1:1 (tests/e2e/fixtures/seed.sql) so every assertion below is
// backed by a real seeded row, not just a mock. See ticket 0006 + 0009.
const SHARE_API_DATA = {
  player: { ...TEST_PLAYERS[0], team_id: 'team-e2e-test-001' },
  team: { name: 'E2E Test Team', age_group: '11-13', season: 'Spring 2026' },
  coachName: 'E2E Test Coach',
  observations: TEST_OBSERVATIONS,
  // Existing portal sections (ticket 0009 regression floor): a starred
  // observation (Coach's Best Moments), a skill challenge (Practice at Home),
  // and a report card so the viral CTA + sections all render.
  starredObservations: [
    { category: 'Defense', sentiment: 'positive', text: 'Great lateral movement on defense', created_at: new Date().toISOString() },
  ],
  skillChallenge: {
    player_name: 'Alice Walker',
    week_label: 'Week of May 18',
    parent_note: 'Two quick drills to try at home this week.',
    challenges: [
      { title: 'Defensive Slides', skill_area: 'Defense', difficulty: 'beginner', minutes_per_day: 10, description: 'Practice lateral slides.', steps: ['Set two cones', 'Slide between them'], success_criteria: '10 clean slides', encouragement: 'Stay low!' },
    ],
  },
  reportCard: { strengths: ['On-ball defense'], coach_message: 'A real anchor on defense this season.' },
  totalObservationCount: 3,
  reportDate: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

// ── Ticket 0009: Player of the Week / Player of the Match spotlight ──────────
// A second player (Bob Carter) + share token WITH a recent player_of_match
// spotlight. SPOTLIGHT_ARTIFACT fields below MUST match the player_of_match
// plan seeded for Bob in tests/e2e/fixtures/seed.sql exactly — the assertions
// read from the rendered (seed-backed) card, not the mock.
const SPOTLIGHT_TOKEN = 'test-share-token-e2e-spotlight';
const SPOTLIGHT_URL = `/share/${SPOTLIGHT_TOKEN}`;
const SPOTLIGHT_ARTIFACT = {
  player_name: 'Bob Carter',
  session_label: 'Game vs. Lincoln',
  headline: 'Owned the paint all game',
  achievement: 'Crashed the boards relentlessly and protected the rim on every possession.',
  key_moment: 'Blocked the buzzer-beater to seal the win.',
  coach_message: 'You were the difference-maker out there today, Bob!',
};
const SPOTLIGHT_API_DATA = {
  player: { ...TEST_PLAYERS[1], team_id: 'team-e2e-test-001' },
  team: { name: 'E2E Test Team', age_group: '11-13', season: 'Spring 2026' },
  coachName: 'E2E Test Coach',
  playerSpotlight: SPOTLIGHT_ARTIFACT,
  totalObservationCount: 4,
  reportDate: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// 1. Parent portal — public, no auth required
// ---------------------------------------------------------------------------
test.describe('Parent portal (/share/[token]) — public', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the share token API endpoints (public routes). These are vestigial
    // for the rendered HTML in CI (the server component fetch isn't intercepted
    // — see note above), but kept for the existing spec contract and to fulfil
    // any client-layer requests deterministically.
    await page.route(`**/api/share/${SHARE_TOKEN}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SHARE_API_DATA),
      })
    );
    await page.route(`**/api/share/${SPOTLIGHT_TOKEN}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SPOTLIGHT_API_DATA),
      })
    );
  });

  test('share page loads without authentication', async ({ page }) => {
    await page.goto(SHARE_URL);
    // Should NOT redirect to login
    await expect(page).toHaveURL(new RegExp(SHARE_TOKEN));
  });

  test('share page renders player name and observations', async ({ page }) => {
    await page.goto(SHARE_URL);
    await expect(page.getByText('Alice Walker')).toBeVisible({ timeout: 10000 });
  });

  test('share page shows team name', async ({ page }) => {
    await page.goto(SHARE_URL);
    // The team name renders in the <h1> heading AND inside the greeting
    // sentence ("…with E2E Test Team."), so a plain getByText is a strict-mode
    // violation. Target the heading — that's the element this test is about.
    await expect(
      page.getByRole('heading', { name: 'E2E Test Team' })
    ).toBeVisible({ timeout: 10000 });
  });

  // ── Ticket 0009: spotlight card on the parent portal ──────────────────────

  test('portal WITH a recent spotlight renders a Player of the Week/Match card', async ({ page }) => {
    // Bob Carter's seeded share has a player_of_match plan (seed.sql) — the
    // real /api/share path renders his Player of the Match card.
    await page.goto(SPOTLIGHT_URL);

    // The card is titled "Player of the Week" or "Player of the Match".
    await expect(
      page.getByText(/Player of the (Week|Match)/i)
    ).toBeVisible({ timeout: 10000 });

    // The artifact's headline and the coach's message both render.
    await expect(page.getByText(SPOTLIGHT_ARTIFACT.headline)).toBeVisible();
    await expect(page.getByText(SPOTLIGHT_ARTIFACT.coach_message)).toBeVisible();
  });

  test('portal WITHOUT a spotlight renders normally and shows no spotlight card', async ({ page }) => {
    // SHARE_API_DATA has no playerSpotlight field at all.
    await page.goto(SHARE_URL);

    // The player still renders…
    await expect(page.getByText('Alice Walker')).toBeVisible({ timeout: 10000 });
    // …but there is no spotlight card.
    await expect(page.getByText(/Player of the (Week|Match)/i)).toHaveCount(0);
  });

  // ── Ticket 0013: the link PREVIEW (OG title) celebrates the spotlight ──────
  // generateMetadata branches on playerSpotlight: Bob's seeded player_of_match
  // plan yields a "Player of the Match" OG title; Alice (no spotlight) keeps the
  // generic "Progress Report" OG title. We read the rendered <head> meta tags.

  test('the OG title for a spotlight token reads "Player of the Match"', async ({ page }) => {
    // Bob Carter's seeded share has a player_of_match plan (seed.sql).
    await page.goto(SPOTLIGHT_URL);
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /Player of the Match/i, { timeout: 10000 });
  });

  test('the OG title for a non-spotlight token stays the generic "Progress Report"', async ({ page }) => {
    // Alice Walker has no weekly_star/player_of_match plan — generic preview.
    await page.goto(SHARE_URL);
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /Progress Report/i, { timeout: 10000 });
    await expect(ogTitle).not.toHaveAttribute('content', /Player of the/i);
  });

  test('existing portal sections still render alongside the spotlight feature', async ({ page }) => {
    await page.goto(SHARE_URL);

    // Report card / coach note, starred observations, skill challenge, viral CTA
    // all still render for a player who has them — the 0009 regression floor.
    await expect(page.getByText("Coach's Best Moments")).toBeVisible({ timeout: 10000 });
    // The starred observation text can surface in both "Coach's Best Moments"
    // and "Recent Observations"; .first() avoids a strict-mode duplicate match.
    await expect(page.getByText('Great lateral movement on defense').first()).toBeVisible();
    await expect(page.getByText('Practice at Home')).toBeVisible();
    // The viral CTA component renders near the bottom of every portal.
    await expect(page.getByText(/SportsIQ/).first()).toBeVisible();
  });

  // ── Ticket 0011: referral code threaded into the viral CTA ────────────────

  test('the "Share with your other coach" CTA carries the coach referral code', async ({ page }) => {
    // The seeded coach has no referral_code, so the real /api/share path lazily
    // generates 'AAAAAA' and the server-rendered page passes it to the CTA.
    await page.goto(SHARE_URL);
    const cta = page.getByRole('button', { name: /share with your other coach/i });
    await expect(cta).toBeVisible({ timeout: 10000 });
    // The CTA shares via navigator.share/clipboard (no <a href>), so it exposes
    // the constructed URL on the button via data-share-url for assertion.
    const shareUrl = await cta.getAttribute('data-share-url');
    expect(shareUrl).toContain(`/signup?ref=${SHARE_REF}`);
  });

  // Regression: the /signup?ref=CODE capture path (/api/auth/setup → preferences
  // .referred_by_code) is unchanged and still honored. The signup page reflects
  // the applied referral when arrived-at via the CTA's deep link.
  test('/signup?ref=CODE is still honored — the signup page shows the referral applied', async ({ page }) => {
    await page.goto(`/signup?ref=${SHARE_REF}`);
    await expect(page).toHaveURL(/\/signup\?ref=/);
    // Signup page surfaces the captured referral; /api/auth/setup persists it on
    // submit (referred_by_code), unchanged by ticket 0011.
    await expect(page.getByText(/referral applied/i)).toBeVisible({ timeout: 10000 });
  });

  // ── Ticket 0019: a SECOND, distinct self-signup CTA on the portal ─────────
  // The "Start your own team — free" CTA converts a parent-who-is-also-a-coach
  // directly into a coach signup. Unlike the forward button it is a PLAIN
  // server-rendered <a href> (works without JS) carrying the same coach's
  // referral code. The seeded coach's code is 'AAAAAA' (SHARE_REF).

  test('the "Start your own team" CTA is a real link to /signup?ref=<code>', async ({ page }) => {
    await page.goto(SHARE_URL);
    const startCta = page.getByRole('link', { name: /start your own team/i });
    await expect(startCta).toBeVisible({ timeout: 10000 });
    // A plain link (not a JS share handler) — assertable by href directly.
    await expect(startCta).toHaveAttribute('href', `/signup?ref=${SHARE_REF}`);
  });

  test('both portal CTAs coexist — the forward button AND the self-signup link', async ({ page }) => {
    await page.goto(SHARE_URL);
    // The existing forward button (ticket 0011) is not removed or replaced…
    await expect(
      page.getByRole('button', { name: /share with your other coach/i })
    ).toBeVisible({ timeout: 10000 });
    // …and the new self-signup link sits alongside it.
    await expect(
      page.getByRole('link', { name: /start your own team/i })
    ).toBeVisible();
  });

  // COPPA: the outbound /signup link carries ONLY the referral code — no player
  // name, no parent contact, no token-derived PII in the href.
  test('the self-signup CTA href exposes only ref=<code> (no player/token PII)', async ({ page }) => {
    await page.goto(SHARE_URL);
    const href = await page
      .getByRole('link', { name: /start your own team/i })
      .getAttribute('href');
    expect(href).toBe(`/signup?ref=${SHARE_REF}`);
    expect(href).not.toContain('Alice');
    expect(href).not.toContain(SHARE_TOKEN);
  });

  // ── Ticket 0022: the reaction thank-you screen becomes a viral fork point ──
  // After a parent submits a reaction (real public POST /api/parent-reactions on
  // the seeded share token), the success state surfaces BOTH a "share with the
  // other parents" forward control AND a "start your own team" self-signup link
  // carrying the same seeded coach's referral code ('AAAAAA' / SHARE_REF). The
  // page-bottom CTAs (0011/0019) are unchanged — these actions are ADDED on the
  // success micro-surface, at the parent's peak-engagement moment.

  test('submitting a reaction shows both viral actions with the coach referral code', async ({ page }) => {
    await page.goto(SHARE_URL);

    // Pick a reaction (aria-labelled by getReactionLabel) to expand the form,
    // then submit. The seeded token is active so the real POST returns 200.
    await page.getByRole('button', { name: /love it/i }).click();
    await page.getByRole('button', { name: /send .* to coach/i }).click();

    // The success confirmation renders…
    await expect(page.getByText(/message sent/i)).toBeVisible({ timeout: 10000 });

    // …and below it, the self-signup link carries the seeded coach's ref code.
    const startCta = page.getByRole('link', { name: /start your own team/i });
    await expect(startCta).toBeVisible();
    await expect(startCta).toHaveAttribute('href', `/signup?ref=${SHARE_REF}`);

    // …and the forward control reuses the navigator.share/clipboard path, so it
    // exposes the constructed URL via data-share-url (no <a href>; LESSONS#11).
    const forwardCta = page.getByRole('button', { name: /share .* with the other parents/i });
    await expect(forwardCta).toBeVisible();
    const shareUrl = await forwardCta.getAttribute('data-share-url');
    expect(shareUrl).toContain(`/signup?ref=${SHARE_REF}`);
  });

  // Regression: the success-screen actions are ADDED — the page-bottom forward
  // CTA (0011) and the 0019 self-signup CTA still render on the un-submitted page.
  test('the page-bottom CTAs (0011/0019) still render — this ticket only ADDS to the success screen', async ({ page }) => {
    await page.goto(SHARE_URL);
    // The bottom-of-page forward button (0011) is still present pre-submit…
    await expect(
      page.getByRole('button', { name: /share with your other coach/i })
    ).toBeVisible({ timeout: 10000 });
    // …and the bottom-of-page self-signup link (0019) is still present.
    await expect(
      page.getByRole('link', { name: /start your own team/i })
    ).toBeVisible();
  });

  test('expired share token shows error state', async ({ page }) => {
    await page.route(`**/api/share/expired-token`, (route) =>
      route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Share link expired' }),
      })
    );

    await page.goto('/share/expired-token');
    await expect(page).toHaveURL(/\/share\/expired-token/);
    // Page should show some expiry/error message (not a login redirect)
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
  });

  test('invalid share token shows not-found state', async ({ page }) => {
    await page.route(`**/api/share/bad-token-404`, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      })
    );

    await page.goto('/share/bad-token-404');
    await expect(page).toHaveURL(/\/share\/bad-token-404/);
    await expect(page.locator('body')).not.toHaveText(/welcome back/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Create share link — authenticated
// ---------------------------------------------------------------------------
test.describe('Create share link (authenticated)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;

    await mockMeEndpoint(page);
    await mockDataEndpoint(page, {
      players: TEST_PLAYERS,
      observations: TEST_OBSERVATIONS,
    });

    // Mock share link creation
    await page.route('**/api/share/create', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ shareUrl: SHARE_URL }),
      })
    );
  });

  test('player detail page has a Share tab', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    const playerId = TEST_PLAYERS[0].id;
    await page.goto(`/roster/${playerId}`);

    const shareTab = page.getByRole('button', { name: /share/i });
    await expect(shareTab).toBeVisible({ timeout: 10000 });
  });

  test('Share tab shows create link button', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    const playerId = TEST_PLAYERS[0].id;
    await page.goto(`/roster/${playerId}`);

    // Navigate to Share tab
    const shareTab = page.getByRole('button', { name: /share/i });
    await shareTab.click();

    await expect(
      page.getByRole('button', { name: /create.*share.*link|generate.*link/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('clicking create link generates a shareable URL', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    const playerId = TEST_PLAYERS[0].id;
    await page.goto(`/roster/${playerId}`);

    // Navigate to Share tab
    await page.getByRole('button', { name: /share/i }).click();

    // Create the link
    const createBtn = page.getByRole('button', {
      name: /create.*share.*link|generate.*link/i,
    });
    await createBtn.click();

    // Share link input/display should appear
    await expect(page.getByText(/share link created/i)).toBeVisible({ timeout: 10000 });

    // The URL shown should include our share token
    const linkInput = page.locator(`input[value*="${SHARE_TOKEN}"]`);
    await expect(linkInput).toBeVisible();
  });

  test('share link can be copied to clipboard', async ({ page, context }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const playerId = TEST_PLAYERS[0].id;
    await page.goto(`/roster/${playerId}`);
    await page.getByRole('button', { name: /share/i }).click();

    const createBtn = page.getByRole('button', {
      name: /create.*share.*link|generate.*link/i,
    });
    await createBtn.click();
    await expect(page.getByText(/share link created/i)).toBeVisible({ timeout: 10000 });

    // Copy button
    const copyBtn = page.getByRole('button', { name: /copy/i });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Copy success feedback
    await expect(page.getByText(/copied/i)).toBeVisible({ timeout: 3000 });
  });
});
