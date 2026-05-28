/**
 * Ticket 0055 — league-plans cache helpers.
 *
 * Layered on top of the existing `memCached` / `memBust` primitives in
 * `src/lib/cache/memory.ts`. This file exposes ONLY the league-plan-shaped
 * key constructors and a `bustLeagueCache(orgId)` helper that the
 * practice-plan-shares/create route fires after a successful publish — same
 * pattern as LESSONS#41's `bustOrgMeCache` (bust the rare-write path so the
 * hot read stays cached).
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { memCached, TTL } from '@/lib/cache/memory';
import {
  leaguePlansCacheKey,
  bustLeagueCache,
} from '@/lib/cache/league-plans-cache';

describe('league-plans cache (ticket 0055)', () => {
  beforeEach(() => {
    // Each test gets a fresh cache slice — bust the org_ids we use below so
    // a re-run never reads a stale value.
    bustLeagueCache('org-A');
    bustLeagueCache('org-B');
  });

  it('keys are scoped by org_id + sport — two orgs never share a slot', () => {
    expect(leaguePlansCacheKey('org-A', 'basketball')).not.toBe(
      leaguePlansCacheKey('org-B', 'basketball'),
    );
    expect(leaguePlansCacheKey('org-A', 'basketball')).not.toBe(
      leaguePlansCacheKey('org-A', 'soccer'),
    );
    // Keys are deterministic and stable across calls.
    expect(leaguePlansCacheKey('org-A', 'basketball')).toBe(
      leaguePlansCacheKey('org-A', 'basketball'),
    );
  });

  it('caches a value under (org_id, sport) and a second read returns the cached payload', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return [{ token: 't1', planTitle: 'Tuesday' }];
    };

    const first = await memCached(
      leaguePlansCacheKey('org-A', 'basketball'),
      TTL.LONG,
      fetcher,
    );
    const second = await memCached(
      leaguePlansCacheKey('org-A', 'basketball'),
      TTL.LONG,
      fetcher,
    );
    expect(first).toEqual([{ token: 't1', planTitle: 'Tuesday' }]);
    expect(second).toEqual(first);
    // The fetcher only ran ONCE — the second read came from cache.
    expect(calls).toBe(1);
  });

  it('bustLeagueCache(orgId) drops EVERY sport slot for that org but leaves siblings intact', async () => {
    await memCached(leaguePlansCacheKey('org-A', 'basketball'), TTL.LONG, async () => 'A-bball');
    await memCached(leaguePlansCacheKey('org-A', 'soccer'), TTL.LONG, async () => 'A-soccer');
    await memCached(leaguePlansCacheKey('org-B', 'basketball'), TTL.LONG, async () => 'B-bball');

    bustLeagueCache('org-A');

    // org-A's both sport slots are gone — next read re-invokes fetcher.
    let aCalls = 0;
    await memCached(leaguePlansCacheKey('org-A', 'basketball'), TTL.LONG, async () => {
      aCalls += 1;
      return 'A-bball-fresh';
    });
    expect(aCalls).toBe(1);

    // org-B is UNTOUCHED — second read still hits the cache.
    let bCalls = 0;
    const bRead = await memCached(leaguePlansCacheKey('org-B', 'basketball'), TTL.LONG, async () => {
      bCalls += 1;
      return 'B-bball-fresh';
    });
    expect(bCalls).toBe(0);
    expect(bRead).toBe('B-bball');
  });
});
