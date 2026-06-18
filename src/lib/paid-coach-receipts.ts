/**
 * Ticket 0089 — pure helper for the day-60 paid-coach receipts card.
 *
 * Given the caller coach's paid-since timestamp and the six raw counter
 * arrays the GET /api/coach/paid-receipts route reads, this helper
 * returns either:
 *  - null when the day-56-to-day-90 fire window has not opened or has
 *    already closed; or
 *  - a deterministic shape carrying the five named counters, the list
 *    of cloning programs (deduped, capped at three, oxford-comma
 *    joined by the rendering component), and the next-month
 *    compounding-copy key.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively — it
 * never embeds an AGENTS.md banned word verbatim. The component test
 * scans the helper's OUTPUT against the banned set; the helper's
 * source is not in the assertion path.
 *
 * Pure, reads no DB, never mutates its inputs (LESSONS#0070). The
 * route's responsibility is to read the rows; the helper is arithmetic
 * only.
 *
 * LESSONS#0096: schema-wins-over-prose — the route's actual reads are
 * shaped at the call site; this helper accepts narrow row shapes so
 * it composes cleanly with the route's `.select()` allow-lists.
 *
 * LESSONS#0061: program-name strings are scanned for a surname shape
 * (literal space, never `\s+`) by the test suite; the helper itself
 * makes no assumption about the input string content other than
 * deduplication and cap.
 */

/**
 * Stable next-month copy key vocabulary. Each value names the
 * SHIPPED surface the next month's compounding maps to.
 *
 *  - month 3 → Practice Arc returning-player naming (anchored to
 *    tickets 0034 / 0061).
 *  - month 4 → drill canon emergence (anchored to tickets 0044 / 0073).
 *  - month 5 → program arc carrying forward (anchored to ticket 0083).
 *
 * The rendering component is the only place these keys resolve to a
 * full English line; keeping the key vocabulary here keeps the helper
 * pure and the copy testable in one place.
 */
export type PaidCoachReceiptsNextMonthCopyKey =
  | 'month_3_arc_returning_players'
  | 'month_4_drill_canon_emergence'
  | 'month_5_program_arc_carrying';

export interface PaidCoachReceiptsSummary {
  eligible: boolean;
  daysSincePaid: number;
  observationCount: number;
  parentReportCount: number;
  parentReadersThisMonth: number;
  drillsClonedCount: number;
  cloneProgramNames: string[];
  arcWeeksCarried: number;
  nextMonthIndex: 3 | 4 | 5;
  nextMonthCopyKey: PaidCoachReceiptsNextMonthCopyKey;
}

export interface PaidCoachReceiptsArgs {
  coachId: string;
  paidSinceMs: number;
  nowMs: number;
  observationRows: Array<{ id: string }>;
  planRows: Array<{ id: string; type: string; created_at: string }>;
  parentReactionRows: Array<{ id: string; created_at: string }>;
  parentReportRows: Array<{ id: string; created_at: string }>;
  cloneRows: Array<{ id: string; cloner_program_name?: string }>;
  arcRows: Array<{ week_index: number }>;
}

// The fire window in days since first paid: opens at day 56 (8 weeks),
// closes at day 90 (the natural border of month 3). The card silences
// itself outside this window so it never lingers into month 4.
const WINDOW_OPEN_DAYS = 56;
const WINDOW_CLOSE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the day-60 receipts summary for one coach.
 *
 * Returns null when the coach is OUTSIDE the day-56-to-day-90 window;
 * the route returns `{ eligible: false }` in that case so the card
 * stays silent.
 *
 * @param args.coachId — the caller's coach id (carried for traceability;
 *   the helper makes no DB calls).
 * @param args.paidSinceMs — UTC millisecond timestamp of the org's first
 *   paid moment (the route reads `organizations.paid_since_at` and
 *   passes the parsed value).
 * @param args.nowMs — UTC millisecond timestamp for "now"; injectable
 *   so tests are deterministic.
 * @param args.observationRows — narrow allow-list shape; the route's
 *   `.select()` reads only `id` per the COPPA contract.
 * @param args.planRows — narrow allow-list shape; the route filters by
 *   the parent-report `type` enum and counts the rows.
 * @param args.parentReactionRows — distinct parent readers in the last
 *   30 days, as already-filtered by the route.
 * @param args.parentReportRows — parent-report-shaped plan rows in the
 *   last 30 days; counted directly.
 * @param args.cloneRows — drill-share-clones joined to the cloner's
 *   organizations.name (see LESSONS#0078 — the join path is
 *   `drill_share_clones.cloner_coach_id → coaches.org_id → organizations.name`,
 *   NOT a `cloner_org_id` column on `drill_share_clones`).
 * @param args.arcRows — practice-arc state rows for the caller; the
 *   helper counts the distinct week_index values that have any
 *   carried-forward state.
 */
export function summarizePaidCoachReceipts(
  args: PaidCoachReceiptsArgs,
): PaidCoachReceiptsSummary | null {
  const elapsedMs = args.nowMs - args.paidSinceMs;
  const daysSincePaid = Math.floor(elapsedMs / DAY_MS);

  if (daysSincePaid < WINDOW_OPEN_DAYS) return null;
  if (daysSincePaid > WINDOW_CLOSE_DAYS) return null;

  // Counter arithmetic — the helper is summing pre-filtered arrays
  // the route already shaped. Each .length read is O(1) and is the
  // canonical primitive for "count of N rows."
  const observationCount = args.observationRows.length;
  const parentReportCount = args.parentReportRows.length;
  const parentReadersThisMonth = args.parentReactionRows.length;
  const drillsClonedCount = args.cloneRows.length;

  // Program-name dedup + cap (LESSONS#0023 — positive voice; LESSONS#0061 —
  // the test layer scans for surname shape, the helper itself only
  // deduplicates by string equality). The cap is 3 entries per the AC's
  // oxford-comma-join posture (LESSONS#0074 / #0087).
  const seen = new Set<string>();
  const cloneProgramNames: string[] = [];
  for (const row of args.cloneRows) {
    const name = row.cloner_program_name;
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    cloneProgramNames.push(name);
    if (cloneProgramNames.length >= 3) break;
  }
  // Sort for deterministic order across input permutations.
  cloneProgramNames.sort((a, b) => a.localeCompare(b));

  // arcWeeksCarried — distinct week_index values across the caller's
  // arc-state rows. The arc-state read elsewhere is responsible for
  // pulling the right rows; here we only count distinct weeks.
  const weekSet = new Set<number>();
  for (const row of args.arcRows) weekSet.add(row.week_index);
  const arcWeeksCarried = weekSet.size;

  // nextMonthIndex: floor(daysSincePaid / 30) → 1 = month 1, 2 = month 2,
  // 3 = month 3, etc. The "next" month is one beyond the current month
  // floor. Cap at 5 so the day-90 boundary maps cleanly to month 4
  // (floor(90/30) = 3 → next = 4) and never overshoots into month 6.
  const currentMonth = Math.floor(daysSincePaid / 30);
  const nextRaw = currentMonth + 1;
  const nextMonthIndex: 3 | 4 | 5 =
    nextRaw <= 3 ? 3 : nextRaw === 4 ? 4 : 5;

  const nextMonthCopyKey: PaidCoachReceiptsNextMonthCopyKey =
    nextMonthIndex === 3
      ? 'month_3_arc_returning_players'
      : nextMonthIndex === 4
        ? 'month_4_drill_canon_emergence'
        : 'month_5_program_arc_carrying';

  return {
    eligible: true,
    daysSincePaid,
    observationCount,
    parentReportCount,
    parentReadersThisMonth,
    drillsClonedCount,
    cloneProgramNames,
    arcWeeksCarried,
    nextMonthIndex,
    nextMonthCopyKey,
  };
}
