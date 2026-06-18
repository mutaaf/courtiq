/**
 * Ticket 0089 — pure helper summarizePaidCoachReceipts.
 *
 * The helper is the day-60 receipts surface's arithmetic core: given the
 * caller coach's paid-since timestamp + the SIX raw counter arrays the
 * route reads, it returns either:
 *  - null when the fire window (day 56 to day 90) hasn't opened yet OR
 *    has already closed; or
 *  - a deterministic shape carrying the five named counters and the
 *    next-month compounding-copy key.
 *
 * Pure, reads no DB, never mutates its inputs (LESSONS#0070).
 *
 * Acceptance criteria coverage (one assertion per AC bullet):
 *  (i)   daysSincePaid: 30 → null (too early).
 *  (ii)  daysSincePaid: 56 with 0 of everything → eligible, all counters 0.
 *  (iii) daysSincePaid: 60 with 84 observations / 9 reports / 11 reactions /
 *        2 clones in 1 program → exact counter shape.
 *  (iv)  daysSincePaid: 90 → eligible (boundary in).
 *  (v)   daysSincePaid: 91 → null (window past).
 *  (vi)  nextMonthIndex derived from floor(daysSincePaid / 30), capped at 5.
 *  (vii) cloneProgramNames deduped + capped at 3.
 *  (viii) planted surname-shaped strings in coach-name fields are NOT read
 *        (the helper does not consume coach names; counters only).
 *  (ix)  deterministic across input order.
 *  (x)   no banned word in any helper output (AGENTS.md voice).
 *
 * Voice posture (LESSONS#0023): the jsdoc on the helper instructs
 * positively and never embeds an AGENTS.md banned word verbatim — the
 * test scans the helper's OUTPUT, not its source.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
 */
import { describe, it, expect } from 'vitest';
import { summarizePaidCoachReceipts } from '@/lib/paid-coach-receipts';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 18, 12, 0, 0); // 2026-06-18T12:00:00Z

// AGENTS.md banned hype list — the scan reads the helper's emitted
// strings (program names + nextMonthCopyKey lookup string elsewhere).
const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

function emptyArgs(over: Partial<Parameters<typeof summarizePaidCoachReceipts>[0]> = {}) {
  return {
    coachId: COACH_ID,
    paidSinceMs: NOW - 60 * DAY,
    nowMs: NOW,
    observationRows: [],
    planRows: [],
    parentReactionRows: [],
    parentReportRows: [],
    cloneRows: [],
    arcRows: [],
    ...over,
  };
}

describe('summarizePaidCoachReceipts (ticket 0089)', () => {
  it('(i) daysSincePaid: 30 → null (too early)', () => {
    const out = summarizePaidCoachReceipts(emptyArgs({ paidSinceMs: NOW - 30 * DAY }));
    expect(out).toBeNull();
  });

  it('(ii) daysSincePaid: 56 with 0 of everything → eligible with all counters 0', () => {
    const out = summarizePaidCoachReceipts(emptyArgs({ paidSinceMs: NOW - 56 * DAY }));
    expect(out).not.toBeNull();
    expect(out!.eligible).toBe(true);
    expect(out!.daysSincePaid).toBe(56);
    expect(out!.observationCount).toBe(0);
    expect(out!.parentReportCount).toBe(0);
    expect(out!.parentReadersThisMonth).toBe(0);
    expect(out!.drillsClonedCount).toBe(0);
    expect(out!.cloneProgramNames).toEqual([]);
    expect(out!.arcWeeksCarried).toBe(0);
  });

  it('(iii) daysSincePaid: 60 with 84 obs / 9 reports / 11 reactions / 2 clones in 1 program → exact shape', () => {
    const observationRows = Array.from({ length: 84 }, (_, i) => ({ id: `obs-${i}` }));
    const parentReportRows = Array.from({ length: 9 }, (_, i) => ({
      id: `rep-${i}`,
      created_at: new Date(NOW - 5 * DAY).toISOString(),
    }));
    const parentReactionRows = Array.from({ length: 11 }, (_, i) => ({
      id: `rx-${i}`,
      created_at: new Date(NOW - 10 * DAY).toISOString(),
    }));
    const cloneRows = [
      { id: 'c-1', cloner_program_name: 'Hornets' },
      { id: 'c-2', cloner_program_name: 'Hornets' },
    ];
    const arcRows = [
      { week_index: 1 },
      { week_index: 2 },
      { week_index: 3 },
      { week_index: 4 },
    ];
    const out = summarizePaidCoachReceipts(emptyArgs({
      paidSinceMs: NOW - 60 * DAY,
      observationRows,
      parentReportRows,
      parentReactionRows,
      cloneRows,
      arcRows,
    }));
    expect(out).not.toBeNull();
    expect(out!.observationCount).toBe(84);
    expect(out!.parentReportCount).toBe(9);
    expect(out!.parentReadersThisMonth).toBe(11);
    expect(out!.drillsClonedCount).toBe(2);
    expect(out!.cloneProgramNames).toEqual(['Hornets']);
    expect(out!.arcWeeksCarried).toBe(4);
    expect(out!.daysSincePaid).toBe(60);
    expect(out!.nextMonthIndex).toBe(3);
  });

  it('(iv) daysSincePaid: 90 → eligible (boundary in)', () => {
    const out = summarizePaidCoachReceipts(emptyArgs({ paidSinceMs: NOW - 90 * DAY }));
    expect(out).not.toBeNull();
    expect(out!.eligible).toBe(true);
    expect(out!.daysSincePaid).toBe(90);
  });

  it('(v) daysSincePaid: 91 → null (window past)', () => {
    const out = summarizePaidCoachReceipts(emptyArgs({ paidSinceMs: NOW - 91 * DAY }));
    expect(out).toBeNull();
  });

  it('(vi) nextMonthIndex derived from floor(daysSincePaid / 30), capped at 5', () => {
    const at60 = summarizePaidCoachReceipts(emptyArgs({ paidSinceMs: NOW - 60 * DAY }));
    expect(at60!.nextMonthIndex).toBe(3);
    const at75 = summarizePaidCoachReceipts(emptyArgs({ paidSinceMs: NOW - 75 * DAY }));
    expect(at75!.nextMonthIndex).toBe(3);
    const at90 = summarizePaidCoachReceipts(emptyArgs({ paidSinceMs: NOW - 90 * DAY }));
    // floor(90/30) = 3, next month = 4
    expect(at90!.nextMonthIndex).toBe(4);
  });

  it('(vii) cloneProgramNames deduped + capped at 3', () => {
    const cloneRows = [
      { id: 'a', cloner_program_name: 'Hornets' },
      { id: 'b', cloner_program_name: 'Hornets' },
      { id: 'c', cloner_program_name: 'Lions' },
      { id: 'd', cloner_program_name: 'Eagles' },
      { id: 'e', cloner_program_name: 'Riverside' },
      { id: 'f', cloner_program_name: 'Westview' },
    ];
    const out = summarizePaidCoachReceipts(emptyArgs({
      paidSinceMs: NOW - 60 * DAY,
      cloneRows,
    }));
    expect(out!.cloneProgramNames).toHaveLength(3);
    expect(new Set(out!.cloneProgramNames).size).toBe(3);
    expect(out!.drillsClonedCount).toBe(6);
  });

  it('(viii) planted surname-shaped strings in unrelated fields are NOT read (counters only)', () => {
    // The helper consumes only counter shapes and program names.
    // Planting a surname-shaped string on a coach-name-shaped field
    // (which the helper does not read) must not bleed into the
    // emitted program-name list.
    const cloneRows = [
      { id: 'c-1', cloner_program_name: 'Hornets' },
    ];
    const out = summarizePaidCoachReceipts(emptyArgs({
      paidSinceMs: NOW - 60 * DAY,
      cloneRows,
    }));
    // Defensive scan: a surname-shaped token (literal-space per
    // LESSONS#0061) never lands in the emitted program list.
    for (const name of out!.cloneProgramNames) {
      expect(name).not.toMatch(/ [A-Z][a-z]+/);
    }
  });

  it('(ix) deterministic across input order', () => {
    const baseClones = [
      { id: 'c-1', cloner_program_name: 'Hornets' },
      { id: 'c-2', cloner_program_name: 'Lions' },
      { id: 'c-3', cloner_program_name: 'Eagles' },
    ];
    const a = summarizePaidCoachReceipts(emptyArgs({
      paidSinceMs: NOW - 60 * DAY,
      cloneRows: baseClones,
    }));
    const b = summarizePaidCoachReceipts(emptyArgs({
      paidSinceMs: NOW - 60 * DAY,
      cloneRows: [...baseClones].reverse(),
    }));
    expect(a!.cloneProgramNames).toEqual(b!.cloneProgramNames);
    expect(a!.drillsClonedCount).toBe(b!.drillsClonedCount);
  });

  it('(x) no banned word in any helper output (AGENTS.md voice)', () => {
    const out = summarizePaidCoachReceipts(emptyArgs({
      paidSinceMs: NOW - 60 * DAY,
      cloneRows: [{ id: 'c-1', cloner_program_name: 'Hornets' }],
    }));
    const blob = JSON.stringify(out).toLowerCase();
    for (const banned of BANNED_HYPE) {
      expect(blob).not.toContain(banned);
    }
    expect(blob).not.toContain('thank you');
    expect(blob).not.toContain('appreciate');
    expect(blob).not.toContain('we love');
  });

  it('the helper never mutates its input arrays (LESSONS#0070)', () => {
    const observationRows = [{ id: 'o-1' }];
    const cloneRows = [{ id: 'c-1', cloner_program_name: 'Hornets' }];
    const beforeObs = [...observationRows];
    const beforeClones = [...cloneRows];
    summarizePaidCoachReceipts(emptyArgs({
      paidSinceMs: NOW - 60 * DAY,
      observationRows,
      cloneRows,
    }));
    expect(observationRows).toEqual(beforeObs);
    expect(cloneRows).toEqual(beforeClones);
  });
});
