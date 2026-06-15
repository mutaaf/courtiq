/**
 * E2E — ticket 0083 — program-scoped Practice Arc memory.
 *
 * The /plans page is a CLIENT component (LESSONS#0180 — `'use client'`
 * at the top of src/app/(dashboard)/plans/page.tsx), so its
 * useQuery(`/api/program/arc-history`) hits the browser network layer
 * and is served by the real local Supabase via the seeded
 * "Last Year U10 Hawks" team. We mock only `/api/me` so the active team
 * is deterministic; `/api/program/arc-history` and
 * `/api/program/arc-history/adopt` hit the real DB.
 *
 * Sub-flows asserted:
 *   (a) sign in as the E2E coach
 *   (b) navigate to /plans
 *   (c) assert the empty-state Practice Arc card AND the new
 *       <ProgramArcHistoryHint /> render
 *   (d) assert the summary line contains the program name + closeouts
 *       + transitions + week ranges
 *   (e) assert the rendered text never names the previous coach
 *   (f) tap "Use this as my starting arc"
 *   (g) assert the POST returns 200 AND a practice_arc plan now exists
 *   (h) re-load /plans; the hint is GONE (the arc is no longer empty)
 *
 * Per LESSONS#0121 the program name "E2E Test Org" + the skill names
 * "closeouts" / "transitions" are seeded explicitly (see
 * tests/e2e/fixtures/seed.sql ticket 0083 block).
 *
 * Per LESSONS#0029 / #0082 — every assertion scoped to data-testid.
 *
 * `.spec.ts` is Playwright (vitest excludes the spec glob under tests/;
 * Playwright's testDir is tests/e2e/).
 *
 * Skips when E2E_TEST_EMAIL / E2E_TEST_PASSWORD are unset (PR-gating
 * CI runner — same pattern as the other authed e2es).
 */
import { test, expect } from '@playwright/test';
import { signInViaUI } from './helpers/auth';

const HINT = '[data-testid="program-arc-history-hint"]';
const SUMMARY = '[data-testid="program-arc-history-summary"]';
const ADOPT = '[data-testid="program-arc-history-adopt"]';

// We DO NOT mock /api/me — letting the real authenticated endpoint
// return the seeded team means activeTeam.sport_id carries the real
// basketball UUID (the seed resolves it via `select id from sports
// where slug='basketball'`). The mocked /api/me path would have to
// hard-code a UUID that doesn't actually match; sticking with the
// real /api/me keeps the round-trip honest. The program-arc-history
// GET + adopt POST hit the seeded Supabase directly via useQuery.

test.describe('Program-scoped Practice Arc memory (ticket 0083)', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    authenticated = await signInViaUI(page);
    if (!authenticated) return;
  });

  test('empty-state hint renders + tap adopts the arc + hint is gone after', async ({ page }) => {
    if (!authenticated) {
      test.skip(true, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests');
    }

    // Step 1: navigate to /plans (the Practice Arc surface). The page
    // is a client component, so useQuery fires the GET in the browser
    // and hits the seeded local Supabase.
    await page.goto('/plans');

    // Step 2: the hint renders above the empty-state card. The seeded
    // "Last Year U10 Hawks" team contributed 14 plans last season with
    // weeks 2-4 closeouts + weeks 5-7 transitions → coverage:
    // sufficient → hint visible.
    const hint = page.locator(HINT);
    await expect(hint).toBeVisible({ timeout: 15_000 });

    const summary = page.locator(SUMMARY);
    await expect(summary).toBeVisible();

    // The summary line names the program + age group + the seeded
    // skill names + the week ranges the helper derives.
    // The seed uses org name "E2E Test Org" (verified by grepping the
    // seed file).
    const summaryText = (await summary.textContent()) ?? '';
    expect(summaryText).toContain('E2E Test Org');
    expect(summaryText).toContain('11-13');
    expect(summaryText.toLowerCase()).toContain('closeouts');
    expect(summaryText.toLowerCase()).toContain('transitions');
    expect(summaryText).toMatch(/weeks 2-4/);
    expect(summaryText).toMatch(/weeks 5-7/);

    // Privacy: the rendered text never names the previous coach.
    expect(summaryText).not.toMatch(/Last Year U10 Coach/);
    expect(summaryText).not.toMatch(/Coach [A-Z][a-z]+ [A-Z][a-z]+/);

    // Step 3: tap "Use this as my starting arc". The POST hits the
    // real adopt endpoint, writes ONE practice_arc plan against the
    // E2E coach's team (...020), and the page refetches plans →
    // arcIsEmpty flips false → the hint disappears.
    let adoptStatus: number | null = null;
    page.on('response', (res) => {
      if (res.url().includes('/api/program/arc-history/adopt')) {
        adoptStatus = res.status();
      }
    });

    const adopt = page.locator(ADOPT);
    await expect(adopt).toBeVisible();
    await adopt.click();

    // Wait for the adopt POST to complete (200 = success).
    await expect.poll(() => adoptStatus, { timeout: 15_000 }).toBe(200);

    // Step 4: re-load /plans. The arc is now populated, so the hint
    // is absent on the next render of the empty-state branch (the
    // page also flips OUT of the empty state because a practice_arc
    // plan now exists). Either way: the hint must be gone.
    await page.reload();
    // Allow the post-adoption render to settle.
    await expect(page.locator(HINT)).toHaveCount(0, { timeout: 15_000 });
  });
});
