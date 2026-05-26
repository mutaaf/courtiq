/**
 * Ticket 0039 — `mergeLocalDrillRatings` pure helper.
 *
 * Resolves the one-time device-handoff merge between a coach's localStorage
 * ratings (the existing `buildTeamRatingsPrefix(teamId)` scan output) and what
 * the server already knows. The three cases covered:
 *
 *   1. A local entry has NO server counterpart   → upsert it.
 *   2. A local entry IS on the server but local  → upsert it.
 *      is strictly newer
 *   3. A local entry IS on the server and the    → leave it alone.
 *      server copy is same or newer
 *
 * The helper is PURE — it writes nothing. The one-time merge surface is
 * responsible for posting the returned upserts through the new PATCH route.
 *
 * .test.ts NOT .spec.ts — vitest excludes the Playwright spec glob (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import {
  mergeLocalDrillRatings,
  type LocalDrillRatingEntry,
  type ServerDrillSignal,
} from '@/lib/drill-rating-utils';

const DRILL_A = '00000000-0000-4000-a000-0000000000a1';
const DRILL_B = '00000000-0000-4000-a000-0000000000a2';
const DRILL_C = '00000000-0000-4000-a000-0000000000a3';

// 2026-05-20T00:00:00Z, in ms — six days before the assertion fixture below.
const SIX_DAYS_AGO_MS = Date.UTC(2026, 4, 20, 0, 0, 0);
const TODAY_MS = Date.UTC(2026, 4, 26, 0, 0, 0);

function serverSig(drillId: string, rating: 'up' | 'down', isoAt: string): ServerDrillSignal {
  return { drill_id: drillId, rating, last_rated_at: isoAt };
}

function localEntry(drillId: string, rating: 'up' | 'down', atMs: number): LocalDrillRatingEntry {
  return { drill_id: drillId, rating, last_rated_at: atMs };
}

describe('mergeLocalDrillRatings (ticket 0039) — pure device-handoff merge', () => {
  it('case 1: a local entry with NO server counterpart is queued for upsert', () => {
    const local: LocalDrillRatingEntry[] = [
      localEntry(DRILL_A, 'up', TODAY_MS),
      localEntry(DRILL_B, 'down', TODAY_MS),
    ];
    const server: ServerDrillSignal[] = []; // nothing on the server yet

    const upserts = mergeLocalDrillRatings(local, server);

    // Both local entries become upserts.
    expect(upserts).toHaveLength(2);
    const byDrill = Object.fromEntries(upserts.map((u) => [u.drill_id, u.rating]));
    expect(byDrill[DRILL_A]).toBe('up');
    expect(byDrill[DRILL_B]).toBe('down');
  });

  it('case 2: a local entry NEWER than the server entry is queued for upsert', () => {
    // Server says "up" from six days ago; the coach changed their mind today
    // on the new device, voting "down".
    const server: ServerDrillSignal[] = [
      serverSig(DRILL_A, 'up', new Date(SIX_DAYS_AGO_MS).toISOString()),
    ];
    const local: LocalDrillRatingEntry[] = [
      localEntry(DRILL_A, 'down', TODAY_MS),
    ];

    const upserts = mergeLocalDrillRatings(local, server);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toEqual({ drill_id: DRILL_A, rating: 'down' });
  });

  it('case 3: a server entry NEWER than the local entry is LEFT ALONE', () => {
    // The server has the freshest opinion (today). The local cache is stale
    // (six days old). Do NOT overwrite the server with the stale local.
    const server: ServerDrillSignal[] = [
      serverSig(DRILL_A, 'down', new Date(TODAY_MS).toISOString()),
    ];
    const local: LocalDrillRatingEntry[] = [
      localEntry(DRILL_A, 'up', SIX_DAYS_AGO_MS),
    ];

    const upserts = mergeLocalDrillRatings(local, server);

    expect(upserts).toHaveLength(0);
  });

  it('three-case mix: only the new + newer locals are upserted; the stale-local is dropped', () => {
    const server: ServerDrillSignal[] = [
      // B already on server, server NEWER → leave alone.
      serverSig(DRILL_B, 'up', new Date(TODAY_MS).toISOString()),
      // C already on server, server OLDER → local upserts.
      serverSig(DRILL_C, 'up', new Date(SIX_DAYS_AGO_MS).toISOString()),
    ];
    const local: LocalDrillRatingEntry[] = [
      // A is local-only.
      localEntry(DRILL_A, 'up', TODAY_MS),
      // B is older than server → no-op.
      localEntry(DRILL_B, 'down', SIX_DAYS_AGO_MS),
      // C is newer than server → upsert (rating flip).
      localEntry(DRILL_C, 'down', TODAY_MS),
    ];

    const upserts = mergeLocalDrillRatings(local, server);

    const byDrill = Object.fromEntries(upserts.map((u) => [u.drill_id, u.rating]));
    expect(Object.keys(byDrill).sort()).toEqual([DRILL_A, DRILL_C].sort());
    expect(byDrill[DRILL_A]).toBe('up');
    expect(byDrill[DRILL_C]).toBe('down');
  });

  it('empty inputs return an empty upsert set (no-op merge)', () => {
    expect(mergeLocalDrillRatings([], [])).toEqual([]);
    expect(mergeLocalDrillRatings([], [serverSig(DRILL_A, 'up', new Date().toISOString())])).toEqual([]);
  });

  it('writes nothing of its own — it returns the upsert set for the caller to apply', () => {
    // A subtle smoke: a unique drill id appears in the upserts list and is
    // never mutated on the input arrays. (Purity invariant.)
    const local: LocalDrillRatingEntry[] = [localEntry(DRILL_A, 'up', TODAY_MS)];
    const server: ServerDrillSignal[] = [];
    const localCopy = JSON.parse(JSON.stringify(local));
    const serverCopy = JSON.parse(JSON.stringify(server));

    mergeLocalDrillRatings(local, server);

    expect(local).toEqual(localCopy);
    expect(server).toEqual(serverCopy);
  });
});
