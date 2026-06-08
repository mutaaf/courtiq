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
