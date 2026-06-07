// ─── Ticket 0072 — dormant-coach reactivation primitive ──────────────────────
//
// Pure helper. Given (a) the parent email on the parent-portal token the
// parent just opened, (b) the current team that token belongs to, and (c)
// rows from `players` + `coaches` already loaded by the caller, returns
// the dormant-coach candidates whose OLD parent has just shown up on a
// DIFFERENT team's parent portal.
//
// Reads no DB. Writes no AI. Mirrors `src/lib/emergent-focus-utils.ts`
// (ticket 0071) — a tiny pure module with a single exported function the
// route + the cron extension + the unit tests all pin without a Supabase
// mock.
//
// COPPA: the helper consumes the parent email plaintext (the caller
// already has it from the parent_portal lookup), hashes it before
// returning so the caller can persist the hash into
// `coach_reactivation_signals.returning_parent_email_hash` without ever
// holding the plaintext past the immediate scope. The helper also does
// NOT scan the parent's first name (the parent's first name is never
// rendered on the dormant-coach surface — only the prior PLAYER's first
// name + the relationship "<player>'s parent" is rendered, per the
// ticket's voice contract).
//
// Per LESSONS#0061 — uses a literal space, not `\s+`, on any defensive
// scan (none needed here — the helper consumes structured rows from the
// caller's allow-listed select, NEVER free-text).

import { createHash } from 'crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DORMANT_THRESHOLD_DAYS_DEFAULT = 30;

/** Minimal `coaches` row shape the aggregator reads. The freshness column
 *  is `last_active_at` per migration 042 (the 0042 cron's quiet-coach
 *  predicate keys off it; the ticket prose said `updated_at` but
 *  schema wins per LESSONS#0096 — `last_active_at` is the real freshness
 *  proxy populated by the 0042 family). */
export interface CoachFreshnessRow {
  id: string;
  last_active_at: string | null;
}

/** Minimal `players` row shape the aggregator reads. `team_coach_id` is
 *  the prior team's head coach id, resolved by the caller via
 *  `team_coaches.role = 'head_coach'`. */
export interface PriorPlayerRow {
  id: string;
  team_id: string;
  parent_email: string | null;
  /** First name only — the dormant-coach surface renders "<priorPlayerFirstName>"
   *  on the card and in the email body. The caller passes `name.split(' ')[0]`
   *  per the COPPA-minimal allow-list. */
  first_name: string;
  /** The head coach id on the prior team — resolved by the caller from
   *  `team_coaches`. The helper filters by this against the dormant-coach
   *  candidates without doing its own join. */
  team_coach_id: string;
}

/** A single dormant-coach reactivation candidate the caller persists into
 *  `coach_reactivation_signals` via UPSERT on (dormant_coach_id,
 *  prior_player_id). The `parentEmailHash` is what gets written; the
 *  plaintext never leaves the helper scope. */
export interface ReactivationCandidate {
  dormantCoachId: string;
  priorTeamId: string;
  priorPlayerId: string;
  priorPlayerFirstName: string;
  parentEmailHash: string;
}

export interface DetectArgs {
  /** The parent email on the parent-portal token the parent just opened.
   *  Lowercased + trimmed before matching. NEVER persisted past this
   *  scope; only the SHA-256 hash leaves the function. */
  parentEmail: string;
  /** The team id behind the parent-portal token the parent is currently
   *  opening. Prior-player rows whose team_id equals this are FILTERED
   *  (the same-coach, same-team case is not a cross-season signal). */
  currentTeamId: string;
  /** Coach rows the caller has loaded (filtered on the prior-team coach
   *  ids). The helper checks last_active_at against the dormant-threshold
   *  window. */
  coachRows: CoachFreshnessRow[];
  /** Prior-player rows the caller has loaded — any active player whose
   *  parent_email equals the input parent email (lowercased) regardless
   *  of team. */
  priorPlayerRows: PriorPlayerRow[];
  /** "Now" in milliseconds since epoch. Injected so the unit tests pin
   *  the window without freezing the system clock. */
  nowMs: number;
  /** Override the dormant threshold (in days). Defaults to 30. */
  dormantThresholdDays?: number;
}

/**
 * Hash a parent email for persistence into
 * `coach_reactivation_signals.returning_parent_email_hash`. Lowercased +
 * trimmed first so a re-hash at read time matches regardless of how the
 * parent typed it.
 *
 * Exported so the caller can re-hash at read time when checking whether
 * a signal row's hash matches the parent-portal token's parent email
 * (the dedup posture for a parent who opens the SAME prior team's
 * parent portal twice).
 */
export function hashParentEmail(parentEmail: string): string {
  const normalized = (parentEmail ?? '').trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * True when the coach is "dormant" — at least `daysWindow` days since
 * `last_active_at`. A NULL `last_active_at` returns FALSE on purpose:
 * until the column starts backfilling naturally for a given coach, we
 * don't fire a reactivation signal on someone the product has no
 * recorded activity for at all (mirrors the 0042 quiet-coach predicate
 * in `src/lib/coach-quiet-check-in-utils.ts:isCoachQuiet`).
 */
export function isCoachDormant(
  row: { last_active_at: string | null | undefined },
  nowMs: number,
  daysWindow: number = DORMANT_THRESHOLD_DAYS_DEFAULT,
): boolean {
  const v = row.last_active_at;
  if (!v) return false;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= daysWindow * DAY_MS;
}

/**
 * Walk the prior-player rows for any whose parent_email matches the
 * input AND whose team_id is NOT the current team; resolve each to a
 * dormant coach via `team_coach_id`; return one candidate per match.
 *
 * The helper is BEST-EFFORT-CALLER: returning an empty array on any
 * shape problem (no rows, no matches, coaches all active) is the right
 * default. The caller's parent-portal page render NEVER waits on this
 * (LESSONS#0036).
 */
export function findDormantCoachesForReturningParent(
  args: DetectArgs,
): ReactivationCandidate[] {
  const {
    parentEmail,
    currentTeamId,
    coachRows,
    priorPlayerRows,
    nowMs,
    dormantThresholdDays = DORMANT_THRESHOLD_DAYS_DEFAULT,
  } = args;

  const normalizedEmail = (parentEmail ?? '').trim().toLowerCase();
  if (!normalizedEmail) return [];
  if (!Array.isArray(priorPlayerRows) || priorPlayerRows.length === 0) return [];
  if (!Array.isArray(coachRows) || coachRows.length === 0) return [];

  // Coach id → row, for fast dormant-lookup.
  const coachById = new Map<string, CoachFreshnessRow>();
  for (const c of coachRows) {
    if (c && typeof c.id === 'string') coachById.set(c.id, c);
  }

  const emailHash = hashParentEmail(normalizedEmail);
  const out: ReactivationCandidate[] = [];
  // Dedup on (dormantCoachId, priorPlayerId) — the same player row can
  // only fire ONCE per dormant coach even if the caller's join produced
  // a duplicate row (defensive).
  const seen = new Set<string>();

  for (const row of priorPlayerRows) {
    if (!row) continue;
    const rowEmail = (row.parent_email ?? '').trim().toLowerCase();
    if (!rowEmail || rowEmail !== normalizedEmail) continue;
    if (row.team_id === currentTeamId) continue;
    if (!row.team_coach_id) continue;

    const coach = coachById.get(row.team_coach_id);
    if (!coach) continue;
    if (!isCoachDormant(coach, nowMs, dormantThresholdDays)) continue;

    const dedupKey = `${row.team_coach_id}|${row.id}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    out.push({
      dormantCoachId: row.team_coach_id,
      priorTeamId: row.team_id,
      priorPlayerId: row.id,
      priorPlayerFirstName: row.first_name,
      parentEmailHash: emailHash,
    });
  }

  return out;
}
