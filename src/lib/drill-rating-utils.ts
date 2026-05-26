// Utilities for per-team drill effectiveness ratings stored in localStorage.
// Coaches rate each drill 👍/👎 after it completes on the break screen.
// Ratings surface well-rated drills first in the drill picker.
//
// Ticket 0039 layered a server-side mirror (`coach_drill_signals`, COACH-private
// across teams) on top so a coach's thumbs-up travels across phones, teams, and
// seasons. The localStorage helpers below are preserved verbatim as the offline
// / pre-migration fallback path — a coach offline still gets the existing per-
// device, per-team behavior so the break-screen rating tap never feels broken.
// The new merge helper (`mergeLocalDrillRatings`) is a PURE function that the
// one-time first-sign-in migration uses to decide which local entries to upsert
// server-side; it performs no IO of its own.

export type DrillRating = 'up' | 'down';

export interface RatedDrill {
  drillId: string;
  rating: DrillRating;
}

// ─── Server-side cross-device merge (ticket 0039) ─────────────────────────────

/**
 * One LocalStorage rating entry the existing `buildTeamRatingsPrefix(teamId)`
 * scan produces — a drill id, a rating, and the local last-rated timestamp
 * (best-effort; falls back to 0 if the key was written by a pre-0039 client and
 * has no timestamp companion key).
 */
export interface LocalDrillRatingEntry {
  drill_id: string;
  rating: DrillRating;
  /** Epoch ms; 0 when the local write predates this ticket. */
  last_rated_at: number;
}

/** One server-side coach_drill_signals row, as the merge helper consumes it. */
export interface ServerDrillSignal {
  drill_id: string;
  rating: DrillRating;
  /** ISO timestamptz from the server. */
  last_rated_at: string;
}

/** An upsert the route should write — produced by the pure merge helper. */
export interface DrillRatingUpsert {
  drill_id: string;
  rating: DrillRating;
}

/**
 * Resolve the one-time device-handoff merge between the coach's local ratings
 * and what the server already knows. The three cases:
 *
 *  1. A local entry has NO server counterpart → upsert it (the new device has
 *     real preferences the server has never seen).
 *  2. A local entry IS already on the server, but the local copy is strictly
 *     newer → upsert the local copy (the coach voted on the new device since
 *     the last sync).
 *  3. A local entry IS already on the server, and the server copy is the same
 *     or newer → leave it alone (don't churn the row, don't downgrade newer
 *     server state with a stale local cache).
 *
 * Pure. Writes nothing. The caller (the one-time merge hook) is responsible
 * for actually posting the upserts through the new PATCH route.
 */
export function mergeLocalDrillRatings(
  localEntries: readonly LocalDrillRatingEntry[],
  serverSignals: readonly ServerDrillSignal[],
): DrillRatingUpsert[] {
  // Build a lookup so the merge is O(N + M), not O(N * M).
  const serverByDrill = new Map<string, ServerDrillSignal>();
  for (const s of serverSignals) {
    serverByDrill.set(s.drill_id, s);
  }

  const upserts: DrillRatingUpsert[] = [];
  for (const local of localEntries) {
    const server = serverByDrill.get(local.drill_id);
    if (!server) {
      // Case 1: local-only — upsert.
      upserts.push({ drill_id: local.drill_id, rating: local.rating });
      continue;
    }
    // Case 2 / 3: compare timestamps; the local entry's stamp is epoch ms, the
    // server's is ISO — coerce both to ms for the comparison.
    const serverMs = Date.parse(server.last_rated_at);
    if (Number.isFinite(serverMs) && local.last_rated_at > serverMs) {
      upserts.push({ drill_id: local.drill_id, rating: local.rating });
    }
    // else: case 3, leave the server entry alone.
  }
  return upserts;
}

// ── Storage key helpers ───────────────────────────────────────────────────────

export function buildRatingKey(teamId: string, drillId: string): string {
  return `drill-rating:${teamId}:${drillId}`;
}

export function buildTeamRatingsPrefix(teamId: string): string {
  return `drill-rating:${teamId}:`;
}

// ── Read / write ──────────────────────────────────────────────────────────────

export function getDrillRating(teamId: string, drillId: string): DrillRating | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(buildRatingKey(teamId, drillId));
    if (raw === 'up' || raw === 'down') return raw;
    return null;
  } catch {
    return null;
  }
}

export function setDrillRating(teamId: string, drillId: string, rating: DrillRating): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(buildRatingKey(teamId, drillId), rating);
  } catch {
    // localStorage quota errors are non-fatal
  }
}

export function clearDrillRating(teamId: string, drillId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(buildRatingKey(teamId, drillId));
  } catch {
    // ignore
  }
}

export function toggleDrillRating(
  teamId: string,
  drillId: string,
  rating: DrillRating,
): DrillRating | null {
  const current = getDrillRating(teamId, drillId);
  if (current === rating) {
    // Tapping the same rating removes it
    clearDrillRating(teamId, drillId);
    return null;
  }
  setDrillRating(teamId, drillId, rating);
  return rating;
}

/**
 * Ticket 0039 — best-effort fire-and-forget server-side mirror of a local
 * toggle. The local helper above runs first (instant UI feedback, AC8
 * regression: never feels broken). This function then POSTs the new rating to
 * `/api/coach-drill-signals` so the signal travels across phones and seasons.
 * On a flaky network, the request fails silently — the local entry remains the
 * source of truth on this device, and the next dashboard mount's one-time
 * merge (or the next successful PATCH) reconciles. We never block the UI.
 *
 * The function is intentionally a void-returning helper so existing call sites
 * can stay synchronous (they already update local state from the return value
 * of `toggleDrillRating`) and just fire this alongside. The actual coach_id is
 * resolved server-side from the auth user — the route ignores a forged body.
 */
export function mirrorDrillRatingToServer(drillId: string, rating: DrillRating | null): void {
  if (typeof window === 'undefined') return;
  try {
    // No await; the UI is already updated from the local helper. A 401 / 5xx
    // resolves to no-op (the merge hook retries later).
    void fetch('/api/coach-drill-signals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drill_id: drillId, rating }),
    }).catch(() => {
      /* swallow — offline / network is fine, the local entry persists */
    });
  } catch {
    // never throw
  }
}

// ── Predicates ────────────────────────────────────────────────────────────────

export function isUpvoted(teamId: string, drillId: string): boolean {
  return getDrillRating(teamId, drillId) === 'up';
}

export function isDownvoted(teamId: string, drillId: string): boolean {
  return getDrillRating(teamId, drillId) === 'down';
}

export function isRated(teamId: string, drillId: string): boolean {
  return getDrillRating(teamId, drillId) !== null;
}

export function hasRating(rating: DrillRating | null): boolean {
  return rating !== null;
}

// ── Sorting helpers ───────────────────────────────────────────────────────────

export type RatableItem = { id: string };

export function getRatingSortKey(teamId: string, drillId: string): number {
  const r = getDrillRating(teamId, drillId);
  if (r === 'up') return -1;   // float to top
  if (r === 'down') return 1;  // sink to bottom
  return 0;
}

export function sortDrillsByRating<T extends RatableItem>(drills: T[], teamId: string): T[] {
  return [...drills].sort(
    (a, b) => getRatingSortKey(teamId, a.id) - getRatingSortKey(teamId, b.id),
  );
}

export function filterUpvotedDrills<T extends RatableItem>(drills: T[], teamId: string): T[] {
  return drills.filter((d) => isUpvoted(teamId, d.id));
}

export function filterDownvotedDrills<T extends RatableItem>(drills: T[], teamId: string): T[] {
  return drills.filter((d) => isDownvoted(teamId, d.id));
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function getRatingIcon(rating: DrillRating | null): string {
  if (rating === 'up') return '👍';
  if (rating === 'down') return '👎';
  return '';
}

export function getRatingLabel(rating: DrillRating | null): string {
  if (rating === 'up') return 'Great for our team';
  if (rating === 'down') return 'Needs adjustment';
  return '';
}

export function getRatingAriaLabel(rating: DrillRating, currentRating: DrillRating | null): string {
  const isActive = currentRating === rating;
  if (rating === 'up') return isActive ? 'Remove upvote' : 'This drill works well for our team';
  return isActive ? 'Remove downvote' : 'This drill needs adjustment for our team';
}

export function formatRatingPrompt(drillName: string): string {
  return `How did ${drillName} go?`;
}

// ── Counts ────────────────────────────────────────────────────────────────────

export function countUpvotedDrills<T extends RatableItem>(drills: T[], teamId: string): number {
  return drills.filter((d) => isUpvoted(teamId, d.id)).length;
}

export function countDownvotedDrills<T extends RatableItem>(drills: T[], teamId: string): number {
  return drills.filter((d) => isDownvoted(teamId, d.id)).length;
}

export function countRatedDrills<T extends RatableItem>(drills: T[], teamId: string): number {
  return drills.filter((d) => isRated(teamId, d.id)).length;
}
