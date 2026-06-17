// ─── Ticket 0087 — program-tier-state helper ───────────────────────────────
//
// Pure helper. Given (a) the org's coach rows (each with the caller-loaded
// org tier + shipped-artifact count) and (b) the current org tier, returns
// the SHAPE the new `<ProgramOrgTierCard />` renders under and the server
// gates the eligibility check on.
//
// The card fires when the program is on the FREE tier yet has 3+ coaches
// independently paying for the Coach tier (or above) AND those coaches
// have shipped at least one structured artifact in the last 30 days. That
// is the "your own people already voted with their wallets" signal the
// upgrade moment depends on.
//
// Reads no DB. Writes no AI. Mirrors `src/lib/referral-credit-utils.ts`
// (0074) and `src/lib/coach-reputation-utils.ts` (0073) — a small pure
// module with one exported function the route + the component test + the
// e2e seed all pin without a Supabase mock.
//
// Voice posture (LESSONS#0023): the helper output is numbers + ids + first
// names; the rendered string carries no AGENTS.md banned word. The card
// jsdoc instructs positively in the surrounding component.

/** Coach prices and Org price in cents — kept in sync with the canonical
 *  `MONTHLY_PRICES` map exported from `src/components/ui/upgrade-gate.tsx`
 *  ($9.99 Coach, $49.99 Organization). Centralized here so the helper
 *  has no dependency on a React component module. */
const COACH_PRICE_CENTS = 999;
const ORG_PRICE_CENTS = 4999;

/** Cap on the first-names list rendered on the card. The card never
 *  scrolls — even if 7 paying coaches are active, the card surfaces the
 *  first three (deterministic input order). */
const MAX_NAMES = 3;

/** Closed set of tier strings the helper recognizes as "paid" (Coach tier
 *  or above; coaches on the Organization tier are excluded because their
 *  org is already on the right tier — they would never trigger this
 *  card). */
const PAID_COACH_TIERS: ReadonlySet<string> = new Set(['coach', 'pro_coach']);

/** Minimal coach-row shape. The caller resolves each coach's `org_tier`
 *  via `coaches.org_id → organizations.tier` and the
 *  `recent_shipped_artifact_count` via a count query against `plans`
 *  filtered to the `QUALIFYING_ARTIFACT_TYPES` set from the 0074 utils. */
export interface ProgramTierCoachRow {
  id: string;
  first_name: string;
  org_tier: 'free' | 'coach' | 'pro_coach' | 'organization';
  recent_shipped_artifact_count: number;
}

export interface ProgramTierState {
  /** Distinct Coach-tier-or-above coaches in the org who shipped at
   *  least one structured artifact in the last 30 days. */
  paidCoachCount: number;
  /** Up to MAX_NAMES first names of the qualified coaches, in input
   *  order (deterministic across input). */
  paidCoachFirstNames: string[];
  /** Total monthly spend across the qualified coaches, in cents.
   *  paidCoachCount * COACH_PRICE_CENTS. (A pro_coach coach is still
   *  counted at the Coach base — the card surfaces the FLOOR price; the
   *  director's mental model is "your coaches are paying $9.99 each.") */
  monthlySpendCents: number;
  /** monthlySpendCents - ORG_PRICE_CENTS. POSITIVE when consolidation
   *  saves money (5+ paid coaches); NEGATIVE when Org is a step up at
   *  the current paid-coach count. The card renders both honestly. */
  orgUpgradeSavingsCents: number;
  /** `paidCoachCount >= 3 AND currentOrgTier === 'free'` — the load-
   *  bearing eligibility gate. The route returns this flag; the card
   *  renders only when true. */
  eligibleForOrgUpgrade: boolean;
}

export interface SummarizeArgs {
  coachRows: ProgramTierCoachRow[];
  currentOrgTier: 'free' | 'coach' | 'pro_coach' | 'organization';
  /** "Now" in milliseconds since epoch. Reserved for a future windowed-
   *  qualification path (currently the bar is "shipped >= 1 in the
   *  last 30 days", and the 30-day window is enforced by the caller's
   *  DB query — the helper itself only sees the count). Kept on the
   *  signature so v2 windowing does not need a signature break (mirrors
   *  the 0074 `CountArgs.nowMs` posture). */
  nowMs: number;
}

/**
 * Summarize the program's tier state — the count of paid + active
 * coaches, their first names, the monthly spend math, and whether the
 * Org-upgrade card should fire.
 *
 * Pure: deterministic, no I/O.
 *
 * Voice posture (LESSONS#0023): output is structural (numbers + ids +
 * first names). The card prose is rendered by the consuming component;
 * neither output here nor the component embeds an AGENTS.md banned
 * word.
 */
export function summarizeProgramTierState(args: SummarizeArgs): ProgramTierState {
  const { coachRows, currentOrgTier } = args;
  if (!Array.isArray(coachRows) || coachRows.length === 0) {
    return {
      paidCoachCount: 0,
      paidCoachFirstNames: [],
      monthlySpendCents: 0,
      orgUpgradeSavingsCents: 0 - ORG_PRICE_CENTS,
      eligibleForOrgUpgrade: false,
    };
  }

  // Walk the input once, picking qualified coaches. Preserves input
  // order so the rendered first-names list is deterministic.
  const qualifiedNames: string[] = [];
  let qualifiedCount = 0;
  for (const row of coachRows) {
    if (!row || typeof row.id !== 'string') continue;
    const tier = typeof row.org_tier === 'string' ? row.org_tier : '';
    if (!PAID_COACH_TIERS.has(tier)) continue;
    const shipped =
      typeof row.recent_shipped_artifact_count === 'number'
        ? row.recent_shipped_artifact_count
        : 0;
    if (shipped < 1) continue;
    // Defensive: trim whitespace, then drop any character past the first
    // literal space (LESSONS#0061 — `\s+` conflates labelled-key newlines
    // with first-space-last surname splits; the literal space is the
    // correct guard). The route is the primary first-name stripper;
    // this is a belt + braces.
    const trimmed = typeof row.first_name === 'string' ? row.first_name.trim() : '';
    if (!trimmed) continue;
    const idx = trimmed.indexOf(' ');
    const first = idx === -1 ? trimmed : trimmed.slice(0, idx);
    qualifiedCount += 1;
    if (qualifiedNames.length < MAX_NAMES) qualifiedNames.push(first);
  }

  const monthlySpendCents = qualifiedCount * COACH_PRICE_CENTS;
  const orgUpgradeSavingsCents = monthlySpendCents - ORG_PRICE_CENTS;
  const eligibleForOrgUpgrade =
    qualifiedCount >= 3 && currentOrgTier === 'free';

  return {
    paidCoachCount: qualifiedCount,
    paidCoachFirstNames: qualifiedNames,
    monthlySpendCents,
    orgUpgradeSavingsCents,
    eligibleForOrgUpgrade,
  };
}

/** Exported for the route's per-coach pricing math. The card renders the
 *  Org price separately as `$49.99`; the helper computes the spend math
 *  from the same constant so the two never drift. */
export const PROGRAM_TIER_PRICES_CENTS = {
  coach: COACH_PRICE_CENTS,
  organization: ORG_PRICE_CENTS,
} as const;
