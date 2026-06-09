// ─── Ticket 0076 — clone-stick detection helper ─────────────────────────────
//
// A "stuck clone" is a drill_share_clones row where the SAME cloning
// coach later thumbed-up the drill they cloned (a 0044
// coach_drill_signals row with rating='up'). The signal — distinct
// from the raw clone — is "the cloning coach ran it on a real court
// AND it worked". The 0073 reputation ranking uses this to separate
// download counts from adoption counts; the milestone hook uses it
// to fire the publishing coach's stuck_1 / stuck_3 / stuck_8 card.
//
// Pure helper. Reads no DB. Mirrors `src/lib/emergent-focus-utils.ts`
// (0071) and `src/lib/coach-reputation-utils.ts` (0073) — a small
// module with one exported function the route + tests pin without a
// Supabase mock.
//
// Per LESSONS#0023 — every output is a number / id, no banned-word
// scan needed on the helper itself.

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 60;

export interface DrillShareInput {
  drill_share_id: string;
  drill_id: string;
  publisher_coach_id: string;
}

export interface CloneInput {
  drill_share_id: string;
  cloner_coach_id: string;
  cloner_org_id: string | null;
  cloned_at: string;
}

export interface ThumbsUpInput {
  coach_id: string;
  drill_id: string;
  signaled_at: string;
}

export interface StuckCloneResult {
  drill_share_id: string;
  cloner_coach_id: string;
  cloner_org_id: string | null;
  stuck_at: string;
}

export interface DetectStuckClonesArgs {
  drillShares: DrillShareInput[];
  clones: CloneInput[];
  thumbsUp: ThumbsUpInput[];
  /** Default 60 — a thumb more than this many days after the clone is
   *  structurally not a "ran it and it worked" signal. */
  lookbackDays?: number;
  /** "Now" in milliseconds since epoch. Injected so the unit tests
   *  pin the window without freezing the system clock. */
  nowMs: number;
}

/**
 * Given the drill_shares + clone rows + thumbs-up signals in scope,
 * return the set of `(drill_share_id, cloner_coach_id, cloner_org_id,
 * stuck_at)` tuples where the clone is "stuck" — the cloner thumbed
 * the drill UP at some moment AFTER they cloned it AND within
 * `lookbackDays` of the clone AND the cloner is not the publisher.
 *
 * One tuple per (drill_share_id, cloner_coach_id) — the EARLIEST
 * qualifying signaled_at wins (the moment the clone first stuck).
 *
 * Deterministic across input order — the helper sorts inputs
 * internally before walking them.
 */
export function detectStuckClones(args: DetectStuckClonesArgs): StuckCloneResult[] {
  const {
    drillShares,
    clones,
    thumbsUp,
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
    nowMs,
  } = args;

  if (!drillShares.length || !clones.length || !thumbsUp.length) return [];

  // Index drillShares by id so we can map a clone → publisher + drill_id.
  const shareById = new Map<string, DrillShareInput>();
  for (const s of drillShares) shareById.set(s.drill_share_id, s);

  // Index thumbs-up by (coach_id, drill_id) → sorted timestamps.
  const thumbsKey = (coachId: string, drillId: string) => `${coachId}::${drillId}`;
  const thumbsByKey = new Map<string, number[]>();
  for (const t of thumbsUp) {
    const ts = Date.parse(t.signaled_at);
    if (!Number.isFinite(ts)) continue;
    const key = thumbsKey(t.coach_id, t.drill_id);
    const arr = thumbsByKey.get(key) ?? [];
    arr.push(ts);
    thumbsByKey.set(key, arr);
  }
  for (const arr of thumbsByKey.values()) arr.sort((a, b) => a - b);

  // Walk clones, keep one (earliest) stuck tuple per (share, cloner).
  const lookbackMs = lookbackDays * DAY_MS;
  const stuckByKey = new Map<string, StuckCloneResult>();
  const stickKey = (shareId: string, coachId: string) => `${shareId}::${coachId}`;

  for (const c of clones) {
    const share = shareById.get(c.drill_share_id);
    if (!share) continue;
    if (c.cloner_coach_id === share.publisher_coach_id) continue; // self-clone filter
    const clonedAtMs = Date.parse(c.cloned_at);
    if (!Number.isFinite(clonedAtMs)) continue;
    // Ignore clones older than the (lookback + cushion) — defensive.
    // The strict window filter lives on the thumb timestamp below.
    if (nowMs - clonedAtMs > lookbackMs * 10) continue;

    const tArr = thumbsByKey.get(thumbsKey(c.cloner_coach_id, share.drill_id)) ?? [];
    if (tArr.length === 0) continue;

    // Find the earliest thumb that is >= clonedAt AND within
    // lookbackDays of clonedAt. tArr is sorted ascending.
    let earliest: number | null = null;
    for (const ts of tArr) {
      if (ts < clonedAtMs) continue;
      if (ts - clonedAtMs > lookbackMs) continue;
      earliest = ts;
      break;
    }
    if (earliest === null) continue;

    const key = stickKey(c.drill_share_id, c.cloner_coach_id);
    const existing = stuckByKey.get(key);
    const candidate: StuckCloneResult = {
      drill_share_id: c.drill_share_id,
      cloner_coach_id: c.cloner_coach_id,
      cloner_org_id: c.cloner_org_id,
      stuck_at: new Date(earliest).toISOString(),
    };
    if (!existing) {
      stuckByKey.set(key, candidate);
    } else {
      const existingMs = Date.parse(existing.stuck_at);
      if (earliest < existingMs) stuckByKey.set(key, candidate);
    }
  }

  return Array.from(stuckByKey.values());
}
