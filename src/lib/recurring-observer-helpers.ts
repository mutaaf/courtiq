/**
 * Ticket 0092 — pure helper for the /home real-co-coach card.
 *
 * Given the raw observer-open rows + the recent referral-invite history,
 * returns the helpers who have crossed the structural-recurrence
 * threshold (default: 2+ opens across 2+ distinct practices in the last
 * 14 days) AND have NOT been invited via the existing 0015 referral
 * path in the last 30 days.
 *
 * Inputs:
 *  - `observerOpenRows`: the rows the route reads at pickup. The row
 *    shape mirrors the 0067 `sub_handoffs` columns — `helper_identifier`
 *    (the `sub_first_name` as the regular coach typed it when issuing
 *    the handoff acts as the identifier when `sub_handoffs` is the
 *    source — see the Implementation log for the schema reconciliation),
 *    `display_name` (the same first name; kept as a distinct field so
 *    the route can swap in the real observer-link telemetry once it
 *    exists), `team_id`, `opened_at` (`created_at` on `sub_handoffs`),
 *    `practice_id` (`session_id`), `ran_drill` (true when the helper
 *    sent back a sub-note — a structural proxy for "they ran the
 *    practice").
 *  - `invitesAlreadySent`: the rows from the existing 0011 / 0015 /
 *    0074 referral-invite history; the route derives this from the
 *    in-product invite signals. The cooldown window is 30 days.
 *
 * Output: a list of `{ helperIdentifier, displayName, openCount,
 * distinctPracticeCount, ranDrill, lastOpenAt, teamId }` capped at 5
 * entries, sorted by `openCount` desc then `lastOpenAt` desc for
 * determinism.
 *
 * Pure function — reads no DB, never mutates its inputs
 * (LESSONS#0070). UTC posture on all timestamps (LESSONS#0115).
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively. The
 * component test scans the helper's rendered output against the
 * AGENTS.md banned set; the helper source is not in the assertion path.
 *
 * LESSONS#0096 — the row shape here matches the route's narrow
 * `.select()` allow-list; if the underlying observer-link telemetry
 * table ever lands, only the route's read needs to update — this
 * helper's signature stays byte-identical.
 *
 * LESSONS#0061 — surname-shape defensive scans use a literal space,
 * never `\s+`; this helper preserves the raw `display_name` string and
 * the rendering component is the only place that does the literal-
 * space first-name-only split.
 */

export interface RecurringObserverOpenRow {
  helper_identifier: string;
  display_name: string | null;
  team_id: string;
  /** ISO 8601 UTC timestamp. */
  opened_at: string;
  /** Null when the helper opened the link outside a session context. */
  practice_id: string | null;
  ran_drill: boolean;
}

export interface RecurringObserverInvite {
  helper_identifier: string;
  team_id: string;
  /** ISO 8601 UTC timestamp. */
  sent_at: string;
}

export interface RecurringObserverHelper {
  helperIdentifier: string;
  displayName: string | null;
  openCount: number;
  distinctPracticeCount: number;
  ranDrill: boolean;
  lastOpenAt: string;
  teamId: string;
}

export interface FindRecurringObserverHelpersArgs {
  observerOpenRows: RecurringObserverOpenRow[];
  invitesAlreadySent: RecurringObserverInvite[];
  minOpens?: number;
  minDistinctPractices?: number;
  lookbackDays?: number;
  /** UTC milliseconds. */
  nowMs: number;
}

const DEFAULT_MIN_OPENS = 2;
const DEFAULT_MIN_DISTINCT_PRACTICES = 2;
const DEFAULT_LOOKBACK_DAYS = 14;
const INVITE_COOLDOWN_DAYS = 30;
const RESULT_CAP = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function findRecurringObserverHelpers(
  args: FindRecurringObserverHelpersArgs,
): RecurringObserverHelper[] {
  const {
    observerOpenRows,
    invitesAlreadySent,
    minOpens = DEFAULT_MIN_OPENS,
    minDistinctPractices = DEFAULT_MIN_DISTINCT_PRACTICES,
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
    nowMs,
  } = args;

  if (observerOpenRows.length === 0) return [];

  const windowStartMs = nowMs - lookbackDays * DAY_MS;
  const inviteCooldownStartMs = nowMs - INVITE_COOLDOWN_DAYS * DAY_MS;

  // (a) Filter opens within the lookback window. LESSONS#0070 — never
  // mutate inputs; build a fresh filtered list.
  const inWindow = observerOpenRows.filter((r) => {
    const t = Date.parse(r.opened_at);
    return Number.isFinite(t) && t >= windowStartMs && t <= nowMs;
  });

  // (b) Group by (helper_identifier, team_id).
  type GroupAcc = {
    helperIdentifier: string;
    displayName: string | null;
    teamId: string;
    opens: number;
    distinctPractices: Set<string>;
    ranDrill: boolean;
    lastOpenMs: number;
  };
  const groups = new Map<string, GroupAcc>();
  for (const r of inWindow) {
    const key = `${r.helper_identifier}::${r.team_id}`;
    const t = Date.parse(r.opened_at);
    const existing = groups.get(key);
    if (existing) {
      existing.opens += 1;
      if (r.practice_id) existing.distinctPractices.add(r.practice_id);
      if (r.ran_drill) existing.ranDrill = true;
      if (t > existing.lastOpenMs) {
        existing.lastOpenMs = t;
        // The latest open's display_name wins when set (a renamed
        // helper still carries the most recent label).
        if (r.display_name) existing.displayName = r.display_name;
      }
    } else {
      const distinct = new Set<string>();
      if (r.practice_id) distinct.add(r.practice_id);
      groups.set(key, {
        helperIdentifier: r.helper_identifier,
        displayName: r.display_name,
        teamId: r.team_id,
        opens: 1,
        distinctPractices: distinct,
        ranDrill: r.ran_drill,
        lastOpenMs: t,
      });
    }
  }

  // (d) Build the cooldown exclusion set from the referral-invite history.
  const cooldownKeys = new Set<string>();
  for (const inv of invitesAlreadySent) {
    const t = Date.parse(inv.sent_at);
    if (!Number.isFinite(t)) continue;
    if (t >= inviteCooldownStartMs && t <= nowMs) {
      cooldownKeys.add(`${inv.helper_identifier}::${inv.team_id}`);
    }
  }

  // (c) Keep groups meeting both thresholds AND not in cooldown.
  const eligible: RecurringObserverHelper[] = [];
  for (const [key, g] of groups) {
    if (g.opens < minOpens) continue;
    if (g.distinctPractices.size < minDistinctPractices) continue;
    if (cooldownKeys.has(key)) continue;
    eligible.push({
      helperIdentifier: g.helperIdentifier,
      displayName: g.displayName,
      openCount: g.opens,
      distinctPracticeCount: g.distinctPractices.size,
      ranDrill: g.ranDrill,
      lastOpenAt: new Date(g.lastOpenMs).toISOString(),
      teamId: g.teamId,
    });
  }

  // (f) Sort by openCount desc, then lastOpenAt desc.
  eligible.sort((a, b) => {
    if (b.openCount !== a.openCount) return b.openCount - a.openCount;
    return Date.parse(b.lastOpenAt) - Date.parse(a.lastOpenAt);
  });

  // (g) Cap at 5.
  return eligible.slice(0, RESULT_CAP);
}
