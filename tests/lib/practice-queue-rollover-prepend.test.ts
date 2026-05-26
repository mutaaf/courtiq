/**
 * Ticket 0045 — practice-queue prepend on rollover.
 *
 * AC6: when the coach taps "Add to queue" on a freshly-generated plan with a
 *      non-empty `content_structured.rollover_from_last_week`, the rolled-over
 *      drills land at the TOP of the local `practice-queue` (the existing
 *      localStorage queue the timer reads from), in the order they were rolled
 *      over, BEFORE the newly-generated drills.
 *
 * The helper under test is `prependRolloverDrillsToQueue(sessionId, rollover)`,
 * a pure addition over the existing `practice-queue.ts` primitives so the
 * existing `addDrillToQueue` semantics are untouched.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  prependRolloverDrillsToQueue,
  type RolloverQueueEntry,
} from '@/lib/practice-rollover-utils';
import { readQueue, addDrillToQueue, getQueueKey } from '@/lib/practice-queue';
import type { Drill } from '@/types/database';

const SESSION_ID = 'session-tonight';

const ROLLOVERS: RolloverQueueEntry[] = [
  { drill_name: 'Corner Shooting', duration_minutes: 10, drill_id: 'corner-shooting' },
  { drill_name: '3-on-3 to Shot', duration_minutes: 12, drill_id: '3-on-3-to-shot' },
];

function freshDrill(name: string, mins: number): Drill {
  return {
    id: `drill-${name.toLowerCase().replace(/\s+/g, '-')}`,
    sport_id: 'sport-basketball',
    org_id: null,
    coach_id: null,
    curriculum_skill_id: null,
    name,
    description: '',
    category: 'general',
    age_groups: ['11-13'],
    duration_minutes: mins,
    player_count_min: 1,
    player_count_max: null,
    equipment: null,
    video_url: null,
    diagram_url: null,
    cv_eval_config: null,
    setup_instructions: null,
    teaching_cues: [],
    source: 'ai',
    created_at: '2026-05-26T00:00:00Z',
  };
}

describe('prependRolloverDrillsToQueue (ticket 0045)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('prepends the rollover drills BEFORE any drills already in the queue, in array order', () => {
    // Coach already added two fresh drills from the new plan to the queue.
    addDrillToQueue(SESSION_ID, freshDrill('New Drill A', 8));
    addDrillToQueue(SESSION_ID, freshDrill('New Drill B', 9));

    prependRolloverDrillsToQueue(SESSION_ID, ROLLOVERS);

    const queue = readQueue(SESSION_ID);
    expect(queue.map((q) => q.name)).toEqual([
      'Corner Shooting',
      '3-on-3 to Shot',
      'New Drill A',
      'New Drill B',
    ]);
  });

  it('writes rollover entries with the rollover drills durations in seconds', () => {
    prependRolloverDrillsToQueue(SESSION_ID, ROLLOVERS);
    const queue = readQueue(SESSION_ID);
    expect(queue[0].name).toBe('Corner Shooting');
    expect(queue[0].durationSecs).toBe(10 * 60);
    expect(queue[1].name).toBe('3-on-3 to Shot');
    expect(queue[1].durationSecs).toBe(12 * 60);
  });

  it('is a no-op when the rollover list is empty', () => {
    addDrillToQueue(SESSION_ID, freshDrill('New Drill A', 8));
    prependRolloverDrillsToQueue(SESSION_ID, []);
    const queue = readQueue(SESSION_ID);
    expect(queue.map((q) => q.name)).toEqual(['New Drill A']);
  });

  it('does NOT duplicate rollover drills if called twice with the same set', () => {
    prependRolloverDrillsToQueue(SESSION_ID, ROLLOVERS);
    prependRolloverDrillsToQueue(SESSION_ID, ROLLOVERS);

    const queue = readQueue(SESSION_ID);
    // Each rollover drill_id appears exactly once — second call is a no-op for
    // already-prepended rollover ids so the coach can re-tap "Add to queue"
    // without doubling the rollover prefix.
    const corner = queue.filter((q) => q.name === 'Corner Shooting');
    const threeOnThree = queue.filter((q) => q.name === '3-on-3 to Shot');
    expect(corner).toHaveLength(1);
    expect(threeOnThree).toHaveLength(1);
  });

  it('persists into the SAME localStorage key the timer reads from', () => {
    prependRolloverDrillsToQueue(SESSION_ID, ROLLOVERS);
    const raw = localStorage.getItem(getQueueKey(SESSION_ID));
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed[0].name).toBe('Corner Shooting');
  });
});
