/**
 * Ticket 0045 — derive the `completed_drill_ids` stamp from a timer queue.
 *
 * AC3: the timer's "end practice" flow stamps the `completed_drill_ids` array on
 *      the plan row. The set comes from the queue items the timer actually
 *      ADVANCED through (the run-history hook already records these — and the
 *      queue items themselves carry a stable drillId/name we slugify).
 *
 * The pure derivation belongs in `practice-rollover-utils.ts` so the timer page
 * stays a thin caller; the IO (the `mutate()` call) is exercised in the
 * route-level + e2e tests.
 *
 *  - completed-everything: returns every drill's slug
 *  - completed-some:      returns only the slugs of advanced drills
 *  - force-close:         called with empty list → returns []
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveCompletedDrillIds,
  drillNameToSlug,
} from '@/lib/practice-rollover-utils';

interface QueueLike {
  name: string;
  drillId?: string;
}

describe('deriveCompletedDrillIds (ticket 0045)', () => {
  it('returns slugs for every queue item the timer advanced through', () => {
    const queue: QueueLike[] = [
      { name: 'Warmup Layups' },
      { name: 'Ball Handling Stations' },
      { name: 'Pick and Roll' },
      { name: 'Corner Shooting' },
    ];
    // The timer advanced through ALL queue items (idx 0..3 done).
    const out = deriveCompletedDrillIds(queue, queue.length);

    expect(out).toEqual([
      drillNameToSlug('Warmup Layups'),
      drillNameToSlug('Ball Handling Stations'),
      drillNameToSlug('Pick and Roll'),
      drillNameToSlug('Corner Shooting'),
    ]);
  });

  it('returns slugs only for queue items the timer ACTUALLY advanced through (time-ran-out)', () => {
    const queue: QueueLike[] = [
      { name: 'Warmup Layups' },
      { name: 'Ball Handling Stations' },
      { name: 'Pick and Roll' },
      { name: 'Corner Shooting' },
      { name: '3-on-3 to Shot' },
      { name: 'Scrimmage' },
    ];
    // Coach ran the first 4 of 6.
    const out = deriveCompletedDrillIds(queue, 4);

    expect(out).toEqual([
      drillNameToSlug('Warmup Layups'),
      drillNameToSlug('Ball Handling Stations'),
      drillNameToSlug('Pick and Roll'),
      drillNameToSlug('Corner Shooting'),
    ]);
    // The un-run drills (idx 4-5) are NOT in the stamp — that's the whole point
    // of the rollover diff: they show up next week, not in the completed list.
    expect(out).not.toContain(drillNameToSlug('3-on-3 to Shot'));
    expect(out).not.toContain(drillNameToSlug('Scrimmage'));
  });

  it('returns an empty array when the timer was force-closed (nothing advanced)', () => {
    const queue: QueueLike[] = [
      { name: 'Warmup Layups' },
      { name: 'Ball Handling Stations' },
    ];
    expect(deriveCompletedDrillIds(queue, 0)).toEqual([]);
  });

  it('caps at the queue length even if the caller passes a runaway index', () => {
    const queue: QueueLike[] = [{ name: 'Only Drill' }];
    expect(deriveCompletedDrillIds(queue, 5)).toEqual([drillNameToSlug('Only Drill')]);
  });

  it('skips queue items with empty/whitespace names (defensive)', () => {
    const queue: QueueLike[] = [
      { name: 'Warmup Layups' },
      { name: '   ' },
      { name: 'Pick and Roll' },
    ];
    const out = deriveCompletedDrillIds(queue, 3);
    expect(out).toEqual([drillNameToSlug('Warmup Layups'), drillNameToSlug('Pick and Roll')]);
  });
});
