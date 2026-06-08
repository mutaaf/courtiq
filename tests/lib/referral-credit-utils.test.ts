/**
 * Ticket 0074 — src/lib/referral-credit-utils.ts.
 *
 * Pure helper. Given a set of converted-coach rows with shipped-artifact
 * counts and head-coached-observation counts, returns the count and ids
 * of the coaches whose qualification bar is crossed (shipped >= 1 OR
 * head-coached obs >= 5).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import {
  countQualifiedReferrals,
  QUALIFYING_ARTIFACT_TYPES,
  milestoneForCount,
  type ConvertedCoachRow,
} from '@/lib/referral-credit-utils';

describe('countQualifiedReferrals (ticket 0074)', () => {
  it('returns count 0 when there are no converted coaches', () => {
    const out = countQualifiedReferrals({
      inviterCoachId: 'inv-1',
      convertedCoachRows: [],
      nowMs: Date.now(),
    });
    expect(out.count).toBe(0);
    expect(out.qualifiedCoachIds).toEqual([]);
  });

  it('returns count 0 when no converted coach has crossed the bar', () => {
    const rows: ConvertedCoachRow[] = [
      { id: 'c-1', shipped_artifact_count: 0, head_coached_observation_count: 0 },
      { id: 'c-2', shipped_artifact_count: 0, head_coached_observation_count: 1 },
      { id: 'c-3', shipped_artifact_count: 0, head_coached_observation_count: 4 },
    ];
    const out = countQualifiedReferrals({
      inviterCoachId: 'inv-1',
      convertedCoachRows: rows,
      nowMs: Date.now(),
    });
    expect(out.count).toBe(0);
    expect(out.qualifiedCoachIds).toEqual([]);
  });

  it('counts 3 qualified via shipped_artifact_count', () => {
    const rows: ConvertedCoachRow[] = [
      { id: 'c-1', shipped_artifact_count: 1, head_coached_observation_count: 0 },
      { id: 'c-2', shipped_artifact_count: 2, head_coached_observation_count: 0 },
      { id: 'c-3', shipped_artifact_count: 7, head_coached_observation_count: 0 },
    ];
    const out = countQualifiedReferrals({
      inviterCoachId: 'inv-1',
      convertedCoachRows: rows,
      nowMs: Date.now(),
    });
    expect(out.count).toBe(3);
    expect(out.qualifiedCoachIds.sort()).toEqual(['c-1', 'c-2', 'c-3']);
  });

  it('counts 3 qualified via head_coached_observation_count', () => {
    const rows: ConvertedCoachRow[] = [
      { id: 'c-1', shipped_artifact_count: 0, head_coached_observation_count: 5 },
      { id: 'c-2', shipped_artifact_count: 0, head_coached_observation_count: 12 },
      { id: 'c-3', shipped_artifact_count: 0, head_coached_observation_count: 100 },
    ];
    const out = countQualifiedReferrals({
      inviterCoachId: 'inv-1',
      convertedCoachRows: rows,
      nowMs: Date.now(),
    });
    expect(out.count).toBe(3);
    expect(out.qualifiedCoachIds.sort()).toEqual(['c-1', 'c-2', 'c-3']);
  });

  it('returns only the qualified subset when input is a mix', () => {
    const rows: ConvertedCoachRow[] = [
      { id: 'c-1', shipped_artifact_count: 1, head_coached_observation_count: 0 }, // yes
      { id: 'c-2', shipped_artifact_count: 0, head_coached_observation_count: 0 }, // no
      { id: 'c-3', shipped_artifact_count: 0, head_coached_observation_count: 5 }, // yes
      { id: 'c-4', shipped_artifact_count: 0, head_coached_observation_count: 4 }, // no
      { id: 'c-5', shipped_artifact_count: 2, head_coached_observation_count: 9 }, // yes
    ];
    const out = countQualifiedReferrals({
      inviterCoachId: 'inv-1',
      convertedCoachRows: rows,
      nowMs: Date.now(),
    });
    expect(out.count).toBe(3);
    expect(out.qualifiedCoachIds.sort()).toEqual(['c-1', 'c-3', 'c-5']);
  });

  it('is deterministic across input order', () => {
    const rowsA: ConvertedCoachRow[] = [
      { id: 'c-1', shipped_artifact_count: 1, head_coached_observation_count: 0 },
      { id: 'c-2', shipped_artifact_count: 2, head_coached_observation_count: 0 },
      { id: 'c-3', shipped_artifact_count: 1, head_coached_observation_count: 0 },
    ];
    const rowsB = [rowsA[2], rowsA[0], rowsA[1]];
    const a = countQualifiedReferrals({
      inviterCoachId: 'inv-1',
      convertedCoachRows: rowsA,
      nowMs: Date.now(),
    });
    const b = countQualifiedReferrals({
      inviterCoachId: 'inv-1',
      convertedCoachRows: rowsB,
      nowMs: Date.now(),
    });
    expect(a.count).toBe(b.count);
    expect(a.qualifiedCoachIds.sort()).toEqual(b.qualifiedCoachIds.sort());
  });

  it('caps the returned qualifiedCoachIds list at 100 entries (defensive)', () => {
    const rows: ConvertedCoachRow[] = Array.from({ length: 150 }, (_, i) => ({
      id: `c-${i}`,
      shipped_artifact_count: 1,
      head_coached_observation_count: 0,
    }));
    const out = countQualifiedReferrals({
      inviterCoachId: 'inv-1',
      convertedCoachRows: rows,
      nowMs: Date.now(),
    });
    expect(out.count).toBe(150);
    expect(out.qualifiedCoachIds.length).toBe(100);
  });

  it('exports the QUALIFYING_ARTIFACT_TYPES const with the four documented plan types', () => {
    expect(QUALIFYING_ARTIFACT_TYPES).toEqual([
      'parent_report',
      'practice_plan',
      'weekly_pulse',
      'game_recap',
    ]);
  });
});

describe('milestoneForCount (ticket 0074)', () => {
  it('returns null below the first threshold', () => {
    expect(milestoneForCount(0)).toBeNull();
    expect(milestoneForCount(2)).toBeNull();
  });

  it('returns qualified_3 at 3-9', () => {
    expect(milestoneForCount(3)).toBe('qualified_3');
    expect(milestoneForCount(9)).toBe('qualified_3');
  });

  it('returns qualified_10 at 10-24', () => {
    expect(milestoneForCount(10)).toBe('qualified_10');
    expect(milestoneForCount(24)).toBe('qualified_10');
  });

  it('returns qualified_25 at 25+', () => {
    expect(milestoneForCount(25)).toBe('qualified_25');
    expect(milestoneForCount(100)).toBe('qualified_25');
  });
});
