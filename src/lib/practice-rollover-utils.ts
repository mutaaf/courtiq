/**
 * Ticket 0045 — pure helpers for the unfinished-drills rollover.
 *
 * The practicePlanSchema's drills[] array has only a `name` (no stable `id`),
 * so this module normalises drill names to slugs as the identity key
 * everywhere — the timer stamps slugs into `plans.completed_drill_ids`, the
 * route diffs slug-against-slug, and the rollover hint surfaces drill NAMES
 * (humans-readable) while carrying slugs as the stable id.
 *
 * Slug rules (deliberately small / stable):
 *   - trim, lowercase
 *   - drop punctuation (apostrophes, slashes, exclamation marks, etc.)
 *   - collapse runs of whitespace + dashes to a single dash
 *
 * The helpers are PURE — no DB, no storage. IO is the route's / timer's job.
 */

import { readQueue, getQueueKey, type QueueEntry } from '@/lib/practice-queue';

// ─── Slug ─────────────────────────────────────────────────────────────────

/**
 * Stable slug for a drill display name. Survives capitalisation, whitespace,
 * and trivial punctuation drift so the same drill name written two slightly
 * different ways still matches.
 */
export function drillNameToSlug(name: string): string {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed
    .toLowerCase()
    // Replace any run of whitespace OR non-alphanumeric-non-dash characters
    // with a single dash. Numbers and existing dashes pass through.
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse repeated dashes and strip leading/trailing ones.
    .replace(/^-+|-+$/g, '');
}

// ─── Rollover diff ────────────────────────────────────────────────────────

export interface RolloverDrill {
  /** The stable slug used as the rollover identity key. */
  drill_id: string;
  /** The original drill display name (for the plan view + prompt). */
  name: string;
  /** Best-effort focus phrase, derived from the drill's description. */
  focus?: string;
  duration_minutes?: number;
}

export type RolloverReason = 'time_ran_out' | 'all_completed' | 'no_prior_plan';

export interface RolloverDiffResult {
  rolloverDrills: RolloverDrill[];
  reason: RolloverReason;
}

interface PriorPlanLike {
  content_structured?: {
    drills?: Array<{ name?: string; duration_minutes?: number; description?: string }>;
  } | null;
}

const ROLLOVER_CAP = 3;

/**
 * Diff the prior plan's drills against the `completed_drill_ids` stamp and
 * return the un-run drills (capped at 3 — a coach who skipped half a plan
 * needs help, not a full re-run).
 *
 * The four matrix cases the AC names:
 *   - partial:          → `{ rolloverDrills: Drill[], reason: 'time_ran_out' }`
 *   - all-completed:    → `{ rolloverDrills: [],      reason: 'all_completed' }`
 *   - no-prior-plan:    → `{ rolloverDrills: [],      reason: 'no_prior_plan' }`
 *   - cap-at-3:         → `rolloverDrills.length <= 3`
 *
 * A force-closed timer leaves `completed_drill_ids` at its default `[]`, which
 * the helper treats AS IF every drill was skipped (deliberately generous —
 * a coach who got nowhere should get the strongest possible rollover hint).
 */
export function diffPracticeForRollover(
  plan: PriorPlanLike | null | undefined,
  completedDrillIds: string[] | null | undefined,
): RolloverDiffResult {
  if (!plan) {
    return { rolloverDrills: [], reason: 'no_prior_plan' };
  }

  const drills = plan.content_structured?.drills;
  if (!Array.isArray(drills) || drills.length === 0) {
    // A prior plan with no drills carries nothing to roll forward. Treating it
    // as "all_completed" keeps the prompt's cold-start shape intact.
    return { rolloverDrills: [], reason: 'all_completed' };
  }

  const completedSet = new Set(
    Array.isArray(completedDrillIds) ? completedDrillIds.filter(Boolean) : [],
  );

  const unfinished: RolloverDrill[] = [];
  for (const d of drills) {
    if (!d || typeof d.name !== 'string') continue;
    const slug = drillNameToSlug(d.name);
    if (!slug) continue;
    if (completedSet.has(slug)) continue;
    unfinished.push({
      drill_id: slug,
      name: d.name,
      focus: d.description?.trim() || undefined,
      duration_minutes: typeof d.duration_minutes === 'number' ? d.duration_minutes : undefined,
    });
    if (unfinished.length >= ROLLOVER_CAP) break;
  }

  if (unfinished.length === 0) {
    return { rolloverDrills: [], reason: 'all_completed' };
  }

  return { rolloverDrills: unfinished, reason: 'time_ran_out' };
}

// ─── Timer "completed drill" stamp derivation ─────────────────────────────

/**
 * Derive the `completed_drill_ids` stamp from the timer's queue + the index
 * the coach advanced through. The result is the slugs of drills the coach
 * ACTUALLY ran — never the inverse — so the rollover diff is generous to a
 * coach who got nowhere (no stamp ↔ everything skipped).
 *
 * Caller stamps the result on the active plan via the existing `mutate()`
 * helper: `mutate({ table: 'plans', operation: 'update', filters: { id },
 * data: { completed_drill_ids: [...slugs] } })` (AGENTS.md rule 3).
 */
export function deriveCompletedDrillIds(
  queue: Array<{ name?: string }>,
  advancedCount: number,
): string[] {
  if (!Array.isArray(queue) || queue.length === 0) return [];
  const safeCount = Math.max(0, Math.min(advancedCount, queue.length));
  const out: string[] = [];
  for (let i = 0; i < safeCount; i++) {
    const name = queue[i]?.name;
    if (typeof name !== 'string') continue;
    const slug = drillNameToSlug(name);
    if (!slug) continue;
    out.push(slug);
  }
  return out;
}

// ─── Queue prepend ────────────────────────────────────────────────────────

export interface RolloverQueueEntry {
  drill_id: string;
  drill_name: string;
  duration_minutes?: number;
}

/**
 * Prepend the rolled-over drills to the front of the existing local practice
 * queue (the same localStorage key the in-practice timer reads from). Order
 * matches the input array. A second call with the same rollover ids is a
 * no-op so the coach can re-tap "Add to queue" without doubling the prefix.
 */
export function prependRolloverDrillsToQueue(
  sessionId: string,
  rollover: RolloverQueueEntry[],
): void {
  if (!Array.isArray(rollover) || rollover.length === 0) return;
  if (typeof window === 'undefined') return;

  const existing = readQueue(sessionId);
  const existingIds = new Set(existing.map((q) => q.drillId).filter(Boolean) as string[]);
  const toPrepend: QueueEntry[] = [];
  for (const r of rollover) {
    if (!r.drill_id || existingIds.has(r.drill_id)) continue;
    toPrepend.push({
      id: `rollover-${r.drill_id}-${Date.now()}`,
      name: r.drill_name,
      durationSecs: Math.max(60, (r.duration_minutes ?? 5) * 60),
      cues: [],
      description: '',
      drillId: r.drill_id,
    });
    existingIds.add(r.drill_id);
  }
  if (toPrepend.length === 0) return;

  try {
    localStorage.setItem(
      getQueueKey(sessionId),
      JSON.stringify([...toPrepend, ...existing]),
    );
  } catch {
    // quota errors are non-fatal — the rollover is a hint, not a contract
  }
}
