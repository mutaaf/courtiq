/**
 * Ticket 0057 — pure helpers for the weekly-pulse share-card.
 *
 * Tests four things:
 *  - `currentIsoWeek` returns the canonical ISO week (Mon-start, week 1
 *    contains the first Thursday), including the Sun/Mon boundary and the
 *    early-Jan / late-Dec year-spill cases.
 *  - `isoWeekRange` returns the Monday start and Sunday end of a given week.
 *  - `topCategoriesFromObservations` ranks by combined needs-work + positive
 *    counts, ignores neutral, ties broken alphabetically.
 *  - `buildPulsePayload` returns the EXACT allow-list keys, splits coach
 *    first name server-side, and propagates focus/caption verbatim.
 *
 * No mocks needed — these are pure helpers (no DB / AI / fetch).
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import {
  PULSE_PAYLOAD_KEYS,
  buildPulsePayload,
  currentIsoWeek,
  formatWeekHeader,
  generateShareToken,
  isoWeekRange,
  topCategoriesFromObservations,
} from '@/lib/weekly-pulse-utils';

describe('weekly-pulse-utils (ticket 0057)', () => {
  describe('generateShareToken', () => {
    it('returns a 32-char hex string of non-trivial entropy', () => {
      const a = generateShareToken();
      const b = generateShareToken();
      expect(a).toMatch(/^[0-9a-f]{32}$/);
      expect(b).toMatch(/^[0-9a-f]{32}$/);
      expect(a).not.toBe(b);
    });
  });

  describe('currentIsoWeek', () => {
    it('formats as YYYY-Www with a zero-padded week', () => {
      // 2026-01-05 is the Monday of ISO week 2026-W02 (W01 contains the year's
      // first Thursday, which is Jan 1 — Mon Dec 29 starts W01).
      expect(currentIsoWeek(new Date('2026-01-05T12:00:00Z'))).toBe('2026-W02');
    });

    it('handles the Sunday/Monday boundary — Sunday belongs to the WEEK STARTING the Monday before it', () => {
      // Sun 2026-05-31 belongs to the week starting Mon 2026-05-25 (W22).
      // Mon 2026-06-01 starts W23.
      expect(currentIsoWeek(new Date('2026-05-31T12:00:00Z'))).toBe('2026-W22');
      expect(currentIsoWeek(new Date('2026-06-01T12:00:00Z'))).toBe('2026-W23');
    });

    it('handles year-spill: early-January dates belong to last year, late-December to next year', () => {
      // 2025-12-29 (Mon) is W01 of ISO year 2026 (week 1 contains the first
      // Thursday Jan 1, 2026).
      expect(currentIsoWeek(new Date('2025-12-29T12:00:00Z'))).toBe('2026-W01');
      // 2027-01-01 (Fri) is W53 of 2026 (Dec 28 2026 = Mon of W53).
      expect(currentIsoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    });
  });

  describe('isoWeekRange', () => {
    it('returns the Monday start and Sunday end of a given week', () => {
      const r = isoWeekRange('2026-W22');
      expect(r).not.toBeNull();
      // Mon May 25 2026 00:00:00 UTC → Sun May 31 2026 23:59:59.999 UTC.
      expect(r!.start.toISOString()).toBe('2026-05-25T00:00:00.000Z');
      expect(r!.end.toISOString()).toBe('2026-05-31T23:59:59.999Z');
    });

    it('returns null on a malformed isoWeek string', () => {
      expect(isoWeekRange('garbage')).toBeNull();
      expect(isoWeekRange('2026-W00')).toBeNull();
      expect(isoWeekRange('2026-W54')).toBeNull();
    });
  });

  describe('topCategoriesFromObservations', () => {
    it('returns top 2 categories by combined positive + needs-work count, ignores neutral', () => {
      const obs = [
        { category: 'Defense', sentiment: 'positive' },
        { category: 'Defense', sentiment: 'needs-work' },
        { category: 'Effort', sentiment: 'positive' },
        { category: 'Offense', sentiment: 'positive' },
        { category: 'Awareness', sentiment: 'neutral' },
        { category: 'Awareness', sentiment: 'neutral' },
      ];
      expect(topCategoriesFromObservations(obs)).toEqual(['Defense', 'Effort']);
    });

    it('breaks ties alphabetically so output is deterministic', () => {
      const obs = [
        { category: 'Defense', sentiment: 'positive' },
        { category: 'Offense', sentiment: 'positive' },
        { category: 'Effort', sentiment: 'positive' },
      ];
      expect(topCategoriesFromObservations(obs)).toEqual(['Defense', 'Effort']);
    });

    it('handles empty + malformed observations safely', () => {
      expect(topCategoriesFromObservations([])).toEqual([]);
      expect(
        topCategoriesFromObservations([
          { category: null, sentiment: 'positive' },
          { category: '', sentiment: 'positive' },
        ]),
      ).toEqual([]);
    });
  });

  describe('buildPulsePayload', () => {
    it('returns EXACTLY the public-key allow-list (no minor data, no leftover fields)', () => {
      const payload = buildPulsePayload({
        team: { name: 'E2E Test Team', age_group: '11-13' },
        coach: { full_name: 'Sasha Williams' },
        sport: { name: 'Basketball' },
        observations: [
          { category: 'Defense', sentiment: 'positive' },
          { category: 'Defense', sentiment: 'needs-work' },
          { category: 'Effort', sentiment: 'positive' },
        ],
        sessions: [{ id: 's1' }, { id: 's2' }],
        isoWeek: '2026-W22',
        focusLine: 'spacing & off-ball movement',
        caption: 'anyone want to swap closeout drills?',
      });

      // Keyset assertion — the route's deep-equality test depends on this.
      const keys = Object.keys(payload).sort();
      expect(keys).toEqual([...PULSE_PAYLOAD_KEYS].sort());

      expect(payload.coachFirstName).toBe('Sasha'); // first name only — never the last.
      expect(payload.teamName).toBe('E2E Test Team');
      expect(payload.sportName).toBe('Basketball');
      expect(payload.ageGroup).toBe('11-13');
      expect(payload.isoWeek).toBe('2026-W22');
      expect(payload.sessionCount).toBe(2);
      expect(payload.topCategories).toEqual(['Defense', 'Effort']);
      expect(payload.focusLine).toBe('spacing & off-ball movement');
      expect(payload.caption).toBe('anyone want to swap closeout drills?');

      // No leaked minor data even if planted upstream.
      const serialized = JSON.stringify(payload);
      for (const banned of ['Williams', 'parent', 'medical', 'dob', 'player_id']) {
        expect(serialized).not.toContain(banned);
      }
    });

    it('handles a coach with no full_name and a missing sport gracefully', () => {
      const payload = buildPulsePayload({
        team: { name: 'Solo Team', age_group: null },
        coach: { full_name: null },
        sport: null,
        observations: [],
        sessions: [],
        isoWeek: '2026-W22',
        focusLine: null,
        caption: null,
      });
      expect(payload.coachFirstName).toBeNull();
      expect(payload.sportName).toBeNull();
      expect(payload.ageGroup).toBeNull();
      expect(payload.sessionCount).toBe(0);
      expect(payload.topCategories).toEqual([]);
      expect(payload.focusLine).toBeNull();
      expect(payload.caption).toBeNull();
    });
  });

  describe('formatWeekHeader', () => {
    it('formats 2026-W22 as "Week of May 25"', () => {
      expect(formatWeekHeader('2026-W22')).toBe('Week of May 25');
    });
    it('falls back to the raw isoWeek on a malformed input', () => {
      expect(formatWeekHeader('garbage')).toBe('garbage');
    });
  });
});
