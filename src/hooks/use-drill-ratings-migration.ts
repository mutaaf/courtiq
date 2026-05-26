'use client';

/**
 * Ticket 0039 — the one-time first-sign-in localStorage → server merge.
 *
 * On first dashboard mount per coach, this hook:
 *   1. Reads the coach's `preferences.migrated_drill_ratings_at` marker. If
 *      set, the merge has already run — do NOTHING (don't re-issue requests
 *      on every dashboard mount).
 *   2. Scans localStorage for any `drill-rating:<teamId>:<drillId>` entries
 *      (the keys the existing `buildTeamRatingsPrefix` helper writes).
 *   3. Fetches the server signals via the new GET route.
 *   4. Calls the pure `mergeLocalDrillRatings` helper to compute which entries
 *      to upsert (newer-wins per the helper's docstring).
 *   5. Posts each upsert through PATCH /api/coach-drill-signals (the route
 *      ignores any client-supplied coach_id and uses the auth user).
 *   6. On success, stamps `coaches.preferences.migrated_drill_ratings_at` via
 *      `mutate()` (the only sanctioned client write path; AGENTS.md rule 3).
 *
 * Local-storage entries are LEFT IN PLACE after a successful merge so the
 * existing offline path (drill-rating-utils.ts) keeps working — the server is
 * a SUPERSET, never a replacement (AC8 regression). A failure leaves the
 * marker unset so a future session retries.
 */
import { useEffect, useRef } from 'react';
import { mutate } from '@/lib/api';
import {
  buildTeamRatingsPrefix,
  mergeLocalDrillRatings,
  type DrillRating,
  type LocalDrillRatingEntry,
  type ServerDrillSignal,
} from '@/lib/drill-rating-utils';

const MARKER_KEY = 'migrated_drill_ratings_at';

interface UseDrillRatingsMigrationArgs {
  coachId: string | null | undefined;
  /** The coach's `preferences` JSON column. May contain the marker. */
  preferences?: Record<string, unknown> | null;
}

/**
 * Scan every `drill-rating:*` entry across all teams the coach has rated on
 * THIS device. The original key format is `drill-rating:<teamId>:<drillId>`,
 * so the team id is between the two colons.
 */
function scanLocalRatings(): LocalDrillRatingEntry[] {
  if (typeof window === 'undefined') return [];
  const out: LocalDrillRatingEntry[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('drill-rating:')) continue;
      const value = window.localStorage.getItem(key);
      if (value !== 'up' && value !== 'down') continue;
      const parts = key.split(':');
      // key shape: ['drill-rating', teamId, drillId]
      if (parts.length !== 3) continue;
      const drillId = parts[2];
      if (!drillId) continue;
      // The local entry's last-rated stamp is best-effort; the original API
      // didn't capture one, so 0 = "earliest possible", which means a server
      // entry from any real timestamp wins (case 3 in the merge helper).
      out.push({ drill_id: drillId, rating: value as DrillRating, last_rated_at: 0 });
    }
  } catch {
    // Quota / SecurityError — best-effort, return whatever we collected.
  }
  return out;
}

export function useDrillRatingsMigration({ coachId, preferences }: UseDrillRatingsMigrationArgs): void {
  // A ref guard prevents a second invocation on the same mount cycle if the
  // hook is re-rendered before the network round-trip resolves.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!coachId) return;
    if (startedRef.current) return;
    // The marker on `coaches.preferences` is the durable "merge already ran"
    // signal. We respect both the camel/snake form because preferences are a
    // JSON column the coach has owned for years (defense against an older
    // value persisting under a slightly different key).
    const prefs = preferences ?? {};
    const alreadyMerged = Boolean(
      (prefs as Record<string, unknown>)[MARKER_KEY] ??
        (prefs as Record<string, unknown>)['migratedDrillRatingsAt'],
    );
    if (alreadyMerged) return;

    // Cheap pre-check: if there are NO local entries for any team, there's
    // nothing to merge — still stamp the marker so we don't re-scan every
    // mount, but skip the network round-trip.
    const localEntries = scanLocalRatings();
    startedRef.current = true;

    void runMerge(coachId, localEntries, prefs).catch(() => {
      // Best-effort: a failure leaves the marker UNSET so a future session
      // retries (per the ticket's offline-safety note).
      startedRef.current = false;
    });
  }, [coachId, preferences]);
}

async function runMerge(
  coachId: string,
  localEntries: LocalDrillRatingEntry[],
  preferences: Record<string, unknown>,
): Promise<void> {
  // Even with zero local entries, the route is cheap; but skip the GET if
  // there is nothing local to compare against AND just stamp the marker.
  let serverSignals: ServerDrillSignal[] = [];
  if (localEntries.length > 0) {
    try {
      const res = await fetch('/api/coach-drill-signals', { method: 'GET' });
      if (res.ok) {
        const body = (await res.json()) as { signals?: ServerDrillSignal[] };
        serverSignals = body.signals ?? [];
      }
    } catch {
      // Network down — leave marker unset (handled by caller's catch).
      throw new Error('merge: GET failed');
    }

    const upserts = mergeLocalDrillRatings(localEntries, serverSignals);
    if (upserts.length > 0) {
      const responses = await Promise.all(
        upserts.map((u) =>
          fetch('/api/coach-drill-signals', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drill_id: u.drill_id, rating: u.rating }),
          }).catch(() => ({ ok: false })),
        ),
      );
      // If every PATCH failed, treat it as a network failure so the marker
      // stays unset for retry. A partial failure still stamps — those
      // individual rows will retry on a future PATCH the coach makes.
      if (responses.every((r) => !('ok' in r) || !r.ok)) {
        throw new Error('merge: every PATCH failed');
      }
    }
  }

  // Stamp the marker via the sanctioned client write path. The mutate helper
  // routes through /api/data/mutate (service-role on the server, AGENTS.md
  // rule 3). The mutate succeeds even when localEntries was empty — the
  // marker simply records "we checked, nothing to do".
  const nextPrefs = { ...preferences, [MARKER_KEY]: new Date().toISOString() };
  await mutate({
    table: 'coaches',
    operation: 'update',
    filters: { id: coachId },
    data: { preferences: nextPrefs },
  }).catch(() => {
    /* best-effort */
  });
}
