/**
 * E2E (ticket 0044): the network-effect "Coaches who liked this drill in
 * <sport> ran:" block on the drill detail page.
 *
 * Pattern: the drill detail page is a `'use client'` page (LESSONS#89), so
 * its TanStack `useQuery` calls hit the browser network layer and ARE
 * interceptable via `page.route()`. We mock the drill row (`/api/data`),
 * the sport (`/api/data` again, scoped to `sports`), the suggestions
 * endpoint (`/api/drill-sequence-suggestions`), and `/api/me` for the
 * dashboard shell.
 *
 * The seeded `tests/e2e/fixtures/seed.sql` already has basketball drills
 * but no fixed drill UUIDs we can route to, so the spec uses a stable
 * test UUID and intercepts the read. The vitest contract suite covers
 * the route/floor/keyset; this spec is the live page-wiring guard.
 *
 * Skips when E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset — convention
 * (cf. tests/e2e/coach-card-flow.spec.ts:85).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI, mockMeEndpoint } from './helpers/auth';

const DRILL_ID = '00000000-0000-4000-d000-0000000000a1';
const DRILL_NAME_BASE = 'Closeout Drill';

const NEXT_B = '00000000-0000-4000-d000-0000000000b1';
const NEXT_C = '00000000-0000-4000-d000-0000000000c1';
const NEXT_D = '00000000-0000-4000-d000-0000000000d1';

/** A canned drill row the /api/data mock returns for the drillId filter. */
const DRILL_ROW = {
  id: DRILL_ID,
  sport_id: 'sport-basketball-001',
  org_id: null,
  coach_id: null,
  curriculum_skill_id: null,
  name: DRILL_NAME_BASE,
  description: 'Players close out on shooters from the foul-line extended.',
  category: 'Defense',
  age_groups: ['11-13'],
  duration_minutes: 8,
  player_count_min: 2,
  player_count_max: 10,
  equipment: ['basketballs'],
  video_url: null,
  diagram_url: null,
  cv_eval_config: null,
  setup_instructions: null,
  teaching_cues: ['short steps', 'hands up'],
  source: 'seeded' as const,
  created_at: '2026-01-01T00:00:00Z',
};

const SPORT_ROW = {
  id: 'sport-basketball-001',
  slug: 'basketball',
  name: 'Basketball',
};

async function mockDrillDetailReads(
  page: import('@playwright/test').Page,
  opts: { suggestions: Array<Record<string, unknown>>; dismissed?: boolean },
) {
  // /api/data — branch by table + filter shape.
  await page.route('**/api/data', async (route) => {
    const body = route.request().postDataJSON() as {
      table?: string;
      filters?: Record<string, unknown>;
    };
    const table = body?.table ?? '';
    if (table === 'drills') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: DRILL_ROW }),
      });
    }
    if (table === 'sports') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: SPORT_ROW }),
      });
    }
    if (table === 'coach_drill_signals') {
      // The dismiss-signal read for THIS drill.
      const dismiss = opts.dismissed
        ? [{ coach_id: 'coach-e2e-test-001', drill_id: DRILL_ID, signal_type: 'dismiss_suggestion' }]
        : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: dismiss }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/drill-sequence-suggestions*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ suggestions: opts.suggestions }),
    }),
  );
}

const SUGGESTIONS_TESTID = '[data-testid="next-drill-suggestions"]';

test.describe('Drill detail — next-drill suggestions block (ticket 0044)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
  });

  test('renders the block with three rows when the route returns three suggestions', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);
    await mockDrillDetailReads(page, {
      suggestions: [
        { next_drill_id: NEXT_B, next_drill_title: 'Help and Recover', coach_count: 18, sport: 'basketball' },
        { next_drill_id: NEXT_C, next_drill_title: 'Three-on-Three Closeouts', coach_count: 14, sport: 'basketball' },
        { next_drill_id: NEXT_D, next_drill_title: 'Shell Drill', coach_count: 12, sport: 'basketball' },
      ],
    });

    await page.goto(`/drills/${DRILL_ID}`);

    // Scope EVERY assertion to the stable testid container — never page-
    // wide getByText for substrings (LESSONS#82).
    const block = page.locator(SUGGESTIONS_TESTID);
    await expect(block).toBeVisible({ timeout: 10000 });
    await expect(block).toContainText('Help and Recover');
    await expect(block).toContainText('18 coaches');
    await expect(block).toContainText('Three-on-Three Closeouts');
    await expect(block).toContainText('14 coaches');
    await expect(block).toContainText('Shell Drill');
    await expect(block).toContainText('12 coaches');
  });

  test('renders NO block when the route returns an empty array', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);
    await mockDrillDetailReads(page, { suggestions: [] });

    await page.goto(`/drills/${DRILL_ID}`);

    // Wait for the page itself to render (drill name appears).
    await expect(page.getByText(DRILL_NAME_BASE).first()).toBeVisible({ timeout: 10000 });

    // The suggestions container is absent — no "0 coaches", no empty-state copy.
    await expect(page.locator(SUGGESTIONS_TESTID)).toHaveCount(0);
  });

  test('renders NO block when the coach has previously dismissed suggestions for this drill', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }
    await mockMeEndpoint(page);
    await mockDrillDetailReads(page, {
      suggestions: [
        { next_drill_id: NEXT_B, next_drill_title: 'Help and Recover', coach_count: 18, sport: 'basketball' },
      ],
      dismissed: true,
    });

    await page.goto(`/drills/${DRILL_ID}`);
    await expect(page.getByText(DRILL_NAME_BASE).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(SUGGESTIONS_TESTID)).toHaveCount(0);
    // The would-be suggestion title also doesn't render.
    await expect(page.getByText('Help and Recover')).toHaveCount(0);
  });
});
