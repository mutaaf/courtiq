/**
 * Ticket 0058 — pure plan-draft predicate + gap summarizer.
 *
 * The cron AND the UI both need ONE answer to "is this practice plan a
 * draft, and which segment is missing?" The plan schema (per
 * `src/types/database.ts` + `supabase/migrations/001_schema.sql`) has no
 * `is_draft` column — drafting is inferred from the `content_structured`
 * jsonb shape: a draft is a `type='practice'` plan whose structured
 * content is missing at least one of the four canonical segments
 * (warmup, at-least-one-drill, scrimmage, cooldown).
 *
 * `.test.ts` per LESSONS#0038 — vitest excludes `**\/*.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import type { Plan } from '@/types/database';
import {
  isPlanDraft,
  summarizeDraftGap,
} from '@/lib/plan-draft-utils';

function basePlan(overrides: Partial<Plan>): Plan {
  return {
    id: 'plan-test',
    team_id: 'team-1',
    coach_id: 'coach-1',
    player_id: null,
    session_id: null,
    ai_interaction_id: null,
    type: 'practice',
    title: 'Tuesday Plan',
    content: '{}',
    content_structured: null,
    curriculum_week: null,
    skills_targeted: null,
    is_shared: false,
    share_token: null,
    share_expires_at: null,
    completed_drill_ids: [],
    source_plan_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('isPlanDraft', () => {
  it('treats a non-practice plan as not-a-draft (the predicate is only meaningful for practice)', () => {
    expect(isPlanDraft(basePlan({ type: 'game_recap' }))).toBe(false);
  });

  it('treats a practice plan with null content_structured as a draft', () => {
    expect(isPlanDraft(basePlan({ content_structured: null }))).toBe(true);
  });

  it('treats a practice plan missing all four segments as a draft', () => {
    const plan = basePlan({
      content_structured: {
        drills: [],
      },
    });
    expect(isPlanDraft(plan)).toBe(true);
  });

  it('treats a practice plan missing the closeout (cooldown) as a draft', () => {
    const plan = basePlan({
      content_structured: {
        warmup: { name: 'Defensive slides', duration_minutes: 10, description: 'warm up' },
        drills: [
          { name: 'Closeout drill', duration_minutes: 12, description: 'closeouts' },
        ],
        scrimmage: { duration_minutes: 15, focus: 'effort' },
      },
    });
    expect(isPlanDraft(plan)).toBe(true);
  });

  it('treats a practice plan with warmup + drills + scrimmage + cooldown as complete (not a draft)', () => {
    const plan = basePlan({
      content_structured: {
        warmup: { name: 'Defensive slides', duration_minutes: 10, description: 'warm up' },
        drills: [
          { name: 'Closeout drill', duration_minutes: 12, description: 'closeouts' },
        ],
        scrimmage: { duration_minutes: 15, focus: 'effort' },
        cooldown: { duration_minutes: 5, notes: 'stretch and high-five' },
      },
    });
    expect(isPlanDraft(plan)).toBe(false);
  });
});

describe('summarizeDraftGap', () => {
  it('returns gap=4 and "warmup" missingSegment for a fully-empty draft', () => {
    const plan = basePlan({ content_structured: null });
    const gap = summarizeDraftGap(plan);
    expect(gap.gapCount).toBe(4);
    expect(gap.missingSegment).toBe('warmup');
  });

  it('returns gap=1 and "cooldown" missingSegment when only cooldown is missing', () => {
    const plan = basePlan({
      content_structured: {
        warmup: { name: 'Defensive slides', duration_minutes: 10, description: 'warm up' },
        drills: [
          { name: 'Closeout drill', duration_minutes: 12, description: 'closeouts' },
        ],
        scrimmage: { duration_minutes: 15, focus: 'effort' },
      },
    });
    const gap = summarizeDraftGap(plan);
    expect(gap.gapCount).toBe(1);
    expect(gap.missingSegment).toBe('cooldown');
  });

  it('returns gap=1 and "scrimmage" missingSegment when only scrimmage is missing', () => {
    const plan = basePlan({
      content_structured: {
        warmup: { name: 'Defensive slides', duration_minutes: 10, description: 'warm up' },
        drills: [
          { name: 'Closeout drill', duration_minutes: 12, description: 'closeouts' },
        ],
        cooldown: { duration_minutes: 5, notes: 'stretch' },
      },
    });
    const gap = summarizeDraftGap(plan);
    expect(gap.gapCount).toBe(1);
    expect(gap.missingSegment).toBe('scrimmage');
  });

  it('returns gap=0 and null missingSegment when everything is filled', () => {
    const plan = basePlan({
      content_structured: {
        warmup: { name: 'Defensive slides', duration_minutes: 10, description: 'warm up' },
        drills: [
          { name: 'Closeout drill', duration_minutes: 12, description: 'closeouts' },
        ],
        scrimmage: { duration_minutes: 15, focus: 'effort' },
        cooldown: { duration_minutes: 5, notes: 'stretch' },
      },
    });
    const gap = summarizeDraftGap(plan);
    expect(gap.gapCount).toBe(0);
    expect(gap.missingSegment).toBe(null);
  });

  it('priority order: warmup > drills > scrimmage > cooldown', () => {
    // Drills, scrimmage and cooldown filled — only warmup missing.
    const plan = basePlan({
      content_structured: {
        drills: [
          { name: 'A', duration_minutes: 10, description: '' },
          { name: 'B', duration_minutes: 10, description: '' },
        ],
        scrimmage: { duration_minutes: 10, focus: 'effort' },
        cooldown: { duration_minutes: 5, notes: 'stretch' },
      },
    });
    const gap = summarizeDraftGap(plan);
    expect(gap.gapCount).toBe(1);
    expect(gap.missingSegment).toBe('warmup');
  });
});
