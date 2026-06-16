// ─── Ticket 0074 — referral credit qualification helper ─────────────────────
//
// Pure helper. Given a list of converted-coach rows (each with the
// caller-loaded shipped-artifact count and head-coached observation
// count), returns the count of qualified referrals + the matching
// coach ids.
//
// The QUALIFICATION bar — the converted coach has shipped at least
// ONE structured artifact OR has logged >= 5 observations on a team
// they head-coach — is the load-bearing anti-abuse contract: a ghost
// signup does NOT earn the inviter a free month.
//
// Reads no DB. Writes no AI. Mirrors `src/lib/coach-reputation-utils.ts`
// (0073) — a small pure module with one exported function the route +
// the milestone hook all pin without a Supabase mock.
//
// Per LESSONS#0023 — every output is a number / id-list, so no banned-
// word scan needed.
// Per LESSONS#0061 — no surname regex; this helper never formats a name.

/** Plan types that count as a "real shipped artifact" for the
 *  QUALIFICATION bar. The constant lives here (NOT in the route) so the
 *  bar is in ONE place — the route's count query reads `.in('type',
 *  QUALIFYING_ARTIFACT_TYPES)`. */
export const QUALIFYING_ARTIFACT_TYPES = [
  'parent_report',
  'practice_plan',
  'weekly_pulse',
  'game_recap',
] as const;

/** The five milestone kinds documented on the migration's CHECK
 *  constraint. */
export type ReferralCreditMilestoneKind =
  | 'qualified_3'
  | 'qualified_10'
  | 'qualified_25';

/** Minimal converted-coach row shape. The caller loads these by
 *  querying `coaches.preferences->>referred_by_code = makeReferralCode(inviter)`
 *  and joining on per-coach counts; the helper never reads the DB. */
export interface ConvertedCoachRow {
  id: string;
  shipped_artifact_count: number;
  head_coached_observation_count: number;
}

export interface CountArgs {
  inviterCoachId: string;
  convertedCoachRows: ConvertedCoachRow[];
  /** "Now" in milliseconds since epoch. Reserved for a future
   *  windowed-qualification path (currently the bar is shipped >= 1 OR
   *  obs >= 5, total — not windowed). Kept on the signature so v2
   *  windowing does not need a signature break. */
  nowMs: number;
}

export interface CountResult {
  /** The number of converted coaches whose QUALIFICATION bar is
   *  crossed. */
  count: number;
  /** The ids of the qualified converted coaches, capped at 100
   *  entries (defensive — a future "10x abuser" with 10k pseudo
   *  referrals would have their id list truncated before the audit
   *  trail row is written). */
  qualifiedCoachIds: string[];
}

/** The defensive cap on the returned `qualifiedCoachIds` list. */
const MAX_QUALIFIED_IDS = 100;

/**
 * Filter the converted-coach rows for those whose QUALIFICATION bar
 * is crossed and return the count + id list. Deterministic across
 * input order — preserves the input order in the returned id list
 * but the COUNT is order-independent (set semantics).
 */
export function countQualifiedReferrals(args: CountArgs): CountResult {
  const { convertedCoachRows } = args;
  if (!Array.isArray(convertedCoachRows) || convertedCoachRows.length === 0) {
    return { count: 0, qualifiedCoachIds: [] };
  }

  const qualified: string[] = [];
  for (const row of convertedCoachRows) {
    if (!row || typeof row.id !== 'string') continue;
    const shipped =
      typeof row.shipped_artifact_count === 'number'
        ? row.shipped_artifact_count
        : 0;
    const obs =
      typeof row.head_coached_observation_count === 'number'
        ? row.head_coached_observation_count
        : 0;
    if (shipped >= 1 || obs >= 5) {
      qualified.push(row.id);
    }
  }

  // The COUNT is the full set; the returned id LIST is capped per
  // MAX_QUALIFIED_IDS — the audit-trail row in
  // referral_credit_grants.qualified_referral_coach_ids must not blow
  // through a 4MB row limit if an abuser ever amasses tens of
  // thousands of ghost referrals (even if the qualified subset is
  // smaller in practice).
  const capped = qualified.slice(0, MAX_QUALIFIED_IDS);
  return { count: qualified.length, qualifiedCoachIds: capped };
}

/**
 * Map a qualified-count to the matching milestone kind, or null when
 * below the first threshold. Used by the GET status route + the POST
 * apply-credit route.
 */
export function milestoneForCount(
  count: number,
): ReferralCreditMilestoneKind | null {
  if (count >= 25) return 'qualified_25';
  if (count >= 10) return 'qualified_10';
  if (count >= 3) return 'qualified_3';
  return null;
}

/**
 * Extract the FIRST NAME from a coach's `full_name` field — a literal
 * space split, NOT `\s+` (LESSONS#0061 — a `\s+` would conflate a
 * labelled-key newline structure with a real surname split, and on
 * server payloads the literal-space variant is the correct guard).
 *
 * Defensive: empty string in → empty string out; null in → empty
 * string out.
 */
export function extractFirstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  // Literal-space split (LESSONS#0061). Falls back to the trimmed
  // whole string if there is no space.
  const idx = trimmed.indexOf(' ');
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

// ─── Ticket 0085 — forward-looking stacking-progress helper ──────────────
//
// The 0074 helper above answers "how many qualified referrals does this
// inviter have?" — the milestone-crossing question. This sibling helper
// answers "of the converted coaches who have NOT yet crossed the bar,
// who are they and what would they need to ship for the next milestone
// to fire?" — the forward-looking stacking question.
//
// Pure: reads no DB, writes no AI. The route loads the same converted-
// coach rows the 0074 path already loads (LESSONS#0066 — widen the
// existing select rather than add a new from() call); the helper just
// filters + summarizes them.
//
// Voice posture: every rendered string is written as a coach's
// clipboard would write it. Instruct positively in the jsdoc and the
// rendered string (LESSONS#0023 / #0034 / #0088 — never embed the
// verbatim banned-word list in code paths the contract test scans).

/** Shape of a converted-coach row including the first name + signup
 *  timestamp the pending helper formats. The 0074 route's existing
 *  `.select('id, full_name, created_at')` already pulls every column
 *  needed here — the route extracts the first name + remaps
 *  `created_at` → `signed_up_at` before calling this helper. */
export interface ConvertedCoachRowWithName {
  id: string;
  first_name: string;
  signed_up_at: string;
  shipped_artifact_count: number;
  head_coached_observation_count: number;
}

/** Defensive cap on the rendered pending list. The card never scrolls;
 *  if a coach has more than five pending referrals the rest are
 *  truncated until they ship or fall off. */
const MAX_PENDING_LIST = 5;

/** The 0074 milestone thresholds, in ascending order. Used to compute
 *  `nextMilestoneIn` (the count of MORE qualifying coaches needed to
 *  cross the next bar) and `nextMilestoneKind` (the literal enum value
 *  the next `referral_credit_grants` row would carry). */
const MILESTONE_STEPS: Array<{
  threshold: number;
  kind: ReferralCreditMilestoneKind;
}> = [
  { threshold: 3, kind: 'qualified_3' },
  { threshold: 10, kind: 'qualified_10' },
  { threshold: 25, kind: 'qualified_25' },
];

export interface PendingReferralSummary {
  /** First name only (the route strips the surname on a literal space
   *  per LESSONS#0061 before handing the row to this helper). */
  firstName: string;
  /** ISO timestamp of when the converted coach signed up. Lets the
   *  card render relative age if a future ticket wants that (v1 does
   *  not — see the out-of-scope list on ticket 0085). */
  signedUpAt: string;
  /** A single rendered "what the inviter would tell them" line in
   *  clipboard voice (LESSONS#0023). The SAME line for every pending
   *  coach — the bar is uniform — but rendered here so the route's
   *  consumers do not duplicate the copy. */
  needsToQualify: string;
}

export interface PendingReferralsResult {
  /** Up-to-MAX_PENDING_LIST pending coaches in input order. */
  pending: PendingReferralSummary[];
  /** Count of MORE qualifying coaches needed to cross the next
   *  milestone, derived from the qualified subset of the same input. */
  nextMilestoneIn: number;
  /** The literal milestone-enum key for the next milestone, or null
   *  when the inviter has already crossed `qualified_25`. */
  nextMilestoneKind: ReferralCreditMilestoneKind | null;
}

export interface PendingArgs {
  convertedCoachRows: ConvertedCoachRowWithName[];
  /** "Now" in milliseconds since epoch. Reserved for a future windowed
   *  pending-cutoff path (currently the bar is signed-up-at-any-time).
   *  Kept on the signature so v2 windowing does not need a signature
   *  break (mirrors the 0074 `CountArgs.nowMs` posture). */
  nowMs: number;
}

/** The clipboard-voice qualification line. Identical for every pending
 *  coach — the bar is uniform across them — so this is a single const
 *  the helper attaches to each pending row. */
const NEEDS_TO_QUALIFY_LINE =
  'needs to ship a parent report or run 5 observed practices';

/**
 * Summarize the signed-up-but-not-yet-qualifying converted coaches and
 * the next-milestone progress. Pure: deterministic, no I/O.
 *
 * The QUALIFICATION bar is the inverse of 0074's
 * `countQualifiedReferrals`: shipped >= 1 OR head-coached obs >= 5
 * means qualified; everything else is pending.
 */
export function summarizePendingReferrals(
  args: PendingArgs,
): PendingReferralsResult {
  const { convertedCoachRows } = args;
  if (!Array.isArray(convertedCoachRows) || convertedCoachRows.length === 0) {
    return {
      pending: [],
      nextMilestoneIn: 3,
      nextMilestoneKind: 'qualified_3',
    };
  }

  // Walk the input once, splitting into "qualified" and "pending"
  // buckets. The pending bucket is capped at MAX_PENDING_LIST while
  // walking so a very large input does not allocate a giant array.
  let qualifiedCount = 0;
  const pending: PendingReferralSummary[] = [];
  for (const row of convertedCoachRows) {
    if (!row || typeof row.id !== 'string') continue;
    const shipped =
      typeof row.shipped_artifact_count === 'number'
        ? row.shipped_artifact_count
        : 0;
    const obs =
      typeof row.head_coached_observation_count === 'number'
        ? row.head_coached_observation_count
        : 0;
    if (shipped >= 1 || obs >= 5) {
      qualifiedCount += 1;
      continue;
    }
    if (pending.length >= MAX_PENDING_LIST) continue;
    const first =
      typeof row.first_name === 'string' ? row.first_name.trim() : '';
    if (!first) continue;
    pending.push({
      firstName: first,
      signedUpAt: row.signed_up_at,
      needsToQualify: NEEDS_TO_QUALIFY_LINE,
    });
  }

  // Find the FIRST milestone the qualifiedCount has NOT yet crossed.
  // 0..2 → qualified_3, 3..9 → qualified_10, 10..24 → qualified_25,
  // 25+ → null.
  let nextMilestoneKind: ReferralCreditMilestoneKind | null = null;
  let nextMilestoneIn = 0;
  for (const step of MILESTONE_STEPS) {
    if (qualifiedCount < step.threshold) {
      nextMilestoneKind = step.kind;
      nextMilestoneIn = step.threshold - qualifiedCount;
      break;
    }
  }

  return { pending, nextMilestoneIn, nextMilestoneKind };
}

export interface BuildPendingNudgeArgs {
  pendingFirstNames: string[];
  /** When true, render the upgrade-aware "I'm working on a free month"
   *  amplification copy instead of the paid-tier "saw you signed up"
   *  line. */
  isFreeInviter: boolean;
}

/** Oxford-comma join of first names. */
function oxfordCommaJoin(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const head = names.slice(0, -1).join(', ');
  const tail = names[names.length - 1];
  return `${head}, and ${tail}`;
}

/**
 * Build the respectful nudge-share template body the "Text them a
 * nudge" button forwards to the native share sheet. Pure: no DB, no AI.
 *
 * The PAID variant reads as a paid coach checking in on a friend who
 * signed up but has not tried the headline feature yet. The FREE
 * variant is the same posture amplified by the inviter's own
 * stacking-progress (the free coach is working toward THEIR first
 * credited month).
 *
 * Voice posture (AGENTS.md / LESSONS#0023): instructed positively;
 * the verbatim banned-word list is NEVER embedded in code paths the
 * contract test scans (LESSONS#0034 / #0088).
 */
export function buildPendingNudgeMessage(args: BuildPendingNudgeArgs): string {
  const names = (args.pendingFirstNames ?? []).filter(
    (n): n is string => typeof n === 'string' && n.trim().length > 0,
  );
  if (names.length === 0) return '';
  const greeting = `Hey ${oxfordCommaJoin(names)}`;
  if (args.isFreeInviter) {
    // Free-tier amplification — the inviter shares their own
    // stacking-progress posture. "free month" is the only place the
    // dollar / credit language appears; the verbatim 0074 dollar
    // amount is the card's job, not the share-template body.
    return (
      `${greeting} — I'm working toward my next free month on SportsIQ.` +
      ` Curious what you thought of the parent report — it's the one that pulled me in.`
    );
  }
  return (
    `${greeting} — saw you signed up on SportsIQ last week and wanted to check in.` +
    ` Curious what you thought of the parent report; it's the one that pulled me in.`
  );
}
