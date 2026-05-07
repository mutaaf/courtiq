import { describe, it, expect } from 'vitest';
import { formatElapsed, getElapsedMinutes, shouldShowWrapUpNudge, shouldShowCaptureNudge } from '@/lib/elapsed-time-utils';

const now = new Date('2026-05-05T15:00:00Z').getTime();

function agoMs(minutes: number) {
  return new Date(now - minutes * 60_000).toISOString();
}

describe('getElapsedMinutes', () => {
  it('returns 0 for null', () => {
    expect(getElapsedMinutes(null, now)).toBe(0);
  });

  it('returns 0 for future start time (rounds to 0, not negative)', () => {
    const future = new Date(now + 60_000).toISOString();
    expect(getElapsedMinutes(future, now)).toBe(0);
  });

  it('returns correct minutes', () => {
    expect(getElapsedMinutes(agoMs(5), now)).toBe(5);
    expect(getElapsedMinutes(agoMs(38), now)).toBe(38);
    expect(getElapsedMinutes(agoMs(60), now)).toBe(60);
    expect(getElapsedMinutes(agoMs(90), now)).toBe(90);
  });

  it('floors partial minutes', () => {
    const halfMinuteAgo = new Date(now - 90_000).toISOString(); // 1 min 30 sec → 1
    expect(getElapsedMinutes(halfMinuteAgo, now)).toBe(1);
  });
});

describe('formatElapsed', () => {
  it('returns null for null input', () => {
    expect(formatElapsed(null, now)).toBeNull();
  });

  it('returns "0 min" for practice just started', () => {
    expect(formatElapsed(agoMs(0), now)).toBe('0 min');
  });

  it('formats minutes under an hour', () => {
    expect(formatElapsed(agoMs(5), now)).toBe('5 min');
    expect(formatElapsed(agoMs(38), now)).toBe('38 min');
    expect(formatElapsed(agoMs(59), now)).toBe('59 min');
  });

  it('formats exactly one hour', () => {
    expect(formatElapsed(agoMs(60), now)).toBe('1h');
  });

  it('formats hours and minutes', () => {
    expect(formatElapsed(agoMs(61), now)).toBe('1h 1m');
    expect(formatElapsed(agoMs(72), now)).toBe('1h 12m');
    expect(formatElapsed(agoMs(90), now)).toBe('1h 30m');
    expect(formatElapsed(agoMs(120), now)).toBe('2h');
    expect(formatElapsed(agoMs(135), now)).toBe('2h 15m');
  });
});

describe('shouldShowWrapUpNudge', () => {
  it('returns false for null', () => {
    expect(shouldShowWrapUpNudge(null, 40, now)).toBe(false);
  });

  it('returns false before threshold', () => {
    expect(shouldShowWrapUpNudge(agoMs(39), 40, now)).toBe(false);
  });

  it('returns true at exactly the threshold', () => {
    expect(shouldShowWrapUpNudge(agoMs(40), 40, now)).toBe(true);
  });

  it('returns true past threshold', () => {
    expect(shouldShowWrapUpNudge(agoMs(55), 40, now)).toBe(true);
    expect(shouldShowWrapUpNudge(agoMs(90), 40, now)).toBe(true);
  });

  it('respects custom threshold', () => {
    expect(shouldShowWrapUpNudge(agoMs(29), 30, now)).toBe(false);
    expect(shouldShowWrapUpNudge(agoMs(30), 30, now)).toBe(true);
  });
});

describe('shouldShowCaptureNudge', () => {
  it('returns false for null start', () => {
    expect(shouldShowCaptureNudge(null, 0, 15, now)).toBe(false);
  });

  it('returns false when observations already exist', () => {
    expect(shouldShowCaptureNudge(agoMs(20), 1, 15, now)).toBe(false);
    expect(shouldShowCaptureNudge(agoMs(20), 5, 15, now)).toBe(false);
  });

  it('returns false before threshold even with no observations', () => {
    expect(shouldShowCaptureNudge(agoMs(14), 0, 15, now)).toBe(false);
    expect(shouldShowCaptureNudge(agoMs(0), 0, 15, now)).toBe(false);
  });

  it('returns true at exactly the threshold with no observations', () => {
    expect(shouldShowCaptureNudge(agoMs(15), 0, 15, now)).toBe(true);
  });

  it('returns true past threshold with no observations', () => {
    expect(shouldShowCaptureNudge(agoMs(25), 0, 15, now)).toBe(true);
    expect(shouldShowCaptureNudge(agoMs(45), 0, 15, now)).toBe(true);
  });

  it('respects custom threshold', () => {
    expect(shouldShowCaptureNudge(agoMs(9), 0, 10, now)).toBe(false);
    expect(shouldShowCaptureNudge(agoMs(10), 0, 10, now)).toBe(true);
  });

  it('returns false once obs count becomes positive, even past threshold', () => {
    expect(shouldShowCaptureNudge(agoMs(30), 0, 15, now)).toBe(true);
    expect(shouldShowCaptureNudge(agoMs(30), 1, 15, now)).toBe(false);
  });
});
