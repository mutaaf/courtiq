/**
 * Unit tests for the first-artifact activation-nudge eligibility helper
 * (ticket docs/backlog/0030).
 *
 * Vitest file is `.test.ts` NOT `.spec.ts` — `vitest.config.ts` excludes the
 * Playwright spec glob, so a `.spec.ts` under tests/ would silently never run
 * (LESSONS.md 2026-05-20).
 *
 * Covers:
 *  - the observation threshold boundary (below / at / above THRESHOLD)
 *  - the already-generated short-circuit (any artifact => never show)
 *  - the CTA destination is an EXISTING in-app route (no new AI route)
 */
import { describe, it, expect } from 'vitest';
import {
  FIRST_ARTIFACT_OBS_THRESHOLD,
  FIRST_ARTIFACT_CTA_HREF,
  shouldShowFirstArtifactNudge,
} from '@/lib/first-artifact-utils';

describe('FIRST_ARTIFACT_OBS_THRESHOLD', () => {
  it('is a small positive constant (the "enough notes" bar)', () => {
    expect(typeof FIRST_ARTIFACT_OBS_THRESHOLD).toBe('number');
    expect(FIRST_ARTIFACT_OBS_THRESHOLD).toBeGreaterThan(0);
    expect(FIRST_ARTIFACT_OBS_THRESHOLD).toBeLessThanOrEqual(5);
  });
});

describe('shouldShowFirstArtifactNudge — threshold boundary', () => {
  it('is false below the threshold (no artifacts)', () => {
    expect(
      shouldShowFirstArtifactNudge({
        observations: FIRST_ARTIFACT_OBS_THRESHOLD - 1,
        artifactsGenerated: 0,
      }),
    ).toBe(false);
  });

  it('is true exactly at the threshold (no artifacts)', () => {
    expect(
      shouldShowFirstArtifactNudge({
        observations: FIRST_ARTIFACT_OBS_THRESHOLD,
        artifactsGenerated: 0,
      }),
    ).toBe(true);
  });

  it('is true above the threshold (no artifacts)', () => {
    expect(
      shouldShowFirstArtifactNudge({
        observations: FIRST_ARTIFACT_OBS_THRESHOLD + 10,
        artifactsGenerated: 0,
      }),
    ).toBe(true);
  });

  it('is false with zero observations', () => {
    expect(
      shouldShowFirstArtifactNudge({ observations: 0, artifactsGenerated: 0 }),
    ).toBe(false);
  });
});

describe('shouldShowFirstArtifactNudge — already-generated short-circuit', () => {
  it('is false once the coach has any artifact, even well above threshold', () => {
    expect(
      shouldShowFirstArtifactNudge({
        observations: FIRST_ARTIFACT_OBS_THRESHOLD + 50,
        artifactsGenerated: 1,
      }),
    ).toBe(false);
  });

  it('is false with many artifacts', () => {
    expect(
      shouldShowFirstArtifactNudge({
        observations: FIRST_ARTIFACT_OBS_THRESHOLD,
        artifactsGenerated: 12,
      }),
    ).toBe(false);
  });

  it('is false even when both observations are below threshold and an artifact exists', () => {
    expect(
      shouldShowFirstArtifactNudge({ observations: 1, artifactsGenerated: 3 }),
    ).toBe(false);
  });
});

describe('shouldShowFirstArtifactNudge — defensive inputs', () => {
  it('treats negative/NaN observations as not-eligible', () => {
    expect(
      shouldShowFirstArtifactNudge({ observations: -5, artifactsGenerated: 0 }),
    ).toBe(false);
    expect(
      shouldShowFirstArtifactNudge({ observations: NaN, artifactsGenerated: 0 }),
    ).toBe(false);
  });

  it('treats a negative artifact count as "no artifacts yet" (still eligible at threshold)', () => {
    expect(
      shouldShowFirstArtifactNudge({
        observations: FIRST_ARTIFACT_OBS_THRESHOLD,
        artifactsGenerated: -1,
      }),
    ).toBe(true);
  });
});

describe('FIRST_ARTIFACT_CTA_HREF', () => {
  it('points at an EXISTING in-app generator route, not a new /api/ai/* route', () => {
    expect(FIRST_ARTIFACT_CTA_HREF.startsWith('/')).toBe(true);
    expect(FIRST_ARTIFACT_CTA_HREF.startsWith('/api/')).toBe(false);
    // The artifact-generation surface already in the app.
    expect(FIRST_ARTIFACT_CTA_HREF).toBe('/plans');
  });
});
