// ─── Ticket 0078 — dormant-publisher reactivation on clone (pure helper) ─────
//
// The smallest meaningful unit of the 0078 reactivation: a single
// publisher-side eligibility filter. Given (a) the unconsumed 0073
// `coach_reputation_milestones` rows the caller cron has loaded, (b) a
// pre-resolved coach-last-seen map (the freshness column is
// `coaches.last_active_at` per LESSONS#0096 and the 0072 helper), and
// (c) a pre-resolved cooldown map (the most recent
// `coach_clone_reactivation_signals.dispatched_at` per coach), returns
// the set of (coach, most-recent-qualifying-milestone) tuples the cron
// should send a reactivation email to in this run.
//
// Pure function: reads no DB, never calls Date.now() internally (the
// caller injects `nowMs` so a slow CI run can't drift past a boundary
// per LESSONS#0087). Mirrors the shape of `src/lib/coach-reactivation-
// utils.ts` (the 0072 sibling) so the cron's existing test posture
// applies untouched (table-keyed `mockImplementation` in the existing
// cron test stays valid — the helper itself is mock-free).
//
// COPPA: the helper consumes ONLY adult-only identifiers (coach ids,
// milestone kinds, timestamps). It never sees a player row, a parent
// email, a DOB, a jersey number. The cron's `.select()` allow-list is
// the load-bearing privacy gate (LESSONS#0036); this helper is one
// step further removed.
//
// Voice contract (LESSONS#0023): the helper is data only; it produces
// no user-facing string. The email template module
// `src/lib/dormant-publisher-clone-email.ts` is where the voice scan
// applies.

const DAY_MS = 24 * 60 * 60 * 1000;
const DORMANCY_DAYS_DEFAULT = 21;
const COOLDOWN_DAYS_DEFAULT = 60;

/**
 * One unconsumed reputation-milestone row as the cron reads it from
 * `coach_reputation_milestones`. The publishing-coach reactivation
 * branch only fires on rows where `notified_at IS NULL` (the in-app
 * card on /home has not been seen yet) AND a per-coach cooldown has
 * not blocked the email channel for the window.
 */
export interface PublisherMilestoneRow {
  id: string;
  published_coach_id: string;
  /** One of the values in the migration 065 / 067 CHECK constraint:
   *  `clones_3 | clones_10 | clones_25 | clones_50 | programs_2 |
   *  programs_4 | programs_8 | stuck_1 | stuck_3 | stuck_8`.
   *  The helper is opaque to the kind — the email template module
   *  decides the copy. */
  milestone_kind: string;
  crossed_at: string;
  notified_at: string | null;
}

/**
 * One row the cron returns: the unique (coach, most-recent-qualifying
 * milestone) tuple the caller should dispatch ONE email for.
 */
export interface DormantPublisherEmailCandidate {
  milestone_id: string;
  published_coach_id: string;
  milestone_kind: string;
}

export interface SelectArgs {
  /** Unconsumed milestone rows in the last 24h. The caller's
   *  `.from('coach_reputation_milestones').gte('crossed_at', ...)`
   *  read populates this. */
  milestones: PublisherMilestoneRow[];
  /** coach_id → `coaches.last_active_at` (ISO string). A coach with no
   *  entry is treated as NOT dormant (mirrors the 0072 helper's
   *  `isCoachDormant` predicate: a NULL freshness column doesn't
   *  trigger a reactivation pull — until the column starts backfilling
   *  naturally, we don't email someone the product has no recorded
   *  activity for at all). */
  coachLastSeen: Map<string, string>;
  /** coach_id → most recent
   *  `coach_clone_reactivation_signals.dispatched_at` (ISO string).
   *  A coach with no entry has no prior reactivation email; a coach
   *  whose last entry is within `cooldownDays` is excluded. */
  reactivationSignals: Map<string, string>;
  /** Days quiet before a publishing coach is considered "dormant
   *  enough" to receive the reactivation email. Defaults to 21 — the
   *  publish-graph signal earns a higher bar than the 0042 14-day
   *  quiet-check-in to prevent over-firing on the publisher cohort. */
  dormancyDays?: number;
  /** Days between successive reactivation emails to the same coach.
   *  Defaults to 60 — the load-bearing anti-fatigue contract from
   *  the ticket. */
  cooldownDays?: number;
  /** "Now" in milliseconds since epoch. Injected so the unit tests
   *  pin the boundaries without freezing the system clock. */
  nowMs: number;
}

/**
 * True when the coach is "dormant enough" — at least `daysWindow`
 * days since `last_active_at`. A NULL / missing entry returns false
 * on purpose (mirrors LESSONS#0096 — the 0072 helper's
 * `isCoachDormant`).
 */
function isCoachDormant(
  lastSeenIso: string | undefined,
  nowMs: number,
  daysWindow: number,
): boolean {
  if (!lastSeenIso) return false;
  const t = Date.parse(lastSeenIso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= daysWindow * DAY_MS;
}

/**
 * True when the coach was emailed within `cooldownDays`. A missing
 * entry returns false (no prior email → no cooldown block).
 */
function isOnCooldown(
  lastDispatchedIso: string | undefined,
  nowMs: number,
  cooldownDays: number,
): boolean {
  if (!lastDispatchedIso) return false;
  const t = Date.parse(lastDispatchedIso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < cooldownDays * DAY_MS;
}

/**
 * Walk the milestone rows, filter to the dormant-and-not-on-cooldown
 * publisher cohort, return one tuple per coach (the most-recent
 * qualifying milestone wins — one email per coach per cron run).
 *
 * Deterministic across input order: the per-coach pick is the
 * row with the latest `crossed_at`; ties are broken by lexicographic
 * id so two runs over the same data produce the same output.
 */
export function selectDormantPublishersForClones(
  args: SelectArgs,
): DormantPublisherEmailCandidate[] {
  const {
    milestones,
    coachLastSeen,
    reactivationSignals,
    dormancyDays = DORMANCY_DAYS_DEFAULT,
    cooldownDays = COOLDOWN_DAYS_DEFAULT,
    nowMs,
  } = args;

  if (!Array.isArray(milestones) || milestones.length === 0) return [];

  // Per-coach "best" milestone (latest crossed_at; tie-broken by id).
  const bestByCoach = new Map<string, PublisherMilestoneRow>();

  for (const row of milestones) {
    if (!row || typeof row.published_coach_id !== 'string') continue;
    if (row.notified_at !== null) continue;

    // Dormancy gate.
    if (!isCoachDormant(coachLastSeen.get(row.published_coach_id), nowMs, dormancyDays)) {
      continue;
    }
    // Cooldown gate.
    if (isOnCooldown(reactivationSignals.get(row.published_coach_id), nowMs, cooldownDays)) {
      continue;
    }

    const existing = bestByCoach.get(row.published_coach_id);
    if (!existing) {
      bestByCoach.set(row.published_coach_id, row);
      continue;
    }
    const existingTs = Date.parse(existing.crossed_at);
    const candidateTs = Date.parse(row.crossed_at);
    if (
      candidateTs > existingTs ||
      (candidateTs === existingTs && row.id < existing.id)
    ) {
      bestByCoach.set(row.published_coach_id, row);
    }
  }

  return Array.from(bestByCoach.values()).map((row) => ({
    milestone_id: row.id,
    published_coach_id: row.published_coach_id,
    milestone_kind: row.milestone_kind,
  }));
}
