/**
 * Ticket 0032 — season-momentum-utils: the pure helpers that build the
 * season-position card's display from data we already collect. Per the ticket's
 * PREFERRED default (and LESSONS.md), the one-line trend sentence is derived
 * DETERMINISTICALLY from the numeric counts — no AI call, no quota cost, always
 * renders. These unit tests are the proof the sentence is built from the counts.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the Playwright spec glob.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTrendSentence,
  weeksActiveFromEarliest,
  type SeasonMomentum,
} from '@/lib/season-momentum-utils';

describe('buildTrendSentence (deterministic, no AI)', () => {
  it('names the counts when most recent notes are progress markers', () => {
    const trend = { positiveCount: 23, totalCount: 30 };
    const s = buildTrendSentence(trend);
    expect(s).toMatch(/23 of your last 30/i);
    // Clipboard tone — no breathless hype words.
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(s.toLowerCase()).not.toContain(banned);
    }
  });

  it('reports a balanced mix without overclaiming', () => {
    const s = buildTrendSentence({ positiveCount: 5, totalCount: 12 });
    expect(s).toMatch(/5 of your last 12/i);
  });

  it('returns an empty string when there are no observations to summarize', () => {
    expect(buildTrendSentence({ positiveCount: 0, totalCount: 0 })).toBe('');
  });
});

describe('weeksActiveFromEarliest', () => {
  it('derives whole weeks from the earliest observation to now (min 1 when any exist)', () => {
    const day = 24 * 60 * 60 * 1000;
    // Compute `now` at assertion time (not module load) and stay safely INSIDE a
    // week so a few seconds/minutes of test-run drift can't tip a ceil boundary:
    // 40 days → ceil(5.71) = 6; the boundary doesn't move until 42 days.
    expect(weeksActiveFromEarliest(new Date(Date.now() - 40 * day).toISOString())).toBe(6);
    // 8 days → ceil(1.14) = 2 (into the second week).
    expect(weeksActiveFromEarliest(new Date(Date.now() - 8 * day).toISOString())).toBe(2);
    // Recorded today → still counts as week 1 of activity (never 0 when an obs exists).
    expect(weeksActiveFromEarliest(new Date(Date.now() - 1 * day).toISOString())).toBe(1);
  });

  it('returns 0 when there is no earliest observation', () => {
    expect(weeksActiveFromEarliest(null)).toBe(0);
  });
});

describe('SeasonMomentum type shape', () => {
  it('carries only aggregate position + trend fields (compile-time + runtime sanity)', () => {
    const m: SeasonMomentum = {
      weekPosition: 6,
      weekTotal: 12,
      weeksActive: 6,
      trend: { positiveCount: 23, totalCount: 30 },
    };
    expect(Object.keys(m).sort()).toEqual(['trend', 'weekPosition', 'weekTotal', 'weeksActive']);
  });
});
