import { describe, it, expect } from 'vitest';
import {
  buildDrillAnnouncement,
  buildBreakAnnouncement,
  buildPracticeCompleteAnnouncement,
  buildNextDrillHint,
} from '@/lib/announcer-utils';

describe('buildDrillAnnouncement', () => {
  it('includes drill name and duration in minutes', () => {
    const text = buildDrillAnnouncement('Figure 8 Dribble', 600);
    expect(text).toContain('Figure 8 Dribble');
    expect(text).toContain('10 minutes');
  });

  it('uses singular "1 minute" for exactly 60 seconds', () => {
    const text = buildDrillAnnouncement('Warmup', 60);
    expect(text).toContain('1 minute');
    expect(text).not.toMatch(/\d+ minutes/);
  });

  it('rounds 90 seconds to 2 minutes', () => {
    const text = buildDrillAnnouncement('Sprint Drill', 90);
    expect(text).toContain('2 minutes');
  });

  it('rounds 30 seconds to 1 minute', () => {
    const text = buildDrillAnnouncement('Quick Break', 30);
    expect(text).toContain('1 minute');
  });

  it('appends first coaching cue when provided', () => {
    const text = buildDrillAnnouncement('Defensive Slides', 480, 'Keep your hips low.');
    expect(text).toContain('Keep your hips low.');
  });

  it('omits cue when firstCue is undefined', () => {
    const text = buildDrillAnnouncement('Custom Drill', 300, undefined);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
  });

  it('omits cue when firstCue is empty string', () => {
    const text = buildDrillAnnouncement('Custom Drill', 300, '');
    // should not produce double-period like "5 minutes.."
    expect(text).not.toMatch(/\.\./);
  });

  it('handles drill names with special characters', () => {
    const text = buildDrillAnnouncement('3-on-2 Fast Break', 720);
    expect(text).toContain('3-on-2 Fast Break');
    expect(text).toContain('12 minutes');
  });
});

describe('buildBreakAnnouncement', () => {
  it('mentions observation', () => {
    expect(buildBreakAnnouncement()).toContain('observation');
  });

  it('is deterministic', () => {
    expect(buildBreakAnnouncement()).toBe(buildBreakAnnouncement());
  });

  it('is a non-empty string', () => {
    expect(buildBreakAnnouncement().length).toBeGreaterThan(0);
  });
});

describe('buildPracticeCompleteAnnouncement', () => {
  it('handles zero observations without mentioning count', () => {
    const text = buildPracticeCompleteAnnouncement(0);
    expect(text).toContain('Practice complete');
    expect(text).not.toMatch(/\d+ observation/);
  });

  it('uses singular for 1 observation', () => {
    const text = buildPracticeCompleteAnnouncement(1);
    expect(text).toContain('1 observation');
    expect(text).not.toContain('observations');
  });

  it('uses plural for multiple observations', () => {
    const text = buildPracticeCompleteAnnouncement(7);
    expect(text).toContain('7 observations');
  });

  it('always contains an encouraging closing', () => {
    for (const n of [0, 1, 5, 20]) {
      expect(buildPracticeCompleteAnnouncement(n)).toContain('Great work');
    }
  });
});

describe('buildNextDrillHint', () => {
  it('returns empty string when called with no argument', () => {
    expect(buildNextDrillHint()).toBe('');
  });

  it('returns empty string when called with undefined', () => {
    expect(buildNextDrillHint(undefined)).toBe('');
  });

  it('includes next drill name', () => {
    const text = buildNextDrillHint('Free Throws');
    expect(text).toContain('Free Throws');
  });

  it('returns a non-empty string for a valid drill name', () => {
    expect(buildNextDrillHint('Layup Lines').length).toBeGreaterThan(0);
  });
});
