/**
 * Ticket 0078 — dormant-publisher reactivation on a fresh cross-program
 * clone, end-to-end against the seeded local Supabase.
 *
 * Seed extension (tests/e2e/fixtures/seed.sql, ticket 0078 block):
 *  - REUSES the EXISTING 0072 dormant Sarah Hawkes coach (...0d2)
 *    whose last_active_at is 45 days ago.
 *  - ONE new drill_shares row owned by Sarah, ONE new
 *    drill_share_clones row by a coach in the seeded "Hornets" org
 *    (...0331), ONE new coach_reputation_milestones row of kind
 *    `clones_3` with notified_at IS NULL.
 *
 * Two sub-flows:
 *  (1) The cron endpoint, when POSTed with the test CRON_SECRET,
 *      returns the {sent, skipped, errors, ..., publisherSent,
 *      publisherSkipped, publisherErrors} shape. We do not assert
 *      `publisherSent=1` exactly — a prior CI run may already have
 *      written the coach_clone_reactivation_signals cooldown row,
 *      which is the same posture the 0058 e2e and the 0062 cron
 *      spec take.
 *  (2) The /home `?milestone=<id>` deep-link surface is covered by
 *      the vitest component test (`tests/api/home-milestone-deep-link.
 *      test.tsx`); the authed-Playwright deep-link path would require
 *      signing in as Sarah, who is NOT the default E2E coach, so we
 *      take the same posture the existing 0073 coach-reputation-flow
 *      spec took (the vitest test is the load-bearing CI proof for the
 *      deep-link mechanic).
 *
 * Per LESSONS#0058 — the cron path `/api/cron/coach-quiet-check-in`
 * is the EXISTING 0042 cron; no `publicPaths` change is needed since
 * this ticket EXTENDS the existing route rather than adding a new
 * sibling.
 *
 * `.spec.ts` is the Playwright convention for this directory (vitest
 * excludes the spec glob, LESSONS#0038).
 */
import { test, expect } from '@playwright/test';

const CRON_SECRET = process.env.CRON_SECRET || '';

test.describe('Dormant-publisher reactivation cron (ticket 0078)', () => {
  test.skip(!CRON_SECRET, 'CRON_SECRET is not set in the spec env (set in ci.yml).');

  test('POST /api/cron/coach-quiet-check-in with the test secret returns the expected shape (incl. the 0078 publisher counters)', async ({
    request,
  }) => {
    const res = await request.post('/api/cron/coach-quiet-check-in', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // The existing 0042 + 0072 counters are unchanged; the 0078 branch
    // adds three new counters (`publisherSent` / `publisherSkipped` /
    // `publisherErrors`).
    expect(body).toMatchObject({
      sent: expect.any(Number),
      skipped: expect.any(Number),
      errors: expect.any(Number),
      reactivationSent: expect.any(Number),
      reactivationSkipped: expect.any(Number),
      reactivationErrors: expect.any(Number),
      publisherSent: expect.any(Number),
      publisherSkipped: expect.any(Number),
      publisherErrors: expect.any(Number),
    });
    // No exact `publisherSent` count — a prior CI run may have already
    // written the coach_clone_reactivation_signals row for the seeded
    // milestone, in which case the cooldown gate fires and the count
    // is 0. The cron unit test asserts the per-eligibility behaviour
    // deterministically.
  });

  test('POST /api/cron/coach-quiet-check-in with NO bearer is 401', async ({ request }) => {
    const res = await request.post('/api/cron/coach-quiet-check-in');
    expect(res.status()).toBe(401);
  });
});
