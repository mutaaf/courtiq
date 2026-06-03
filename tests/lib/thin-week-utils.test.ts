/**
 * Ticket 0066 — pure helpers behind the second-week parent-report safety net.
 *
 * `isThinSecondPlusReport({ artifactCount, newObservationCount, daysSinceLastReport })`
 * decides whether the route should branch into the THIN-WEEK prompt block. The
 * helper is PURE — no DB access, no clock reads — so the route is the only
 * place that resolves the three inputs.
 *
 * `renderThinWeekFallback({ playerFirstName, previousCommitments,
 * carryForwardObservations, upcomingFocus })` renders a coach-clipboard plain
 * fallback paragraph the route uses ONLY when the AI's output trips the
 * banned-word scan. Per LESSONS#0023, the template body never enumerates the
 * banned tokens — the voice is positive by construction.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import {
  isThinSecondPlusReport,
  renderThinWeekFallback,
  THIN_WEEK_THRESHOLDS,
} from '@/lib/thin-week-utils';

const BANNED = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

function scanBanned(s: string) {
  const lower = s.toLowerCase();
  for (const b of BANNED) {
    if (lower.includes(b)) {
      throw new Error(`Banned token "${b}" found in: ${s}`);
    }
  }
}

describe('THIN_WEEK_THRESHOLDS — exported defaults (ticket 0066)', () => {
  it('exposes the artifact, observation, and recency thresholds as named constants', () => {
    expect(THIN_WEEK_THRESHOLDS.minArtifactCount).toBe(2);
    expect(THIN_WEEK_THRESHOLDS.thinObservationCount).toBe(4);
    expect(THIN_WEEK_THRESHOLDS.maxDaysSinceLastReport).toBe(21);
  });
});

describe('isThinSecondPlusReport — threshold edge cases (ticket 0066)', () => {
  // AC: artifactCount=1 → first-ever report → never the thin-week case.
  it('returns false when this is the FIRST report (artifactCount = 1)', () => {
    expect(
      isThinSecondPlusReport({
        artifactCount: 1,
        newObservationCount: 0,
        daysSinceLastReport: 0,
      })
    ).toBe(false);
  });

  it('returns false when artifactCount is 0 (no prior report at all)', () => {
    expect(
      isThinSecondPlusReport({
        artifactCount: 0,
        newObservationCount: 1,
        daysSinceLastReport: 0,
      })
    ).toBe(false);
  });

  // AC: artifactCount>=2 AND newObservationCount<4 AND daysSinceLastReport<=21 → thin.
  it('returns true for the documented thin-week case (2nd report, 3 obs, 8 days)', () => {
    expect(
      isThinSecondPlusReport({
        artifactCount: 2,
        newObservationCount: 3,
        daysSinceLastReport: 8,
      })
    ).toBe(true);
  });

  it('returns false when newObservationCount is exactly the threshold (4)', () => {
    expect(
      isThinSecondPlusReport({
        artifactCount: 2,
        newObservationCount: 4,
        daysSinceLastReport: 8,
      })
    ).toBe(false);
  });

  it('returns false for a 6-month-gap report (cross-season case, daysSinceLastReport > 21)', () => {
    expect(
      isThinSecondPlusReport({
        artifactCount: 2,
        newObservationCount: 1,
        daysSinceLastReport: 180,
      })
    ).toBe(false);
  });

  it('returns true at the daysSinceLastReport boundary (exactly 21)', () => {
    expect(
      isThinSecondPlusReport({
        artifactCount: 2,
        newObservationCount: 0,
        daysSinceLastReport: 21,
      })
    ).toBe(true);
  });

  it('returns false one day past the recency boundary (22)', () => {
    expect(
      isThinSecondPlusReport({
        artifactCount: 2,
        newObservationCount: 0,
        daysSinceLastReport: 22,
      })
    ).toBe(false);
  });

  it('returns true for the 5th-week thin case (artifactCount=5, 2 obs, 7 days)', () => {
    expect(
      isThinSecondPlusReport({
        artifactCount: 5,
        newObservationCount: 2,
        daysSinceLastReport: 7,
      })
    ).toBe(true);
  });

  // AC: defensive — negative-ish inputs are safe.
  it('returns false for negative inputs (defensive)', () => {
    expect(
      isThinSecondPlusReport({
        artifactCount: -1,
        newObservationCount: 0,
        daysSinceLastReport: 0,
      })
    ).toBe(false);
    expect(
      isThinSecondPlusReport({
        artifactCount: 2,
        newObservationCount: -1,
        daysSinceLastReport: 8,
      })
    ).toBe(false);
    expect(
      isThinSecondPlusReport({
        artifactCount: 2,
        newObservationCount: 0,
        daysSinceLastReport: -1,
      })
    ).toBe(false);
  });
});

describe('renderThinWeekFallback — coach-clipboard plain template (ticket 0066)', () => {
  const FULL_INPUT = {
    playerFirstName: 'Maya',
    previousCommitments: [
      'finish the closeout',
      'drive with the left hand',
      'communicate on switches',
    ],
    carryForwardObservations: [
      'Made one strong closeout in Saturday\'s scrimmage',
      'Called out a switch on the wing',
    ],
    upcomingFocus: 'closeouts on the next practice',
  };

  it('names the player by FIRST name only and names the lighter week honestly', () => {
    const out = renderThinWeekFallback(FULL_INPUT);
    expect(out).toContain('Maya');
    expect(out).toMatch(/lighter|less on-court|short week|thinner/i);
    expect(out).toContain('what carried forward');
  });

  it('quotes at least one of the previous commitments verbatim', () => {
    const out = renderThinWeekFallback(FULL_INPUT);
    const anyQuoted = FULL_INPUT.previousCommitments.some((c) => out.includes(c));
    expect(anyQuoted).toBe(true);
  });

  it('includes the upcoming-focus line ("what we\'re watching next")', () => {
    const out = renderThinWeekFallback(FULL_INPUT);
    expect(out.toLowerCase()).toContain('watching');
    expect(out).toContain(FULL_INPUT.upcomingFocus);
  });

  it('renders the zero-carry-forward honest single-sentence shape (AC zero-carry case)', () => {
    const out = renderThinWeekFallback({
      playerFirstName: 'Maya',
      previousCommitments: [
        'finish the closeout',
        'drive with the left hand',
        'communicate on switches',
      ],
      carryForwardObservations: [],
      upcomingFocus: 'how she comes back next practice',
    });
    expect(out).toContain('Maya');
    expect(out).toMatch(/didn't get much on-court time|much on-court|barely|short on practice/i);
    expect(out).toContain('how she comes back next practice');
  });

  it('contains NO AGENTS.md banned word for any plausible fixture', () => {
    const fixtures = [
      FULL_INPUT,
      {
        playerFirstName: 'Maya',
        previousCommitments: [],
        carryForwardObservations: [],
        upcomingFocus: 'next practice',
      },
      {
        playerFirstName: 'Sam',
        previousCommitments: ['box out under the rim'],
        carryForwardObservations: ['Boxed out twice on Saturday'],
        upcomingFocus: 'rebounding angles',
      },
    ];
    for (const f of fixtures) {
      scanBanned(renderThinWeekFallback(f));
    }
  });

  it('is purely deterministic for the same input (no clock / no RNG)', () => {
    const a = renderThinWeekFallback(FULL_INPUT);
    const b = renderThinWeekFallback(FULL_INPUT);
    expect(a).toBe(b);
  });

  it('safely falls back when previousCommitments is empty AND carryForward is empty', () => {
    const out = renderThinWeekFallback({
      playerFirstName: 'Maya',
      previousCommitments: [],
      carryForwardObservations: [],
      upcomingFocus: 'next practice',
    });
    expect(out).toContain('Maya');
    expect(out).toContain('next practice');
    // It should NOT crash and NOT leave dangling placeholder syntax.
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('${');
  });
});
