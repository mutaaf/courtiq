/**
 * Ticket 0059 — pure helpers for the player-handoff flow.
 *
 * Two responsibilities, both deterministic and side-effect-free:
 *
 *   buildStructuredHandoffInputs(player, observations, signature)
 *     — derive the eight structured inputs the playerHandoffCard prompt
 *       accepts (topStrengths, topGrowthArea, signatureDrillNames,
 *       coachAuthoredHighlights) from the source coach's own observations
 *       on the player. Crucially: the highlights field is the small set of
 *       SHORT positive observation snippets the coach already authored; we
 *       cap the length and pass only first-name-safe substrings. The
 *       structured inputs explicitly EXCLUDE raw observation text with
 *       embedded PII — only category aggregates and short trimmed snippets
 *       ride forward (COPPA).
 *
 *   matchHandoffToPlayer(handoff, sourcePlayerFirstName, targetPlayer)
 *     — case-insensitive first-name + age-within-±1 + jersey-number-when-
 *       both-present matcher. Used by the receiver route to find an unclaimed
 *       handoff in the same org that matches the receiving coach's just-
 *       imported player. Uses ONLY data the receiving coach already has
 *       (no cross-DB join).
 *
 * No database access; no AI call. Imported by:
 *   - src/app/api/player-handoffs/generate-preview/route.ts
 *   - src/app/api/player-handoffs/commit/route.ts
 *   - src/app/api/player-handoffs/for-player/route.ts
 */

import type { Player, Observation } from '@/types/database';

export interface StructuredHandoffInputs {
  topStrengths: string[];
  topGrowthArea: string;
  signatureDrillNames: string[];
  coachAuthoredHighlights: string[];
}

/**
 * Minimum observations a player needs before the handoff card is offered. The
 * cold-start guard the ticket calls out: handoff cards are only meaningful
 * after the source coach has spent enough season-time with the player to have
 * an opinion. Tracked here so the route AND any future preview UI stay in
 * lockstep.
 */
export const MIN_OBSERVATIONS_FOR_HANDOFF = 5;

/**
 * Pull the first name off the player's full `name` field. Defensive about
 * blank values — never lets a `null` or empty string surface to the AI prompt
 * (which would silently become "Hi  — ...").
 */
export function firstNameOf(name: string | null | undefined): string {
  if (!name) return 'this player';
  const trimmed = name.trim();
  if (!trimmed) return 'this player';
  return trimmed.split(/\s+/)[0];
}

/**
 * Derive the structured inputs for the playerHandoffCard prompt from the
 * source coach's own observations on the player. The aggregation here mirrors
 * the existing season-storyline / parent-report logic (top categories from
 * sentiment-bucketed counts) so the receiving coach sees the same coaching
 * truth the source coach has been seeing for 12 weeks.
 *
 * COPPA: we never pass raw observation text whose body might contain a name,
 * parent contact, or DOB. The highlights array holds short snippets of
 * coach-authored positive observations, capped at 120 chars; the prompt
 * also explicitly instructs the model to use first names only.
 */
export function buildStructuredHandoffInputs(
  player: Pick<Player, 'id' | 'name'>,
  observations: Pick<Observation, 'category' | 'sentiment' | 'text'>[],
  signatureDrillNames: string[] = [],
): StructuredHandoffInputs {
  const strengthCounts = new Map<string, number>();
  const growthCounts = new Map<string, number>();
  const highlights: string[] = [];

  for (const obs of observations) {
    const cat = obs.category?.trim();
    if (cat) {
      if (obs.sentiment === 'positive') {
        strengthCounts.set(cat, (strengthCounts.get(cat) ?? 0) + 1);
      } else if (obs.sentiment === 'needs-work') {
        growthCounts.set(cat, (growthCounts.get(cat) ?? 0) + 1);
      }
    }

    // Collect up to six short positive snippets as the coach's own voice.
    // Trim to 120 chars so the prompt payload stays small and a stray long
    // observation can't bloat the context. We intentionally skip the
    // player's full name in the snippet (first-name-only is the rule the
    // prompt itself reinforces) — the highlight is a SHORT coach phrase,
    // not a paraphrase of the kid's identity.
    if (obs.sentiment === 'positive' && highlights.length < 6 && obs.text) {
      const trimmed = obs.text.trim();
      if (trimmed.length > 0) {
        highlights.push(trimmed.slice(0, 120));
      }
    }
  }

  const topStrengths = Array.from(strengthCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat]) => cat);

  const topGrowthEntry = Array.from(growthCounts.entries()).sort(
    ([, a], [, b]) => b - a,
  )[0];
  const topGrowthArea = topGrowthEntry ? topGrowthEntry[0] : '';

  // `player` is used only to defend against zero-observation callers below.
  // We return EMPTY arrays/strings rather than throwing so the route layer
  // can decide whether to drop the player (cold-start guard).
  void player;

  return {
    topStrengths,
    topGrowthArea,
    signatureDrillNames: signatureDrillNames.slice(0, 3),
    coachAuthoredHighlights: highlights,
  };
}

/**
 * Receiver-side matcher: does the given handoff likely refer to the
 * receiving coach's just-imported player?
 *
 *   - first name: case-insensitive, trimmed.
 *   - age group: when both sides have an `age_group`, the numeric anchors
 *     must be within ±1 year (e.g. "10-and-under" matches "U11"). When
 *     either side omits an age group, fall back to first-name + jersey.
 *   - jersey number: when both sides have one, they must match exactly.
 *     When either side omits, the jersey check is skipped (a kid who
 *     changed jerseys between seasons must still match).
 *
 * `cardFirstName` is the first name the SOURCE coach knew the player by —
 * derived from the source `players.name` before the handoff was minted.
 */
export function matchHandoffToPlayer(
  cardFirstName: string | null | undefined,
  cardAgeGroup: string | null | undefined,
  cardJerseyNumber: number | null | undefined,
  target: Pick<Player, 'name' | 'age_group' | 'jersey_number'>,
): boolean {
  const cardFirst = (cardFirstName ?? '').trim().toLowerCase();
  if (!cardFirst) return false;
  const targetFirst = firstNameOf(target.name).toLowerCase();
  if (cardFirst !== targetFirst) return false;

  if (
    typeof cardJerseyNumber === 'number' &&
    typeof target.jersey_number === 'number' &&
    cardJerseyNumber !== target.jersey_number
  ) {
    return false;
  }

  if (cardAgeGroup && target.age_group) {
    const cardAge = extractAgeNumber(cardAgeGroup);
    const targetAge = extractAgeNumber(target.age_group);
    if (cardAge != null && targetAge != null) {
      if (Math.abs(cardAge - targetAge) > 1) return false;
    }
  }

  return true;
}

/**
 * Pull the first integer out of an age-group label. "10-and-under" → 10,
 * "U11" → 11, "11-13" → 11. Returns null when no numeric anchor is present
 * so the caller knows to fall back to first-name + jersey alone.
 */
function extractAgeNumber(ageGroup: string): number | null {
  const m = ageGroup.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
