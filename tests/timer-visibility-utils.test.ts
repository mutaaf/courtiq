import { describe, it, expect } from 'vitest';
import {
  computeBackgroundAdjustment,
  shouldApplyAdjustment,
  shouldShowAdjustmentToast,
  formatAdjustmentLabel,
  buildAdjustmentMessage,
  clampTimeLeft,
  computeRemainingAfterBackground,
  isBackgroundDurationSignificant,
  formatTimeLeftDisplay,
} from '@/lib/timer-visibility-utils';

describe('computeBackgroundAdjustment', () => {
  it('subtracts elapsed seconds from timeLeft', () => {
    const result = computeBackgroundAdjustment(60, 1000, 11000);
    expect(result.newTimeLeft).toBe(50);
    expect(result.elapsedSecs).toBe(10);
    expect(result.didExpire).toBe(false);
  });

  it('floors elapsed ms to whole seconds', () => {
    // 9500ms elapsed → 9 seconds
    const result = computeBackgroundAdjustment(60, 0, 9500);
    expect(result.elapsedSecs).toBe(9);
    expect(result.newTimeLeft).toBe(51);
  });

  it('sets didExpire=true when timeLeft reaches zero', () => {
    const result = computeBackgroundAdjustment(5, 0, 10000);
    expect(result.newTimeLeft).toBe(0);
    expect(result.didExpire).toBe(true);
  });

  it('clamps newTimeLeft to zero, never negative', () => {
    const result = computeBackgroundAdjustment(3, 0, 60000);
    expect(result.newTimeLeft).toBe(0);
    expect(result.elapsedSecs).toBe(60);
  });

  it('returns zero elapsed when now equals hiddenAt', () => {
    const result = computeBackgroundAdjustment(30, 5000, 5000);
    expect(result.elapsedSecs).toBe(0);
    expect(result.newTimeLeft).toBe(30);
    expect(result.didExpire).toBe(false);
  });

  it('handles nowMs less than hiddenAtMs (clock skew) gracefully', () => {
    const result = computeBackgroundAdjustment(30, 5000, 4000);
    expect(result.elapsedSecs).toBe(0);
    expect(result.newTimeLeft).toBe(30);
  });

  it('works with large elapsed times (long background)', () => {
    // 30 min background on a 10-min drill
    const result = computeBackgroundAdjustment(600, 0, 30 * 60 * 1000);
    expect(result.newTimeLeft).toBe(0);
    expect(result.didExpire).toBe(true);
  });

  it('handles exact expiry (elapsed === timeLeft)', () => {
    const result = computeBackgroundAdjustment(30, 0, 30000);
    expect(result.newTimeLeft).toBe(0);
    expect(result.didExpire).toBe(true);
  });
});

describe('shouldApplyAdjustment', () => {
  it('returns false for 0 seconds elapsed', () => {
    expect(shouldApplyAdjustment(0)).toBe(false);
  });

  it('returns true for 1 second elapsed', () => {
    expect(shouldApplyAdjustment(1)).toBe(true);
  });

  it('returns true for large elapsed times', () => {
    expect(shouldApplyAdjustment(300)).toBe(true);
  });
});

describe('shouldShowAdjustmentToast', () => {
  it('returns false for fewer than 10 seconds', () => {
    expect(shouldShowAdjustmentToast(9)).toBe(false);
  });

  it('returns true at exactly 10 seconds', () => {
    expect(shouldShowAdjustmentToast(10)).toBe(true);
  });

  it('returns true for more than 10 seconds', () => {
    expect(shouldShowAdjustmentToast(60)).toBe(true);
  });
});

describe('formatAdjustmentLabel', () => {
  it('formats pure seconds', () => {
    expect(formatAdjustmentLabel(45)).toBe('45s');
  });

  it('formats pure minutes (no remainder)', () => {
    expect(formatAdjustmentLabel(120)).toBe('2m');
  });

  it('formats minutes and seconds', () => {
    expect(formatAdjustmentLabel(90)).toBe('1m 30s');
  });

  it('formats 1 minute exactly', () => {
    expect(formatAdjustmentLabel(60)).toBe('1m');
  });

  it('formats 1 second', () => {
    expect(formatAdjustmentLabel(1)).toBe('1s');
  });

  it('formats 0 seconds', () => {
    expect(formatAdjustmentLabel(0)).toBe('0s');
  });

  it('formats large values', () => {
    expect(formatAdjustmentLabel(3661)).toBe('61m 1s');
  });
});

describe('buildAdjustmentMessage', () => {
  it('wraps formatAdjustmentLabel with standard prefix', () => {
    expect(buildAdjustmentMessage(30)).toBe('Timer adjusted 30s for background');
  });

  it('works for minute-level adjustments', () => {
    expect(buildAdjustmentMessage(90)).toBe('Timer adjusted 1m 30s for background');
  });
});

describe('clampTimeLeft', () => {
  it('rounds to nearest integer', () => {
    expect(clampTimeLeft(5.7)).toBe(6);
    expect(clampTimeLeft(5.3)).toBe(5);
  });

  it('clamps negative to 0', () => {
    expect(clampTimeLeft(-10)).toBe(0);
  });

  it('passes through 0', () => {
    expect(clampTimeLeft(0)).toBe(0);
  });

  it('passes through positive integers unchanged', () => {
    expect(clampTimeLeft(60)).toBe(60);
  });
});

describe('computeRemainingAfterBackground', () => {
  it('subtracts background duration in seconds from timeLeft', () => {
    expect(computeRemainingAfterBackground(60, 10000)).toBe(50);
  });

  it('clamps to zero for long backgrounds', () => {
    expect(computeRemainingAfterBackground(10, 60000)).toBe(0);
  });

  it('floors sub-second backgrounds to zero elapsed seconds', () => {
    expect(computeRemainingAfterBackground(60, 500)).toBe(60);
  });

  it('handles zero background duration', () => {
    expect(computeRemainingAfterBackground(60, 0)).toBe(60);
  });
});

describe('isBackgroundDurationSignificant', () => {
  it('returns false for less than 1000ms', () => {
    expect(isBackgroundDurationSignificant(999)).toBe(false);
  });

  it('returns true at exactly 1000ms', () => {
    expect(isBackgroundDurationSignificant(1000)).toBe(true);
  });

  it('returns true for large durations', () => {
    expect(isBackgroundDurationSignificant(60000)).toBe(true);
  });

  it('returns false for zero', () => {
    expect(isBackgroundDurationSignificant(0)).toBe(false);
  });
});

describe('formatTimeLeftDisplay', () => {
  it('formats zero as 0:00', () => {
    expect(formatTimeLeftDisplay(0)).toBe('0:00');
  });

  it('formats 60 seconds as 1:00', () => {
    expect(formatTimeLeftDisplay(60)).toBe('1:00');
  });

  it('formats 90 seconds as 1:30', () => {
    expect(formatTimeLeftDisplay(90)).toBe('1:30');
  });

  it('formats 9 seconds as 0:09 (zero-padded)', () => {
    expect(formatTimeLeftDisplay(9)).toBe('0:09');
  });

  it('formats 10 minutes correctly', () => {
    expect(formatTimeLeftDisplay(600)).toBe('10:00');
  });

  it('formats 5 minutes and 5 seconds', () => {
    expect(formatTimeLeftDisplay(305)).toBe('5:05');
  });
});
