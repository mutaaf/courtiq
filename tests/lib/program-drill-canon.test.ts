/**
 * Ticket 0090 — pure helper `computeProgramDrillCanon`.
 *
 * Given the union of in-program coaches' thumbed-up drill signals
 * (the existing 0039 `coach_drill_signals` cross-team persistence —
 * schema-wins-over-prose deviation per LESSONS#0096; the ticket
 * prose calls the source `drill_thumbs` but the actual migration
 * 040 table is `coach_drill_signals` keyed by (coach_id, drill_id)
 * with `rating='up'`) and the drills metadata for those drill_ids,
 * the helper returns the drills thumbed by AT LEAST `minCoaches`
 * (default 3) DISTINCT coaches in the program, sorted by coach
 * count descending then drill name ascending (for determinism on
 * ties), capped at `maxDrills` (default 10).
 *
 * Each entry carries: drillId, drillName, coachCount, the DISTINCT
 * first names of contributing coaches (up to 4), and the drill's
 * sport_id + age_groups.
 *
 * The helper is PURE — no DB, no AI, never mutates the input arrays
 * (LESSONS#0070). Voice posture (LESSONS#0023): the helper's jsdoc
 * instructs positively, never embeds a verbatim ban-list.
 *
 * Acceptance criteria mapping (from the ticket):
 *  (i)    empty coachThumbRows → empty drills
 *  (ii)   2 coaches thumbing same drill → EXCLUDED (below threshold)
 *  (iii)  3 distinct coaches thumbing same drill → INCLUDED with
 *         coachCount: 3 and 3 first names
 *  (iv)   1 coach thumbing 4 drills + 2 others thumbing 1 each →
 *         the 4 drills excluded individually (DISTINCT-coach
 *         requirement, not the thumb-count requirement)
 *  (v)    `minCoaches: 4` argument tightens the threshold
 *  (vi)   15 qualifying drills → returns the top 10 by coach count
 *  (vii)  tied coach counts → sorted alphabetically by drill name
 *  (viii) rendered first names are surname-stripped (literal space)
 *  (ix)   no banned word in any rendered field
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
 */
import { describe, it, expect } from 'vitest';
import { computeProgramDrillCanon } from '@/lib/program-drill-canon';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

function makeThumb(coach_id: string, coach_first_name: string, drill_id: string) {
  return { coach_id, coach_first_name, drill_id };
}

function makeDrill(id: string, name: string, sport_id = 'basketball', age_groups: string[] = ['8-10']) {
  return { id, name, sport_id, age_groups };
}

describe('computeProgramDrillCanon (ticket 0090)', () => {
  it('(i) empty coachThumbRows → empty drills', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [],
      drillRows: [],
    });
    expect(result.drills).toEqual([]);
    expect(result.totalCoachesContributing).toBe(0);
  });

  it('(ii) 2 coaches thumbing the same drill → drill EXCLUDED (below threshold)', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c2', 'James', 'd1'),
      ],
      drillRows: [makeDrill('d1', 'Closeout to recovery')],
    });
    expect(result.drills).toEqual([]);
  });

  it('(iii) 3 distinct coaches thumbing the same drill → INCLUDED with coachCount: 3 and 3 first names', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c2', 'James', 'd1'),
        makeThumb('c3', 'Lin', 'd1'),
      ],
      drillRows: [makeDrill('d1', 'Closeout to recovery')],
    });
    expect(result.drills).toHaveLength(1);
    expect(result.drills[0].drillId).toBe('d1');
    expect(result.drills[0].drillName).toBe('Closeout to recovery');
    expect(result.drills[0].coachCount).toBe(3);
    expect(result.drills[0].coachFirstNames).toEqual(['Maya', 'James', 'Lin']);
    expect(result.drills[0].sport_id).toBe('basketball');
    expect(result.drills[0].age_groups).toEqual(['8-10']);
  });

  it('(iv) one coach thumbing 4 drills + 2 others thumbing 1 each → all excluded (DISTINCT-coach requirement)', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        // coach c1 thumbs 4 different drills (counts as 1 distinct coach each)
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c1', 'Maya', 'd2'),
        makeThumb('c1', 'Maya', 'd3'),
        makeThumb('c1', 'Maya', 'd4'),
        // c2 and c3 each thumb their own single drill
        makeThumb('c2', 'James', 'd5'),
        makeThumb('c3', 'Lin', 'd6'),
      ],
      drillRows: [
        makeDrill('d1', 'Drill A'),
        makeDrill('d2', 'Drill B'),
        makeDrill('d3', 'Drill C'),
        makeDrill('d4', 'Drill D'),
        makeDrill('d5', 'Drill E'),
        makeDrill('d6', 'Drill F'),
      ],
    });
    // No drill has 3 DISTINCT coaches thumbing it.
    expect(result.drills).toEqual([]);
  });

  it('(v) minCoaches: 4 argument tightens the threshold', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c2', 'James', 'd1'),
        makeThumb('c3', 'Lin', 'd1'),
      ],
      drillRows: [makeDrill('d1', 'Closeout')],
      minCoaches: 4,
    });
    expect(result.drills).toEqual([]);
  });

  it('(vi) 15 qualifying drills → returns the top 10 by coach count', () => {
    const coaches = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i}`,
      first: ['Maya', 'James', 'Lin', 'Sara', 'Pat', 'Alex'][i % 6],
    }));
    const drills = Array.from({ length: 15 }, (_, i) => makeDrill(`d${i}`, `Drill ${String.fromCharCode(65 + i)}`));
    // d0: 15 coaches (counts: 15), d1: 14, ... d14: 1 coach (excluded).
    const thumbs: Array<{ coach_id: string; coach_first_name: string; drill_id: string }> = [];
    for (let drillIdx = 0; drillIdx < 15; drillIdx += 1) {
      const drillCoachCount = 15 - drillIdx;
      for (let cIdx = 0; cIdx < drillCoachCount; cIdx += 1) {
        thumbs.push(makeThumb(coaches[cIdx].id, coaches[cIdx].first, `d${drillIdx}`));
      }
    }
    const result = computeProgramDrillCanon({
      coachThumbRows: thumbs,
      drillRows: drills,
    });
    expect(result.drills).toHaveLength(10);
    expect(result.drills[0].drillId).toBe('d0');
    expect(result.drills[0].coachCount).toBe(15);
    expect(result.drills[9].drillId).toBe('d9');
    expect(result.drills[9].coachCount).toBe(6);
  });

  it('(vii) tied coach counts → sorted alphabetically by drill name for determinism', () => {
    const thumbs = [
      // Drill "Zebra" thumbed by 3 coaches.
      makeThumb('c1', 'Maya', 'd-zebra'),
      makeThumb('c2', 'James', 'd-zebra'),
      makeThumb('c3', 'Lin', 'd-zebra'),
      // Drill "Apple" thumbed by 3 coaches.
      makeThumb('c1', 'Maya', 'd-apple'),
      makeThumb('c2', 'James', 'd-apple'),
      makeThumb('c3', 'Lin', 'd-apple'),
      // Drill "Mango" thumbed by 3 coaches.
      makeThumb('c1', 'Maya', 'd-mango'),
      makeThumb('c2', 'James', 'd-mango'),
      makeThumb('c3', 'Lin', 'd-mango'),
    ];
    const drillRows = [
      makeDrill('d-zebra', 'Zebra drill'),
      makeDrill('d-apple', 'Apple drill'),
      makeDrill('d-mango', 'Mango drill'),
    ];
    const result = computeProgramDrillCanon({
      coachThumbRows: thumbs,
      drillRows,
    });
    expect(result.drills.map((d) => d.drillName)).toEqual([
      'Apple drill',
      'Mango drill',
      'Zebra drill',
    ]);
  });

  it('(viii) rendered first names are surname-stripped (literal-space defensive scan, LESSONS#0061)', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        makeThumb('c1', 'Maya Walker', 'd1'),
        makeThumb('c2', 'James Park', 'd1'),
        makeThumb('c3', 'Lin Anderson', 'd1'),
      ],
      drillRows: [makeDrill('d1', 'Closeout drill')],
    });
    expect(result.drills[0].coachFirstNames).toEqual(['Maya', 'James', 'Lin']);
    // Defensive: no surname leaks anywhere in the rendered field.
    for (const name of result.drills[0].coachFirstNames) {
      expect(name).not.toMatch(/ /);
    }
  });

  it('caps the rendered first-names list at 4 entries even when more coaches contributed', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c2', 'James', 'd1'),
        makeThumb('c3', 'Lin', 'd1'),
        makeThumb('c4', 'Sara', 'd1'),
        makeThumb('c5', 'Pat', 'd1'),
      ],
      drillRows: [makeDrill('d1', 'Closeout drill')],
    });
    expect(result.drills[0].coachCount).toBe(5);
    expect(result.drills[0].coachFirstNames).toHaveLength(4);
  });

  it('(ix) no AGENTS.md banned word appears in any rendered field', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c2', 'James', 'd1'),
        makeThumb('c3', 'Lin', 'd1'),
      ],
      drillRows: [makeDrill('d1', 'Closeout to recovery')],
    });
    const json = JSON.stringify(result).toLowerCase();
    for (const banned of BANNED_HYPE) {
      expect(json).not.toContain(banned);
    }
  });

  it('does not mutate the input arrays (LESSONS#0070)', () => {
    const thumbs = [
      makeThumb('c1', 'Maya', 'd1'),
      makeThumb('c2', 'James', 'd1'),
      makeThumb('c3', 'Lin', 'd1'),
    ];
    const drillRows = [makeDrill('d1', 'Closeout drill')];
    const thumbsBefore = JSON.stringify(thumbs);
    const drillRowsBefore = JSON.stringify(drillRows);
    computeProgramDrillCanon({ coachThumbRows: thumbs, drillRows });
    expect(JSON.stringify(thumbs)).toBe(thumbsBefore);
    expect(JSON.stringify(drillRows)).toBe(drillRowsBefore);
  });

  it('omits drills whose drill_id is not present in drillRows (defensive)', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        makeThumb('c1', 'Maya', 'd-missing'),
        makeThumb('c2', 'James', 'd-missing'),
        makeThumb('c3', 'Lin', 'd-missing'),
      ],
      drillRows: [],
    });
    expect(result.drills).toEqual([]);
  });

  it('counts DISTINCT coach_ids only (duplicate (coach,drill) rows do not inflate)', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c2', 'James', 'd1'),
      ],
      drillRows: [makeDrill('d1', 'Drill')],
    });
    // Only 2 distinct coaches — below threshold of 3.
    expect(result.drills).toEqual([]);
  });

  it('totalCoachesContributing counts distinct coaches across all qualifying drills', () => {
    const result = computeProgramDrillCanon({
      coachThumbRows: [
        makeThumb('c1', 'Maya', 'd1'),
        makeThumb('c2', 'James', 'd1'),
        makeThumb('c3', 'Lin', 'd1'),
        makeThumb('c4', 'Sara', 'd2'),
        makeThumb('c5', 'Pat', 'd2'),
        makeThumb('c1', 'Maya', 'd2'),
      ],
      drillRows: [
        makeDrill('d1', 'Drill One'),
        makeDrill('d2', 'Drill Two'),
      ],
    });
    expect(result.drills).toHaveLength(2);
    expect(result.totalCoachesContributing).toBe(5);
  });
});
