import { describe, it, expect } from 'vitest';
import {
  selectPositiveObs,
  selectNeedsWorkObs,
  selectPlayerObs,
  positiveRatio,
  countObsByCategory,
  countObsBySentiment,
  classifyMomentum,
  getMomentumLabel,
  getMomentumColor,
  getMomentumBannerClasses,
  groupObsByPlayer,
  getTopPerformers,
  getStrugglingPlayers,
  getStrongestCategories,
  getWeakestCategories,
  hasEnoughDataForHalftime,
  buildHalftimeSummaryLines,
  buildCategoryBreakdown,
  buildHalftimeShareText,
  type HalftimeObs,
  type HalftimeAdjustments,
} from '../src/lib/halftime-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeObs = (overrides: Partial<HalftimeObs> = {}): HalftimeObs => ({
  sentiment: 'positive',
  text: 'Good play',
  ...overrides,
});

const mixedObs: HalftimeObs[] = [
  makeObs({ player_id: '1', player_name: 'Alice', sentiment: 'positive',   category: 'shooting' }),
  makeObs({ player_id: '1', player_name: 'Alice', sentiment: 'positive',   category: 'shooting' }),
  makeObs({ player_id: '2', player_name: 'Bob',   sentiment: 'needs-work', category: 'defense' }),
  makeObs({ player_id: '2', player_name: 'Bob',   sentiment: 'needs-work', category: 'defense' }),
  makeObs({ player_id: '3', player_name: 'Carlos', sentiment: 'positive',  category: 'dribbling' }),
  makeObs({ player_id: null, player_name: undefined, sentiment: 'neutral', category: 'teamwork' }),
];

// ─── selectPositiveObs ────────────────────────────────────────────────────────

describe('selectPositiveObs', () => {
  it('returns only positive observations', () => {
    const result = selectPositiveObs(mixedObs);
    expect(result.every((o) => o.sentiment === 'positive')).toBe(true);
  });

  it('returns correct count', () => {
    expect(selectPositiveObs(mixedObs)).toHaveLength(3);
  });

  it('returns empty for all needs-work', () => {
    const obs = [makeObs({ sentiment: 'needs-work' }), makeObs({ sentiment: 'needs-work' })];
    expect(selectPositiveObs(obs)).toHaveLength(0);
  });
});

// ─── selectNeedsWorkObs ───────────────────────────────────────────────────────

describe('selectNeedsWorkObs', () => {
  it('returns only needs-work observations', () => {
    const result = selectNeedsWorkObs(mixedObs);
    expect(result.every((o) => o.sentiment === 'needs-work')).toBe(true);
  });

  it('returns correct count', () => {
    expect(selectNeedsWorkObs(mixedObs)).toHaveLength(2);
  });
});

// ─── selectPlayerObs ──────────────────────────────────────────────────────────

describe('selectPlayerObs', () => {
  it('excludes team observations (no player_id)', () => {
    const result = selectPlayerObs(mixedObs);
    expect(result.every((o) => !!o.player_id)).toBe(true);
  });

  it('includes player observations', () => {
    expect(selectPlayerObs(mixedObs)).toHaveLength(5);
  });
});

// ─── positiveRatio ────────────────────────────────────────────────────────────

describe('positiveRatio', () => {
  it('returns 0 for empty array', () => {
    expect(positiveRatio([])).toBe(0);
  });

  it('returns 1.0 for all positive', () => {
    const obs = [makeObs(), makeObs(), makeObs()];
    expect(positiveRatio(obs)).toBe(1);
  });

  it('returns 0 for all needs-work', () => {
    const obs = [makeObs({ sentiment: 'needs-work' }), makeObs({ sentiment: 'needs-work' })];
    expect(positiveRatio(obs)).toBe(0);
  });

  it('returns 0.5 for equal positive and needs-work', () => {
    const obs = [makeObs(), makeObs({ sentiment: 'needs-work' })];
    expect(positiveRatio(obs)).toBe(0.5);
  });

  it('ignores neutral observations in ratio', () => {
    const obs = [makeObs(), makeObs({ sentiment: 'neutral' })];
    // scored = [positive], ratio = 1/1 = 1
    expect(positiveRatio(obs)).toBe(1);
  });

  it('returns 0 for only neutral observations', () => {
    const obs = [makeObs({ sentiment: 'neutral' }), makeObs({ sentiment: 'neutral' })];
    expect(positiveRatio(obs)).toBe(0);
  });
});

// ─── countObsByCategory ───────────────────────────────────────────────────────

describe('countObsByCategory', () => {
  it('returns correct category counts', () => {
    const counts = countObsByCategory(mixedObs);
    expect(counts['shooting']).toBe(2);
    expect(counts['defense']).toBe(2);
    expect(counts['dribbling']).toBe(1);
    expect(counts['teamwork']).toBe(1);
  });

  it('defaults to general when category is undefined', () => {
    const obs = [makeObs({ category: undefined })];
    expect(countObsByCategory(obs)['general']).toBe(1);
  });

  it('returns empty for no observations', () => {
    expect(countObsByCategory([])).toEqual({});
  });
});

// ─── countObsBySentiment ─────────────────────────────────────────────────────

describe('countObsBySentiment', () => {
  it('counts correctly', () => {
    const counts = countObsBySentiment(mixedObs);
    expect(counts['positive']).toBe(3);
    expect(counts['needs-work']).toBe(2);
    expect(counts['neutral']).toBe(1);
  });
});

// ─── classifyMomentum ────────────────────────────────────────────────────────

describe('classifyMomentum', () => {
  it('returns building when mostly positive (ratio ≥ 0.55)', () => {
    const obs = [makeObs(), makeObs(), makeObs(), makeObs({ sentiment: 'needs-work' })];
    // ratio = 3/4 = 0.75
    expect(classifyMomentum(obs)).toBe('building');
  });

  it('returns trailing when mostly needs-work (ratio < 0.35)', () => {
    const obs = [
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs({ sentiment: 'needs-work' }),
      makeObs(),
    ];
    // ratio = 1/4 = 0.25
    expect(classifyMomentum(obs)).toBe('trailing');
  });

  it('returns level when even (0.35 ≤ ratio < 0.55)', () => {
    const obs = [makeObs(), makeObs({ sentiment: 'needs-work' })];
    // ratio = 0.5
    expect(classifyMomentum(obs)).toBe('level');
  });

  it('returns building for empty array (ratio 0 of 0 scored)', () => {
    // ratio=0 → trailing, but empty → no scored → ratio=0 → trailing
    expect(classifyMomentum([])).toBe('trailing');
  });
});

// ─── getMomentumLabel ─────────────────────────────────────────────────────────

describe('getMomentumLabel', () => {
  it('returns Building Momentum for building', () => {
    expect(getMomentumLabel('building')).toBe('Building Momentum');
  });

  it('returns Even Game for level', () => {
    expect(getMomentumLabel('level')).toBe('Even Game');
  });

  it('returns Need Adjustment for trailing', () => {
    expect(getMomentumLabel('trailing')).toBe('Need Adjustment');
  });
});

// ─── getMomentumColor ─────────────────────────────────────────────────────────

describe('getMomentumColor', () => {
  it('returns emerald for building', () => {
    expect(getMomentumColor('building')).toContain('emerald');
  });

  it('returns amber for level', () => {
    expect(getMomentumColor('level')).toContain('amber');
  });

  it('returns red for trailing', () => {
    expect(getMomentumColor('trailing')).toContain('red');
  });
});

// ─── getMomentumBannerClasses ─────────────────────────────────────────────────

describe('getMomentumBannerClasses', () => {
  it('returns emerald classes for building', () => {
    expect(getMomentumBannerClasses('building')).toContain('emerald');
  });

  it('returns red classes for trailing', () => {
    expect(getMomentumBannerClasses('trailing')).toContain('red');
  });
});

// ─── groupObsByPlayer ─────────────────────────────────────────────────────────

describe('groupObsByPlayer', () => {
  it('groups correctly by player name', () => {
    const groups = groupObsByPlayer(mixedObs);
    expect(groups['Alice'].positive).toBe(2);
    expect(groups['Alice'].needsWork).toBe(0);
    expect(groups['Bob'].positive).toBe(0);
    expect(groups['Bob'].needsWork).toBe(2);
  });

  it('uses "Team" for observations without player name', () => {
    const groups = groupObsByPlayer(mixedObs);
    expect(groups['Team']).toBeDefined();
    expect(groups['Team'].total).toBe(1);
  });

  it('returns empty object for no observations', () => {
    expect(groupObsByPlayer([])).toEqual({});
  });
});

// ─── getTopPerformers ─────────────────────────────────────────────────────────

describe('getTopPerformers', () => {
  it('returns players with high positive ratio and ≥2 obs', () => {
    const result = getTopPerformers(mixedObs);
    expect(result).toContain('Alice');
    expect(result).not.toContain('Bob');
  });

  it('excludes Team', () => {
    const result = getTopPerformers(mixedObs);
    expect(result).not.toContain('Team');
  });

  it('respects topN limit', () => {
    const result = getTopPerformers(mixedObs, 1);
    expect(result).toHaveLength(1);
  });

  it('returns empty when no players qualify', () => {
    expect(getTopPerformers([])).toHaveLength(0);
  });
});

// ─── getStrugglingPlayers ─────────────────────────────────────────────────────

describe('getStrugglingPlayers', () => {
  it('returns players with high needs-work ratio', () => {
    const result = getStrugglingPlayers(mixedObs);
    expect(result).toContain('Bob');
    expect(result).not.toContain('Alice');
  });

  it('respects topN limit', () => {
    const result = getStrugglingPlayers(mixedObs, 1);
    expect(result.length).toBeLessThanOrEqual(1);
  });
});

// ─── getStrongestCategories ───────────────────────────────────────────────────

describe('getStrongestCategories', () => {
  it('returns categories from positive observations', () => {
    const result = getStrongestCategories(mixedObs);
    expect(result).toContain('shooting');
  });

  it('does not include defense (only needs-work obs)', () => {
    const result = getStrongestCategories(mixedObs);
    expect(result).not.toContain('defense');
  });
});

// ─── getWeakestCategories ─────────────────────────────────────────────────────

describe('getWeakestCategories', () => {
  it('returns categories from needs-work observations', () => {
    const result = getWeakestCategories(mixedObs);
    expect(result).toContain('defense');
  });

  it('does not include shooting (only positive obs)', () => {
    const result = getWeakestCategories(mixedObs);
    expect(result).not.toContain('shooting');
  });
});

// ─── hasEnoughDataForHalftime ────────────────────────────────────────────────

describe('hasEnoughDataForHalftime', () => {
  it('returns false for fewer than 3 observations', () => {
    expect(hasEnoughDataForHalftime([])).toBe(false);
    expect(hasEnoughDataForHalftime([makeObs(), makeObs()])).toBe(false);
  });

  it('returns true for 3 or more observations', () => {
    expect(hasEnoughDataForHalftime([makeObs(), makeObs(), makeObs()])).toBe(true);
    expect(hasEnoughDataForHalftime(mixedObs)).toBe(true);
  });
});

// ─── buildHalftimeSummaryLines ────────────────────────────────────────────────

describe('buildHalftimeSummaryLines', () => {
  it('builds one line per named player', () => {
    const lines = buildHalftimeSummaryLines(mixedObs);
    expect(lines.some((l) => l.startsWith('Alice'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Bob'))).toBe(true);
  });

  it('excludes Team from summary lines', () => {
    const lines = buildHalftimeSummaryLines(mixedObs);
    expect(lines.some((l) => l.startsWith('Team'))).toBe(false);
  });

  it('includes sentiment counts', () => {
    const lines = buildHalftimeSummaryLines(mixedObs);
    const aliceLine = lines.find((l) => l.startsWith('Alice'));
    expect(aliceLine).toContain('2+');
  });
});

// ─── buildCategoryBreakdown ───────────────────────────────────────────────────

describe('buildCategoryBreakdown', () => {
  it('includes all categories', () => {
    const result = buildCategoryBreakdown(mixedObs);
    expect(result).toContain('shooting');
    expect(result).toContain('defense');
  });

  it('returns empty string for no observations', () => {
    expect(buildCategoryBreakdown([])).toBe('');
  });
});

// ─── buildHalftimeShareText ───────────────────────────────────────────────────

describe('buildHalftimeShareText', () => {
  const adj: HalftimeAdjustments = {
    momentum: 'building',
    whats_working: ['Strong shooting', 'Good defense'],
    what_needs_fixing: ['Turnover rate', 'Rebounding'],
    adjustments: [
      { focus: 'Defense', action: 'Switch to zone', priority: 'immediate' },
      { focus: 'Offense', action: 'Slow the pace', priority: 'secondary' },
    ],
    player_spotlight: { name: 'Alice', note: 'Great in transition' },
    halftime_message: 'We have what it takes to win this!',
  };

  it('includes opponent name when provided', () => {
    const text = buildHalftimeShareText(adj, 'Eagles');
    expect(text).toContain('vs Eagles');
  });

  it('includes momentum label', () => {
    const text = buildHalftimeShareText(adj);
    expect(text).toContain('Building Momentum');
  });

  it('includes whats_working items', () => {
    const text = buildHalftimeShareText(adj);
    expect(text).toContain('Strong shooting');
    expect(text).toContain('Good defense');
  });

  it('includes what_needs_fixing items', () => {
    const text = buildHalftimeShareText(adj);
    expect(text).toContain('Turnover rate');
  });

  it('includes adjustments', () => {
    const text = buildHalftimeShareText(adj);
    expect(text).toContain('Defense');
    expect(text).toContain('Switch to zone');
  });

  it('includes player spotlight', () => {
    const text = buildHalftimeShareText(adj);
    expect(text).toContain('Alice');
    expect(text).toContain('Great in transition');
  });

  it('includes halftime message', () => {
    const text = buildHalftimeShareText(adj);
    expect(text).toContain('We have what it takes to win this!');
  });

  it('works without opponent name', () => {
    const text = buildHalftimeShareText(adj);
    expect(text).toContain('Half-Time Adjustments');
    expect(text).not.toContain('vs');
  });

  it('works when player_spotlight is null', () => {
    const adjNoSpotlight = { ...adj, player_spotlight: null };
    const text = buildHalftimeShareText(adjNoSpotlight);
    expect(text).not.toContain('Feature');
  });
});
