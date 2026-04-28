import { describe, it, expect } from 'vitest';
import {
  isValidSessionCount,
  isValidSessionDuration,
  hasEnoughDataForArc,
  isValidArcTitle,
  isValidArcSession,
  hasGameDayTip,
  countTotalDrills,
  getTotalArcMinutes,
  getSessionDrillCount,
  getSessionTotalDrillMinutes,
  getSessionLabel,
  getProgressionLabel,
  formatArcDuration,
  formatSessionDuration,
  getSessionAccentColor,
  getSessionBorderColor,
  getSessionBgColor,
  extractPrimaryFocusFromNeedsWork,
  buildArcTitle,
  buildArcShareText,
  isLastSession,
  countSessionsWithCarriesForward,
  getPrimaryFocusLabel,
} from '@/lib/practice-arc-utils';
import type { PracticeArc } from '@/lib/ai/schemas';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDrill(overrides: Partial<{
  name: string;
  duration_minutes: number;
  description: string;
  coaching_cues: string[];
  progression_note: string;
}> = {}) {
  return {
    name: 'Figure-8 Dribble',
    duration_minutes: 10,
    description: 'Players dribble around cones in a figure-8 pattern.',
    coaching_cues: ['Eyes up', 'Low dribble'],
    ...overrides,
  };
}

function makeSession(overrides: Partial<{
  session_number: number;
  title: string;
  theme: string;
  duration_minutes: number;
  session_goal: string;
  warmup: { name: string; duration_minutes: number; description: string };
  drills: ReturnType<typeof makeDrill>[];
  cooldown: { duration_minutes: number; notes: string };
  key_coaching_point: string;
  carries_forward: string;
}> = {}) {
  return {
    session_number: 1,
    title: 'Defense Foundations',
    theme: 'Defensive Stance & Footwork',
    duration_minutes: 60,
    session_goal: 'Introduce proper defensive positioning and footwork fundamentals.',
    warmup: { name: 'Defensive Slides', duration_minutes: 5, description: 'Side-to-side defensive slides' },
    drills: [makeDrill(), makeDrill({ name: 'Closeout Drill', duration_minutes: 12 })],
    cooldown: { duration_minutes: 5, notes: 'Stretch and review key concepts' },
    key_coaching_point: 'Stay low, stay wide, move your feet!',
    carries_forward: 'Defensive stance fundamentals for zone coverage',
    ...overrides,
  };
}

function makeArc(overrides: Partial<PracticeArc> = {}): PracticeArc {
  return {
    arc_title: 'Defense & Passing — 2-Practice Arc',
    arc_goal: 'Build team defensive fundamentals and sharp passing over two connected practices.',
    primary_focus: ['Defense', 'Passing'],
    total_sessions: 2,
    sessions: [
      makeSession({ session_number: 1 }),
      makeSession({ session_number: 2, title: 'Defense Application', theme: 'Team Defense', carries_forward: undefined }),
    ],
    progression_note: 'Session 1 introduces individual defense. Session 2 applies it in team settings.',
    ...overrides,
  };
}

// ── isValidSessionCount ───────────────────────────────────────────────────────

describe('isValidSessionCount', () => {
  it('accepts 2', () => expect(isValidSessionCount(2)).toBe(true));
  it('accepts 3', () => expect(isValidSessionCount(3)).toBe(true));
  it('rejects 1', () => expect(isValidSessionCount(1)).toBe(false));
  it('rejects 4', () => expect(isValidSessionCount(4)).toBe(false));
  it('rejects string "2"', () => expect(isValidSessionCount('2')).toBe(false));
  it('rejects null', () => expect(isValidSessionCount(null)).toBe(false));
});

// ── isValidSessionDuration ────────────────────────────────────────────────────

describe('isValidSessionDuration', () => {
  it.each([30, 45, 60, 75, 90])('accepts %i min', (m) => {
    expect(isValidSessionDuration(m)).toBe(true);
  });
  it('rejects 20', () => expect(isValidSessionDuration(20)).toBe(false));
  it('rejects 0', () => expect(isValidSessionDuration(0)).toBe(false));
  it('rejects string', () => expect(isValidSessionDuration('60')).toBe(false));
});

// ── hasEnoughDataForArc ───────────────────────────────────────────────────────

describe('hasEnoughDataForArc', () => {
  it('returns true when >= 5 obs', () => expect(hasEnoughDataForArc(5)).toBe(true));
  it('returns true when >> 5 obs', () => expect(hasEnoughDataForArc(100)).toBe(true));
  it('returns false when < 5 obs', () => expect(hasEnoughDataForArc(4)).toBe(false));
  it('returns false when 0 obs', () => expect(hasEnoughDataForArc(0)).toBe(false));
});

// ── isValidArcTitle ───────────────────────────────────────────────────────────

describe('isValidArcTitle', () => {
  it('accepts valid title', () => expect(isValidArcTitle('Defense Arc')).toBe(true));
  it('rejects empty string', () => expect(isValidArcTitle('')).toBe(false));
  it('rejects too short', () => expect(isValidArcTitle('Hi')).toBe(false));
  it('rejects non-string', () => expect(isValidArcTitle(42)).toBe(false));
  it('rejects title over 100 chars', () => expect(isValidArcTitle('A'.repeat(101))).toBe(false));
  it('accepts exactly 100 chars', () => expect(isValidArcTitle('A'.repeat(100))).toBe(true));
});

// ── isValidArcSession ─────────────────────────────────────────────────────────

describe('isValidArcSession', () => {
  it('accepts valid session', () => expect(isValidArcSession(makeSession())).toBe(true));
  it('rejects null', () => expect(isValidArcSession(null)).toBe(false));
  it('rejects missing drills', () => {
    const s = { ...makeSession(), drills: [] };
    expect(isValidArcSession(s)).toBe(false);
  });
  it('rejects single drill', () => {
    const s = { ...makeSession(), drills: [makeDrill()] };
    expect(isValidArcSession(s)).toBe(false);
  });
  it('accepts two drills', () => {
    const s = { ...makeSession(), drills: [makeDrill(), makeDrill()] };
    expect(isValidArcSession(s)).toBe(true);
  });
});

// ── hasGameDayTip ─────────────────────────────────────────────────────────────

describe('hasGameDayTip', () => {
  it('returns true when tip present', () => {
    const arc = makeArc({ game_day_tip: 'Stay calm in the first quarter' });
    expect(hasGameDayTip(arc)).toBe(true);
  });
  it('returns false when tip absent', () => {
    const arc = makeArc({ game_day_tip: undefined });
    expect(hasGameDayTip(arc)).toBe(false);
  });
  it('returns false for short string', () => {
    const arc = makeArc({ game_day_tip: 'Win' });
    expect(hasGameDayTip(arc)).toBe(false);
  });
});

// ── countTotalDrills ──────────────────────────────────────────────────────────

describe('countTotalDrills', () => {
  it('counts all drills across sessions', () => {
    const arc = makeArc();
    expect(countTotalDrills(arc)).toBe(4); // 2 sessions × 2 drills
  });
  it('returns 0 for empty sessions', () => {
    const arc = makeArc({ sessions: [] as any });
    expect(countTotalDrills(arc)).toBe(0);
  });
});

// ── getTotalArcMinutes ────────────────────────────────────────────────────────

describe('getTotalArcMinutes', () => {
  it('sums session durations', () => {
    const arc = makeArc();
    expect(getTotalArcMinutes(arc)).toBe(120); // 2 × 60
  });
  it('returns 0 for empty', () => {
    expect(getTotalArcMinutes(makeArc({ sessions: [] as any }))).toBe(0);
  });
});

// ── getSessionDrillCount ──────────────────────────────────────────────────────

describe('getSessionDrillCount', () => {
  it('returns drill count', () => expect(getSessionDrillCount(makeSession())).toBe(2));
  it('returns 0 for empty drills', () => {
    expect(getSessionDrillCount(makeSession({ drills: [] }))).toBe(0);
  });
});

// ── getSessionTotalDrillMinutes ───────────────────────────────────────────────

describe('getSessionTotalDrillMinutes', () => {
  it('sums warmup + drills + cooldown', () => {
    // warmup=5, drills=10+12=22, cooldown=5 → 32
    const session = makeSession();
    expect(getSessionTotalDrillMinutes(session)).toBe(32);
  });
});

// ── getSessionLabel ───────────────────────────────────────────────────────────

describe('getSessionLabel', () => {
  it('returns "Practice 1"', () => expect(getSessionLabel(1)).toBe('Practice 1'));
  it('returns "Practice 3"', () => expect(getSessionLabel(3)).toBe('Practice 3'));
});

// ── getProgressionLabel ───────────────────────────────────────────────────────

describe('getProgressionLabel', () => {
  it('2-session arc: session 1 = Fundamentals', () => {
    expect(getProgressionLabel(1, 2)).toBe('Fundamentals');
  });
  it('2-session arc: session 2 = Application', () => {
    expect(getProgressionLabel(2, 2)).toBe('Application');
  });
  it('3-session arc: session 1 = Introduce', () => {
    expect(getProgressionLabel(1, 3)).toBe('Introduce');
  });
  it('3-session arc: session 2 = Develop', () => {
    expect(getProgressionLabel(2, 3)).toBe('Develop');
  });
  it('3-session arc: session 3 = Apply', () => {
    expect(getProgressionLabel(3, 3)).toBe('Apply');
  });
});

// ── formatArcDuration ─────────────────────────────────────────────────────────

describe('formatArcDuration', () => {
  it('formats minutes only', () => expect(formatArcDuration(45)).toBe('45m total'));
  it('formats whole hours', () => expect(formatArcDuration(120)).toBe('2h total'));
  it('formats mixed hours and minutes', () => expect(formatArcDuration(90)).toBe('1h 30m total'));
});

// ── formatSessionDuration ─────────────────────────────────────────────────────

describe('formatSessionDuration', () => {
  it('formats minutes < 60', () => expect(formatSessionDuration(45)).toBe('45 min'));
  it('formats whole hour', () => expect(formatSessionDuration(60)).toBe('1h'));
  it('formats 1h 30m', () => expect(formatSessionDuration(90)).toBe('1h 30m'));
});

// ── getSessionAccentColor ─────────────────────────────────────────────────────

describe('getSessionAccentColor', () => {
  it('session 1 → sky', () => expect(getSessionAccentColor(1)).toContain('sky'));
  it('session 2 → violet', () => expect(getSessionAccentColor(2)).toContain('violet'));
  it('session 3 → emerald', () => expect(getSessionAccentColor(3)).toContain('emerald'));
  it('unknown session → orange fallback', () => expect(getSessionAccentColor(99)).toContain('orange'));
});

// ── getSessionBorderColor / getSessionBgColor ─────────────────────────────────

describe('getSessionBorderColor', () => {
  it('returns sky border for session 1', () => expect(getSessionBorderColor(1)).toContain('sky'));
  it('returns violet border for session 2', () => expect(getSessionBorderColor(2)).toContain('violet'));
});

describe('getSessionBgColor', () => {
  it('returns sky bg for session 1', () => expect(getSessionBgColor(1)).toContain('sky'));
  it('returns emerald bg for session 3', () => expect(getSessionBgColor(3)).toContain('emerald'));
});

// ── extractPrimaryFocusFromNeedsWork ──────────────────────────────────────────

describe('extractPrimaryFocusFromNeedsWork', () => {
  it('takes top 2', () => {
    expect(extractPrimaryFocusFromNeedsWork(['Defense', 'Passing', 'Dribbling'])).toEqual(['Defense', 'Passing']);
  });
  it('handles fewer than 2', () => {
    expect(extractPrimaryFocusFromNeedsWork(['Defense'])).toEqual(['Defense']);
  });
  it('returns empty for empty input', () => {
    expect(extractPrimaryFocusFromNeedsWork([])).toEqual([]);
  });
});

// ── buildArcTitle ─────────────────────────────────────────────────────────────

describe('buildArcTitle', () => {
  it('uses upcoming event', () => {
    expect(buildArcTitle(3, 'Tournament Saturday', ['Defense'])).toContain('Tournament Saturday');
  });
  it('uses focus when no event', () => {
    const title = buildArcTitle(2, undefined, ['Defense', 'Passing']);
    expect(title).toContain('Defense & Passing');
    expect(title).toContain('2-Practice Arc');
  });
  it('uses generic focus when no data', () => {
    expect(buildArcTitle(2, undefined, [])).toContain('Team Development');
  });
  it('3-session arc with event', () => {
    const title = buildArcTitle(3, 'State Finals', ['Shooting']);
    expect(title).toContain('3-Practice Arc');
  });
});

// ── buildArcShareText ─────────────────────────────────────────────────────────

describe('buildArcShareText', () => {
  it('includes arc title', () => {
    const text = buildArcShareText(makeArc());
    expect(text).toContain('Defense & Passing — 2-Practice Arc');
  });
  it('includes session themes', () => {
    const text = buildArcShareText(makeArc());
    expect(text).toContain('Practice 1');
    expect(text).toContain('Practice 2');
  });
  it('includes game day tip when present', () => {
    const arc = makeArc({ game_day_tip: 'Stay calm in the first quarter' });
    expect(buildArcShareText(arc)).toContain('Stay calm');
  });
  it('omits game day tip section when absent', () => {
    const text = buildArcShareText(makeArc({ game_day_tip: undefined }));
    expect(text).not.toContain('Game day tip');
  });
});

// ── isLastSession ─────────────────────────────────────────────────────────────

describe('isLastSession', () => {
  it('returns true for session 2 of 2', () => expect(isLastSession(2, 2)).toBe(true));
  it('returns false for session 1 of 2', () => expect(isLastSession(1, 2)).toBe(false));
  it('returns true for session 3 of 3', () => expect(isLastSession(3, 3)).toBe(true));
  it('returns false for session 2 of 3', () => expect(isLastSession(2, 3)).toBe(false));
});

// ── countSessionsWithCarriesForward ───────────────────────────────────────────

describe('countSessionsWithCarriesForward', () => {
  it('counts sessions that have carries_forward', () => {
    const arc = makeArc();
    expect(countSessionsWithCarriesForward(arc)).toBe(1); // only session 1
  });
  it('returns 0 when none have carries_forward', () => {
    const arc = makeArc({
      sessions: [
        makeSession({ session_number: 1, carries_forward: undefined }),
        makeSession({ session_number: 2, carries_forward: undefined }),
      ],
    });
    expect(countSessionsWithCarriesForward(arc)).toBe(0);
  });
});

// ── getPrimaryFocusLabel ──────────────────────────────────────────────────────

describe('getPrimaryFocusLabel', () => {
  it('joins with ·', () => {
    expect(getPrimaryFocusLabel(makeArc())).toBe('Defense · Passing');
  });
  it('handles single focus', () => {
    const arc = makeArc({ primary_focus: ['Defense'] });
    expect(getPrimaryFocusLabel(arc)).toBe('Defense');
  });
});
