/**
 * Ticket 0084 — pure `buildViralSocialProof` helper.
 *
 * The helper turns a closed-enum list of viral events into ONE short
 * factual line for the quota wall's social-proof slot. Mirrors the
 * pure-helper posture of 0073 / 0072 / 0074: no DB, no clock other
 * than the explicit `nowMs` argument, no banned words in any rendered
 * variant.
 *
 * Priority order (highest wins, ties broken by recency):
 *   reputation_milestone
 *   > drill_stick_signal
 *   > parent_forward_cross_team
 *   > parent_forward_on_team
 *   > drill_clone
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import {
  buildViralSocialProof,
  type ViralProofEvent,
} from '@/lib/viral-social-proof';

const NOW = Date.parse('2026-06-16T19:09:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

// AGENTS.md banned words. Asserted as a positive scan over the rendered
// line, never embedded verbatim in the helper's jsdoc (LESSONS#0023).
const BANNED_WORDS = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
];

describe('buildViralSocialProof (ticket 0084)', () => {
  it('returns null on an empty events array', () => {
    expect(buildViralSocialProof({ events: [], nowMs: NOW })).toBeNull();
  });

  it('returns null when every event is older than 14 days', () => {
    const stale: ViralProofEvent[] = [
      {
        kind: 'parent_forward_on_team',
        occurredAtMs: NOW - 20 * DAY_MS,
        teamName: 'Hawks',
        senderCount: 3,
      },
      {
        kind: 'drill_clone',
        occurredAtMs: NOW - 30 * DAY_MS,
        programName: 'Hornets',
        drillTitle: 'closeout drill',
      },
    ];
    expect(buildViralSocialProof({ events: stale, nowMs: NOW })).toBeNull();
  });

  it('renders the on-team forward line when one fresh forward is present', () => {
    const events: ViralProofEvent[] = [
      {
        kind: 'parent_forward_on_team',
        occurredAtMs: NOW - 2 * DAY_MS,
        teamName: 'Hawks',
        senderCount: 3,
      },
    ];
    const result = buildViralSocialProof({ events, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.eventKind).toBe('parent_forward_on_team');
    expect(result!.line).toContain('3 parents');
    expect(result!.line).toContain('Hawks');
  });

  it('picks the stick signal over a plain clone in the same window', () => {
    const events: ViralProofEvent[] = [
      {
        kind: 'drill_clone',
        occurredAtMs: NOW - 1 * DAY_MS,
        programName: 'Hornets',
        drillTitle: 'closeout drill',
      },
      {
        kind: 'drill_stick_signal',
        occurredAtMs: NOW - 4 * DAY_MS,
        programName: 'Hornets',
        drillTitle: 'closeout drill',
      },
    ];
    const result = buildViralSocialProof({ events, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.eventKind).toBe('drill_stick_signal');
    expect(result!.line).toContain('closeout drill');
    expect(result!.line.toLowerCase()).toContain('thumbed');
  });

  it('reputation_milestone beats every other kind even when others are newer', () => {
    const events: ViralProofEvent[] = [
      {
        kind: 'parent_forward_cross_team',
        occurredAtMs: NOW - 1 * DAY_MS,
        teamName: 'Hawks',
      },
      {
        kind: 'drill_stick_signal',
        occurredAtMs: NOW - 1 * DAY_MS,
        programName: 'Hornets',
        drillTitle: 'closeout drill',
      },
      {
        kind: 'reputation_milestone',
        occurredAtMs: NOW - 6 * DAY_MS,
        programCount: 4,
      },
    ];
    const result = buildViralSocialProof({ events, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.eventKind).toBe('reputation_milestone');
    expect(result!.line).toContain('4 programs');
  });

  it('renders the cross-team forward line above the same-team line', () => {
    const events: ViralProofEvent[] = [
      {
        kind: 'parent_forward_on_team',
        occurredAtMs: NOW - 1 * DAY_MS,
        teamName: 'Hawks',
        senderCount: 2,
      },
      {
        kind: 'parent_forward_cross_team',
        occurredAtMs: NOW - 3 * DAY_MS,
        teamName: 'Hornets',
      },
    ];
    const result = buildViralSocialProof({ events, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.eventKind).toBe('parent_forward_cross_team');
    expect(result!.line).toContain('teammate team');
  });

  it('renders a plain clone line when nothing higher is in window', () => {
    const events: ViralProofEvent[] = [
      {
        kind: 'drill_clone',
        occurredAtMs: NOW - 2 * DAY_MS,
        programName: 'Hornets',
        drillTitle: 'closeout drill',
      },
    ];
    const result = buildViralSocialProof({ events, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.eventKind).toBe('drill_clone');
    expect(result!.line).toContain('Hornets');
    expect(result!.line).toContain('closeout drill');
  });

  it('renders no banned word across a wide matrix of inputs', () => {
    const matrix: ViralProofEvent[][] = [
      [
        {
          kind: 'parent_forward_on_team',
          occurredAtMs: NOW - 1 * DAY_MS,
          teamName: 'Hawks',
          senderCount: 1,
        },
      ],
      [
        {
          kind: 'parent_forward_on_team',
          occurredAtMs: NOW - 1 * DAY_MS,
          teamName: 'Hawks',
          senderCount: 9,
        },
      ],
      [
        {
          kind: 'parent_forward_cross_team',
          occurredAtMs: NOW - 1 * DAY_MS,
          teamName: 'Hornets',
        },
      ],
      [
        {
          kind: 'drill_clone',
          occurredAtMs: NOW - 1 * DAY_MS,
          programName: 'Hornets',
          drillTitle: 'closeout drill',
        },
      ],
      [
        {
          kind: 'drill_stick_signal',
          occurredAtMs: NOW - 1 * DAY_MS,
          programName: 'Hornets',
          drillTitle: 'closeout drill',
        },
      ],
      [
        {
          kind: 'reputation_milestone',
          occurredAtMs: NOW - 1 * DAY_MS,
          programCount: 15,
        },
      ],
    ];
    for (const events of matrix) {
      const result = buildViralSocialProof({ events, nowMs: NOW });
      expect(result).not.toBeNull();
      const line = result!.line.toLowerCase();
      for (const banned of BANNED_WORDS) {
        expect(line).not.toContain(banned);
      }
    }
  });

  it('never includes a parent surname in the rendered line (literal-space guard, LESSONS#0061)', () => {
    // Even if the caller smuggles a "first last" team name through,
    // the rendered line carries only the team name and the count —
    // never a parent's surname. Literal space, not \s+ (LESSONS#0061).
    const events: ViralProofEvent[] = [
      {
        kind: 'parent_forward_on_team',
        occurredAtMs: NOW - 1 * DAY_MS,
        teamName: 'Hawks',
        senderCount: 3,
      },
    ];
    const result = buildViralSocialProof({ events, nowMs: NOW });
    // Defensive: the rendered line contains "Hawks" followed only by
    // an ascii word-boundary (whitespace, punctuation, end of string).
    // It must NEVER read "Hawks Walker" or "Hawks Johnson".
    expect(result!.line).not.toMatch(/Hawks [A-Z][a-z]+/);
  });

  it('never names a cloning coach by name (program-name attribution only — LESSONS#0073)', () => {
    // The clone line takes only programName + drillTitle. The helper
    // has no input slot for a coach name, structurally. A surname-shape
    // word is never rendered in the line.
    const events: ViralProofEvent[] = [
      {
        kind: 'drill_clone',
        occurredAtMs: NOW - 1 * DAY_MS,
        programName: 'Hornets',
        drillTitle: 'closeout drill',
      },
    ];
    const result = buildViralSocialProof({ events, nowMs: NOW });
    // No "<First> <Last>" sequence anywhere.
    expect(result!.line).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+/);
  });

  it('is deterministic across input order', () => {
    const events1: ViralProofEvent[] = [
      {
        kind: 'drill_clone',
        occurredAtMs: NOW - 1 * DAY_MS,
        programName: 'Hornets',
        drillTitle: 'closeout drill',
      },
      {
        kind: 'reputation_milestone',
        occurredAtMs: NOW - 3 * DAY_MS,
        programCount: 4,
      },
    ];
    const events2: ViralProofEvent[] = [...events1].reverse();
    const a = buildViralSocialProof({ events: events1, nowMs: NOW });
    const b = buildViralSocialProof({ events: events2, nowMs: NOW });
    expect(a).toEqual(b);
  });

  it('caps every rendered line at 140 characters', () => {
    const events: ViralProofEvent[] = [
      {
        kind: 'drill_clone',
        occurredAtMs: NOW - 1 * DAY_MS,
        programName: 'Wisconsin Youth Basketball Association U10 Travel Hornets',
        drillTitle:
          'a very long closeout drill that goes on for far too many words to fit a single mobile line',
      },
    ];
    const result = buildViralSocialProof({ events, nowMs: NOW });
    expect(result).not.toBeNull();
    expect(result!.line.length).toBeLessThanOrEqual(140);
  });
});
