/**
 * Ticket 0055 — cache-bust integration test.
 *
 * The publish route (POST /api/practice-plan-shares/create) fires
 * `bustLeagueCache(coach.org_id)` after a successful insert so the next
 * league-discovery read for that org reflects the new plan immediately —
 * the SAME pattern as ticket 0002's `bustOrgMeCache` after a Stripe
 * webhook (LESSONS#41).
 *
 * We exercise the contract directly: cache a stale value, fire the bust,
 * confirm the next read re-runs the fetcher.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { memCached, TTL } from '@/lib/cache/memory';
import {
  leaguePlansCacheKey,
  bustLeagueCache,
} from '@/lib/cache/league-plans-cache';

describe('bustLeagueCache integration (ticket 0055)', () => {
  beforeEach(() => {
    bustLeagueCache('org-A');
    bustLeagueCache('org-B');
  });

  it('a publish-time bust causes the next league read to re-fetch (not return stale)', async () => {
    // First read: caches the stale payload under (org-A, basketball).
    let calls = 0;
    const stale = await memCached(
      leaguePlansCacheKey('org-A', 'basketball'),
      TTL.LONG,
      async () => {
        calls += 1;
        return ['stale-plan'];
      },
    );
    expect(stale).toEqual(['stale-plan']);
    expect(calls).toBe(1);

    // Second read WITHOUT a bust hits the cache.
    const cached = await memCached(
      leaguePlansCacheKey('org-A', 'basketball'),
      TTL.LONG,
      async () => {
        calls += 1;
        return ['fresh-plan'];
      },
    );
    expect(cached).toEqual(['stale-plan']);
    expect(calls).toBe(1);

    // Simulate the publish route firing the bust after inserting a new
    // practice_plan_shares row for a coach in org-A.
    bustLeagueCache('org-A');

    // Third read sees the fresh value.
    const fresh = await memCached(
      leaguePlansCacheKey('org-A', 'basketball'),
      TTL.LONG,
      async () => {
        calls += 1;
        return ['fresh-plan'];
      },
    );
    expect(fresh).toEqual(['fresh-plan']);
    expect(calls).toBe(2);
  });

  it('a bust on org-A leaves org-B untouched (per-org isolation)', async () => {
    await memCached(leaguePlansCacheKey('org-B', 'basketball'), TTL.LONG, async () => 'org-B-cached');
    bustLeagueCache('org-A');

    let bCalls = 0;
    const value = await memCached(
      leaguePlansCacheKey('org-B', 'basketball'),
      TTL.LONG,
      async () => {
        bCalls += 1;
        return 'org-B-fresh';
      },
    );
    expect(value).toBe('org-B-cached');
    expect(bCalls).toBe(0);
  });
});
