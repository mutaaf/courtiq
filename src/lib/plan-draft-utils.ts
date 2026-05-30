/**
 * Pure plan-draft predicate + gap summarizer (ticket 0058).
 *
 * The cron at `/api/cron/sunday-plan-prompt` and any future UI surface that
 * wants to render a "draft" chip on a practice plan import from THIS file
 * so the cron and the UI never disagree on what "draft" means.
 *
 * Schema reality: the `plans` table has NO `is_draft` column (verified
 * against `src/types/database.ts` and `supabase/migrations/`). Drafting is
 * inferred from the practice plan's `content_structured` jsonb shape: a
 * draft is a `type='practice'` plan whose structured content is missing at
 * least one of the four canonical segments — warmup, drills (≥1),
 * scrimmage, cooldown. This matches the `practicePlanSchema` in
 * `src/lib/ai/schemas.ts` (warmup + drills required, scrimmage + cooldown
 * optional but treated as "complete" only when both are present).
 *
 * No DB access. No imports beyond the Plan type. Tests live at
 * `tests/lib/plan-draft-utils.test.ts`.
 */
import type { Json, Plan } from '@/types/database';

export type DraftSegment = 'warmup' | 'drills' | 'scrimmage' | 'cooldown';

interface StructuredShape {
  warmup?: unknown;
  drills?: unknown;
  scrimmage?: unknown;
  cooldown?: unknown;
}

function asObject(j: Json | null): Record<string, unknown> | null {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  return j as Record<string, unknown>;
}

function hasWarmup(cs: StructuredShape): boolean {
  const w = cs.warmup;
  if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
  const obj = w as Record<string, unknown>;
  return typeof obj.name === 'string' && obj.name.length > 0;
}

function hasDrills(cs: StructuredShape): boolean {
  const d = cs.drills;
  return Array.isArray(d) && d.length > 0;
}

function hasScrimmage(cs: StructuredShape): boolean {
  const s = cs.scrimmage;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  const obj = s as Record<string, unknown>;
  // Either a focus string or a positive duration counts.
  return (
    (typeof obj.focus === 'string' && obj.focus.length > 0) ||
    typeof obj.duration_minutes === 'number'
  );
}

function hasCooldown(cs: StructuredShape): boolean {
  const c = cs.cooldown;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const obj = c as Record<string, unknown>;
  return (
    (typeof obj.notes === 'string' && obj.notes.length > 0) ||
    typeof obj.duration_minutes === 'number'
  );
}

/**
 * Returns true when the plan is a practice plan whose structured content is
 * missing at least one of the four canonical segments. Non-practice plans
 * return false (the predicate is only meaningful for practice plans — the
 * Sunday-evening prompt is exclusively about half-built practice plans).
 */
export function isPlanDraft(plan: Pick<Plan, 'type' | 'content_structured'>): boolean {
  if (plan.type !== 'practice') return false;
  const cs = asObject(plan.content_structured) as StructuredShape | null;
  if (!cs) return true;
  const filled =
    Number(hasWarmup(cs)) +
    Number(hasDrills(cs)) +
    Number(hasScrimmage(cs)) +
    Number(hasCooldown(cs));
  return filled < 4;
}

/**
 * Returns the count of missing canonical segments AND the most important
 * missing segment (priority order: warmup > drills > scrimmage > cooldown).
 * For a non-draft practice plan, returns `{ gapCount: 0, missingSegment:
 * null }`. For a non-practice plan, also returns `{ gapCount: 0,
 * missingSegment: null }` — the gap concept is undefined off the practice
 * surface.
 */
export function summarizeDraftGap(
  plan: Pick<Plan, 'type' | 'content_structured'>,
): { gapCount: number; missingSegment: DraftSegment | null } {
  if (plan.type !== 'practice') return { gapCount: 0, missingSegment: null };
  const cs = (asObject(plan.content_structured) as StructuredShape | null) ?? {};
  const order: Array<{ key: DraftSegment; filled: boolean }> = [
    { key: 'warmup', filled: hasWarmup(cs) },
    { key: 'drills', filled: hasDrills(cs) },
    { key: 'scrimmage', filled: hasScrimmage(cs) },
    { key: 'cooldown', filled: hasCooldown(cs) },
  ];
  const missing = order.filter((s) => !s.filled);
  return {
    gapCount: missing.length,
    missingSegment: missing.length > 0 ? missing[0].key : null,
  };
}
