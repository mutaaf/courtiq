/**
 * Ticket 0039 — `useDrillRatingsMigration` first-sign-in merge hook.
 *
 * AC5: on first dashboard mount after this ships, the hook scans the existing
 * `drill-rating:<teamId>:<drillId>` localStorage entries, calls GET, computes
 * the upserts with `mergeLocalDrillRatings`, posts each through PATCH, and
 * then stamps `coaches.preferences.migrated_drill_ratings_at` via the
 * sanctioned `mutate()` client write path. Subsequent mounts do NOT re-run
 * the merge (the marker guards it). Local-storage entries are LEFT IN PLACE
 * after a successful merge (offline-safe fallback).
 *
 * .test.tsx (NOT .spec.tsx) — vitest excludes the Playwright spec glob
 * (LESSONS#38). Tests render via the same `renderHook` pattern as other
 * dashboard hooks (e.g. tests/hooks/use-active-team.test.tsx, if present).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ─── Mocks: capture fetch + mutate calls ─────────────────────────────────────

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const mutateMock = vi.fn();

vi.mock('@/lib/api', () => ({
  mutate: (...args: unknown[]) => mutateMock(...args),
}));

import { useDrillRatingsMigration } from '@/hooks/use-drill-ratings-migration';
import { buildRatingKey } from '@/lib/drill-rating-utils';

// ─── localStorage mock (a fresh store per test) ──────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key(i: number): string | null {
      return Object.keys(store)[i] ?? null;
    },
    getItem(k: string): string | null {
      return store[k] ?? null;
    },
    setItem(k: string, v: string): void {
      store[k] = v;
    },
    removeItem(k: string): void {
      delete store[k];
    },
    clear(): void {
      store = {};
    },
  };
})();

const COACH = '00000000-0000-4000-a000-000000000001';
const TEAM_A = '00000000-0000-4000-a000-000000000020';
const TEAM_B = '00000000-0000-4000-a000-000000000021';
const DRILL_X = '00000000-0000-4000-a000-0000000000a1';
const DRILL_Y = '00000000-0000-4000-a000-0000000000a2';

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
  localStorageMock.clear();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mutateMock.mockReset();
  mutateMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Helper — pre-populate localStorage with two ratings across two teams. */
function seedLocalRatings(): void {
  // The existing key shape is `drill-rating:<teamId>:<drillId>` (verified by
  // buildRatingKey unit test). The hook must find BOTH entries even though
  // they belong to different teams — the signal is COACH-private, cross-team.
  localStorageMock.setItem(buildRatingKey(TEAM_A, DRILL_X), 'up');
  localStorageMock.setItem(buildRatingKey(TEAM_B, DRILL_Y), 'down');
}

describe('useDrillRatingsMigration (ticket 0039)', () => {
  it('on first mount: scans localStorage, GETs server, PATCHes upserts, stamps the marker', async () => {
    seedLocalRatings();

    // Server returns empty signals → all locals become upserts.
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/coach-drill-signals') && (!init || init.method === 'GET')) {
        return new Response(JSON.stringify({ signals: [] }), { status: 200 });
      }
      if (url.endsWith('/api/coach-drill-signals') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ signal: {} }), { status: 200 });
      }
      return new Response('not-found', { status: 404 });
    });

    renderHook(() => useDrillRatingsMigration({ coachId: COACH, preferences: {} }));

    // Two PATCHes (one per local entry) + one GET.
    await waitFor(() => {
      const patches = fetchMock.mock.calls.filter(
        ([, init]) => init && (init as RequestInit).method === 'PATCH',
      );
      expect(patches).toHaveLength(2);
    });

    // The marker is stamped via the sanctioned mutate() helper.
    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalled();
    });
    const mutateCall = mutateMock.mock.calls[0][0];
    expect(mutateCall.table).toBe('coaches');
    expect(mutateCall.operation).toBe('update');
    expect(mutateCall.filters).toEqual({ id: COACH });
    expect(mutateCall.data.preferences.migrated_drill_ratings_at).toBeTruthy();

    // CRITICAL (regression — AC8): localStorage entries are LEFT IN PLACE.
    expect(localStorageMock.getItem(buildRatingKey(TEAM_A, DRILL_X))).toBe('up');
    expect(localStorageMock.getItem(buildRatingKey(TEAM_B, DRILL_Y))).toBe('down');
  });

  it('subsequent mounts (marker set) do NOT re-issue the migration calls', async () => {
    seedLocalRatings();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ signals: [] }), { status: 200 }));

    renderHook(() =>
      useDrillRatingsMigration({
        coachId: COACH,
        preferences: { migrated_drill_ratings_at: '2026-05-26T00:00:00.000Z' },
      }),
    );

    // Give any potential async work a tick to run; assert nothing fired.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('is a no-op when coachId is missing (renders cleanly without coach context)', async () => {
    seedLocalRatings();
    renderHook(() => useDrillRatingsMigration({ coachId: null, preferences: {} }));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
