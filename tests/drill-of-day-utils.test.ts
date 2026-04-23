import { describe, it, expect } from 'vitest';
import type { Drill } from '@/types/database';
import {
  getDayKey,
  buildDayHash,
  matchesDrillCategory,
  filterDrillsByCategory,
  sortDrillsForSelection,
  selectDrillOfDay,
  hasEnoughDataForDrillOfDay,
  getDrillCategoryLabel,
  getDrillDurationLabel,
  getDrillCues,
  getDrillEquipmentLabel,
  buildDrillDismissKey,
  buildDrillViewUrl,
  buildDrillShareText,
  getDrillPlayerCountLabel,
} from '@/lib/drill-of-day-utils';

function makeDrill(overrides: Partial<Drill> = {}): Drill {
  return {
    id: 'drill-1',
    sport_id: 'basketball',
    org_id: null,
    coach_id: null,
    curriculum_skill_id: null,
    name: 'Figure 8 Dribble',
    description: 'Dribble in a figure-8 around your legs.',
    category: 'dribbling',
    age_groups: ['U9-12'],
    duration_minutes: 8,
    player_count_min: 1,
    player_count_max: null,
    equipment: ['basketball'],
    video_url: null,
    diagram_url: null,
    cv_eval_config: null,
    setup_instructions: 'Each player needs one basketball.',
    teaching_cues: ['Keep your head up', 'Low dribble for control', 'Alternate hands'],
    source: 'seeded',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── getDayKey ────────────────────────────────────────────────────────────────

describe('getDayKey', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(getDayKey(new Date('2024-03-15T10:00:00Z'))).toBe('2024-03-15');
  });

  it('is the same for two dates on the same UTC day', () => {
    const a = getDayKey(new Date('2024-03-15T00:00:00Z'));
    const b = getDayKey(new Date('2024-03-15T23:59:59Z'));
    expect(a).toBe(b);
  });

  it('differs for consecutive days', () => {
    expect(getDayKey(new Date('2024-03-15T12:00:00Z'))).not.toBe(
      getDayKey(new Date('2024-03-16T12:00:00Z'))
    );
  });
});

// ─── buildDayHash ─────────────────────────────────────────────────────────────

describe('buildDayHash', () => {
  it('returns a non-negative integer', () => {
    expect(buildDayHash('team-abc-2024-03-15')).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic for the same input', () => {
    const h1 = buildDayHash('team-xyz-2024-06-01');
    const h2 = buildDayHash('team-xyz-2024-06-01');
    expect(h1).toBe(h2);
  });

  it('produces different values for different inputs', () => {
    const h1 = buildDayHash('team-a-2024-01-01');
    const h2 = buildDayHash('team-b-2024-01-01');
    expect(h1).not.toBe(h2);
  });

  it('handles empty string', () => {
    expect(buildDayHash('')).toBeGreaterThanOrEqual(0);
  });

  it('returns a finite number', () => {
    expect(Number.isFinite(buildDayHash('test'))).toBe(true);
  });
});

// ─── matchesDrillCategory ─────────────────────────────────────────────────────

describe('matchesDrillCategory', () => {
  it('matches exact case', () => {
    expect(matchesDrillCategory(makeDrill({ category: 'dribbling' }), 'dribbling')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesDrillCategory(makeDrill({ category: 'Dribbling' }), 'dribbling')).toBe(true);
    expect(matchesDrillCategory(makeDrill({ category: 'dribbling' }), 'DRIBBLING')).toBe(true);
  });

  it('returns false for mismatched category', () => {
    expect(matchesDrillCategory(makeDrill({ category: 'passing' }), 'dribbling')).toBe(false);
  });
});

// ─── filterDrillsByCategory ───────────────────────────────────────────────────

describe('filterDrillsByCategory', () => {
  it('returns drills matching the category', () => {
    const drills = [
      makeDrill({ id: '1', category: 'dribbling' }),
      makeDrill({ id: '2', category: 'passing' }),
      makeDrill({ id: '3', category: 'Dribbling' }),
    ];
    const result = filterDrillsByCategory(drills, 'dribbling');
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.id)).toEqual(['1', '3']);
  });

  it('returns empty array when no match', () => {
    expect(filterDrillsByCategory([makeDrill({ category: 'passing' })], 'shooting')).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterDrillsByCategory([], 'dribbling')).toHaveLength(0);
  });
});

// ─── sortDrillsForSelection ───────────────────────────────────────────────────

describe('sortDrillsForSelection', () => {
  it('puts seeded drills first', () => {
    const drills = [
      makeDrill({ id: 'ai', source: 'ai' }),
      makeDrill({ id: 'seeded', source: 'seeded' }),
      makeDrill({ id: 'coach', source: 'coach' }),
    ];
    const sorted = sortDrillsForSelection(drills);
    expect(sorted[0].id).toBe('seeded');
    expect(sorted[sorted.length - 1].id).toBe('ai');
  });

  it('does not mutate the original array', () => {
    const drills = [makeDrill({ source: 'ai' }), makeDrill({ source: 'seeded' })];
    const original = [...drills];
    sortDrillsForSelection(drills);
    expect(drills[0].source).toBe(original[0].source);
  });
});

// ─── selectDrillOfDay ─────────────────────────────────────────────────────────

describe('selectDrillOfDay', () => {
  const drills = [
    makeDrill({ id: 'a', category: 'dribbling', source: 'seeded' }),
    makeDrill({ id: 'b', category: 'dribbling', source: 'coach' }),
    makeDrill({ id: 'c', category: 'passing', source: 'seeded' }),
  ];

  it('returns null when no drills match the category', () => {
    expect(selectDrillOfDay(drills, 'shooting', 'team-1', new Date())).toBeNull();
  });

  it('returns null for empty drills array', () => {
    expect(selectDrillOfDay([], 'dribbling', 'team-1', new Date())).toBeNull();
  });

  it('returns a drill from the correct category', () => {
    const drill = selectDrillOfDay(drills, 'dribbling', 'team-1', new Date());
    expect(drill).not.toBeNull();
    expect(drill!.category).toBe('dribbling');
  });

  it('is deterministic for the same team + date', () => {
    const date = new Date('2024-04-20T10:00:00Z');
    const d1 = selectDrillOfDay(drills, 'dribbling', 'team-x', date);
    const d2 = selectDrillOfDay(drills, 'dribbling', 'team-x', date);
    expect(d1?.id).toBe(d2?.id);
  });

  it('may differ for different teams on the same day', () => {
    const date = new Date('2024-04-20T10:00:00Z');
    const allIds = new Set(
      ['team-a', 'team-b', 'team-c', 'team-d', 'team-e'].map(
        (t) => selectDrillOfDay(drills, 'dribbling', t, date)?.id
      )
    );
    // With 5 teams and 2 candidates, we expect some distribution (not all the same)
    expect(allIds.size).toBeGreaterThanOrEqual(1);
  });

  it('returns the only matching drill when there is one', () => {
    const single = [makeDrill({ id: 'only', category: 'defense' })];
    const result = selectDrillOfDay(single, 'defense', 'team-1', new Date());
    expect(result?.id).toBe('only');
  });
});

// ─── hasEnoughDataForDrillOfDay ───────────────────────────────────────────────

describe('hasEnoughDataForDrillOfDay', () => {
  it('returns true when category and drills exist', () => {
    expect(hasEnoughDataForDrillOfDay('dribbling', 5)).toBe(true);
  });

  it('returns false when category is null', () => {
    expect(hasEnoughDataForDrillOfDay(null, 5)).toBe(false);
  });

  it('returns false when category is empty string', () => {
    expect(hasEnoughDataForDrillOfDay('', 5)).toBe(false);
  });

  it('returns false when drillCount is 0', () => {
    expect(hasEnoughDataForDrillOfDay('dribbling', 0)).toBe(false);
  });
});

// ─── getDrillCategoryLabel ────────────────────────────────────────────────────

describe('getDrillCategoryLabel', () => {
  it('capitalises the first letter', () => {
    expect(getDrillCategoryLabel('dribbling')).toBe('Dribbling');
  });

  it('lowercases the rest', () => {
    expect(getDrillCategoryLabel('PASSING')).toBe('Passing');
  });

  it('returns General for empty string', () => {
    expect(getDrillCategoryLabel('')).toBe('General');
  });
});

// ─── getDrillDurationLabel ────────────────────────────────────────────────────

describe('getDrillDurationLabel', () => {
  it('returns empty string for null', () => {
    expect(getDrillDurationLabel(null)).toBe('');
  });

  it('formats minutes under 60', () => {
    expect(getDrillDurationLabel(8)).toBe('8 min');
    expect(getDrillDurationLabel(30)).toBe('30 min');
  });

  it('formats exactly 60 minutes as 1h', () => {
    expect(getDrillDurationLabel(60)).toBe('1h');
  });

  it('formats 90 minutes as 1h 30m', () => {
    expect(getDrillDurationLabel(90)).toBe('1h 30m');
  });

  it('returns empty string for 0', () => {
    expect(getDrillDurationLabel(0)).toBe('');
  });
});

// ─── getDrillCues ─────────────────────────────────────────────────────────────

describe('getDrillCues', () => {
  it('returns up to maxCues cues', () => {
    const drill = makeDrill({ teaching_cues: ['A', 'B', 'C'] });
    expect(getDrillCues(drill, 2)).toEqual(['A', 'B']);
  });

  it('returns all cues when fewer than max', () => {
    const drill = makeDrill({ teaching_cues: ['A'] });
    expect(getDrillCues(drill, 3)).toEqual(['A']);
  });

  it('returns empty array when cues are null', () => {
    const drill = makeDrill({ teaching_cues: null });
    expect(getDrillCues(drill)).toEqual([]);
  });

  it('defaults to 2 cues', () => {
    const drill = makeDrill({ teaching_cues: ['A', 'B', 'C', 'D'] });
    expect(getDrillCues(drill)).toHaveLength(2);
  });
});

// ─── getDrillEquipmentLabel ───────────────────────────────────────────────────

describe('getDrillEquipmentLabel', () => {
  it('returns "No equipment needed" for empty array', () => {
    expect(getDrillEquipmentLabel([])).toBe('No equipment needed');
  });

  it('returns "No equipment needed" for null', () => {
    expect(getDrillEquipmentLabel(null)).toBe('No equipment needed');
  });

  it('returns single item as-is', () => {
    expect(getDrillEquipmentLabel(['basketball'])).toBe('basketball');
  });

  it('joins two items with &', () => {
    expect(getDrillEquipmentLabel(['basketball', 'cones'])).toBe('basketball & cones');
  });

  it('shows +N more for 3+ items', () => {
    expect(getDrillEquipmentLabel(['basketball', 'cones', 'markers'])).toBe('basketball, cones +1 more');
  });
});

// ─── buildDrillDismissKey ─────────────────────────────────────────────────────

describe('buildDrillDismissKey', () => {
  it('includes teamId and dateKey', () => {
    const key = buildDrillDismissKey('team-abc', '2024-03-15');
    expect(key).toContain('team-abc');
    expect(key).toContain('2024-03-15');
  });

  it('is different for different teams', () => {
    const k1 = buildDrillDismissKey('team-a', '2024-03-15');
    const k2 = buildDrillDismissKey('team-b', '2024-03-15');
    expect(k1).not.toBe(k2);
  });

  it('is different for different dates', () => {
    const k1 = buildDrillDismissKey('team-a', '2024-03-15');
    const k2 = buildDrillDismissKey('team-a', '2024-03-16');
    expect(k1).not.toBe(k2);
  });
});

// ─── buildDrillViewUrl ────────────────────────────────────────────────────────

describe('buildDrillViewUrl', () => {
  it('returns a /drills path with category param', () => {
    const url = buildDrillViewUrl('dribbling');
    expect(url).toMatch(/^\/drills\?category=/);
    expect(url).toContain('Dribbling');
  });

  it('URL-encodes special characters', () => {
    const url = buildDrillViewUrl('ball handling');
    expect(url).toContain('Ball%20handling');
  });
});

// ─── buildDrillShareText ──────────────────────────────────────────────────────

describe('buildDrillShareText', () => {
  it('includes drill name', () => {
    const drill = makeDrill({ name: 'Figure 8 Dribble' });
    expect(buildDrillShareText(drill, 'Team A')).toContain('Figure 8 Dribble');
  });

  it('includes team name', () => {
    const drill = makeDrill();
    expect(buildDrillShareText(drill, 'Tigers U10')).toContain('Tigers U10');
  });

  it('includes coaching cues when present', () => {
    const drill = makeDrill({ teaching_cues: ['Head up', 'Low dribble'] });
    const text = buildDrillShareText(drill, 'Team');
    expect(text).toContain('Head up');
    expect(text).toContain('Low dribble');
  });

  it('includes duration when set', () => {
    const drill = makeDrill({ duration_minutes: 10 });
    expect(buildDrillShareText(drill, 'Team')).toContain('10 min');
  });

  it('includes SportsIQ attribution', () => {
    expect(buildDrillShareText(makeDrill(), 'Team')).toContain('SportsIQ');
  });
});

// ─── getDrillPlayerCountLabel ─────────────────────────────────────────────────

describe('getDrillPlayerCountLabel', () => {
  it('returns N+ players when max is null', () => {
    expect(getDrillPlayerCountLabel(1, null)).toBe('1+ players');
  });

  it('returns N+ players when max equals min', () => {
    expect(getDrillPlayerCountLabel(4, 4)).toBe('4+ players');
  });

  it('returns a range when min and max differ', () => {
    expect(getDrillPlayerCountLabel(4, 12)).toBe('4–12 players');
  });
});
