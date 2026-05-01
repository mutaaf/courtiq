import { describe, it, expect } from 'vitest';
import {
  PRACTICE_TEMPLATES,
  getTemplatesForSport,
  getTemplateById,
  getTotalMinutes,
  getDrillCount,
  matchesAgeGroup,
  rankTemplates,
  hasSufficientCues,
  buildTemplateLabel,
  buildTemplateSummary,
  filterByTag,
  getAllTags,
  templateFitsSession,
  scaleTemplateDuration,
} from '../src/lib/practice-templates';

// ─── Registry ────────────────────────────────────────────────────────────────

describe('PRACTICE_TEMPLATES registry', () => {
  it('exports at least 5 templates', () => {
    expect(PRACTICE_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('every template has a unique id', () => {
    const ids = PRACTICE_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every template has at least 3 drills', () => {
    PRACTICE_TEMPLATES.forEach((t) => {
      expect(t.drills.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('every template has a non-empty description', () => {
    PRACTICE_TEMPLATES.forEach((t) => {
      expect(t.description.trim().length).toBeGreaterThan(0);
    });
  });

  it('every template has at least one tag', () => {
    PRACTICE_TEMPLATES.forEach((t) => {
      expect(t.tags.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('every drill has a non-empty name', () => {
    PRACTICE_TEMPLATES.forEach((t) =>
      t.drills.forEach((d) => {
        expect(d.name.trim().length).toBeGreaterThan(0);
      })
    );
  });

  it('every drill has a positive durationMins', () => {
    PRACTICE_TEMPLATES.forEach((t) =>
      t.drills.forEach((d) => {
        expect(d.durationMins).toBeGreaterThan(0);
      })
    );
  });

  it('every drill has a non-empty description', () => {
    PRACTICE_TEMPLATES.forEach((t) =>
      t.drills.forEach((d) => {
        expect(d.description.trim().length).toBeGreaterThan(0);
      })
    );
  });
});

// ─── getTemplatesForSport ────────────────────────────────────────────────────

describe('getTemplatesForSport', () => {
  it('returns basketball templates for basketball', () => {
    const result = getTemplatesForSport('basketball');
    expect(result.some((t) => t.sport === 'basketball')).toBe(true);
  });

  it('includes generic (sport="") templates for any sport', () => {
    const result = getTemplatesForSport('basketball');
    expect(result.some((t) => t.sport === '')).toBe(true);
  });

  it('includes generic templates for soccer', () => {
    const result = getTemplatesForSport('soccer');
    expect(result.some((t) => t.sport === '')).toBe(true);
  });

  it('returns generic templates for an unknown sport', () => {
    const result = getTemplatesForSport('lacrosse');
    expect(result.every((t) => t.sport === '')).toBe(true);
  });

  it('is case-insensitive', () => {
    const lower = getTemplatesForSport('basketball');
    const upper = getTemplatesForSport('BASKETBALL');
    expect(lower.map((t) => t.id)).toEqual(upper.map((t) => t.id));
  });

  it('does not return templates for a different sport', () => {
    const result = getTemplatesForSport('basketball');
    expect(result.some((t) => t.sport === 'soccer')).toBe(false);
  });

  it('returns flag_football templates for flag_football', () => {
    const result = getTemplatesForSport('flag_football');
    expect(result.some((t) => t.sport === 'flag_football')).toBe(true);
  });

  it('includes generic templates for flag_football', () => {
    const result = getTemplatesForSport('flag_football');
    expect(result.some((t) => t.sport === '')).toBe(true);
  });

  it('does not return basketball templates for flag_football', () => {
    const result = getTemplatesForSport('flag_football');
    expect(result.some((t) => t.sport === 'basketball')).toBe(false);
  });
});

// ─── getTemplateById ─────────────────────────────────────────────────────────

describe('getTemplateById', () => {
  it('finds a template by id', () => {
    const template = PRACTICE_TEMPLATES[0];
    expect(getTemplateById(template.id)).toEqual(template);
  });

  it('returns undefined for a missing id', () => {
    expect(getTemplateById('does-not-exist')).toBeUndefined();
  });

  it('finds basketball-u8 template', () => {
    const result = getTemplateById('bball-u8-30');
    expect(result).toBeDefined();
    expect(result?.sport).toBe('basketball');
  });

  it('finds generic first-practice template', () => {
    const result = getTemplateById('generic-first-30');
    expect(result).toBeDefined();
    expect(result?.sport).toBe('');
  });

  it('finds flag-u8-30 template', () => {
    const result = getTemplateById('flag-u8-30');
    expect(result).toBeDefined();
    expect(result?.sport).toBe('flag_football');
  });

  it('finds flag-u12-45 template', () => {
    const result = getTemplateById('flag-u12-45');
    expect(result).toBeDefined();
    expect(result?.sport).toBe('flag_football');
  });
});

// ─── getTotalMinutes ─────────────────────────────────────────────────────────

describe('getTotalMinutes', () => {
  it('sums up all drill durations', () => {
    const template = getTemplateById('bball-u8-30')!;
    const expected = template.drills.reduce((s, d) => s + d.durationMins, 0);
    expect(getTotalMinutes(template)).toBe(expected);
  });

  it('matches the declared totalMins', () => {
    PRACTICE_TEMPLATES.forEach((t) => {
      expect(getTotalMinutes(t)).toBe(t.totalMins);
    });
  });

  it('returns 0 for a template with no drills', () => {
    const empty = { ...PRACTICE_TEMPLATES[0], drills: [] };
    expect(getTotalMinutes(empty)).toBe(0);
  });
});

// ─── getDrillCount ───────────────────────────────────────────────────────────

describe('getDrillCount', () => {
  it('returns the number of drills', () => {
    PRACTICE_TEMPLATES.forEach((t) => {
      expect(getDrillCount(t)).toBe(t.drills.length);
    });
  });
});

// ─── matchesAgeGroup ─────────────────────────────────────────────────────────

describe('matchesAgeGroup', () => {
  it('returns true when ageGroup is empty', () => {
    const template = getTemplateById('bball-u8-30')!;
    expect(matchesAgeGroup(template, '')).toBe(true);
  });

  it('U8 template matches age U8', () => {
    const template = getTemplateById('bball-u8-30')!;
    expect(matchesAgeGroup(template, 'U8')).toBe(true);
  });

  it('U8 template matches age U6', () => {
    const template = getTemplateById('bball-u8-30')!;
    expect(matchesAgeGroup(template, 'U6')).toBe(true);
  });

  it('U8 template does not match age U10', () => {
    const template = getTemplateById('bball-u8-30')!;
    expect(matchesAgeGroup(template, 'U10')).toBe(false);
  });

  it('U12 template matches age U10', () => {
    const template = getTemplateById('bball-u12-45')!;
    expect(matchesAgeGroup(template, 'U10')).toBe(true);
  });

  it('U16 template matches age U14', () => {
    const template = getTemplateById('bball-u16-60')!;
    expect(matchesAgeGroup(template, 'U14')).toBe(true);
  });

  it('U16 template does not match age U8', () => {
    const template = getTemplateById('bball-u16-60')!;
    expect(matchesAgeGroup(template, 'U8')).toBe(false);
  });

  it('generic template always matches any age group', () => {
    const template = getTemplateById('generic-first-30')!;
    ['U6', 'U10', 'U14', 'U18'].forEach((ag) => {
      expect(matchesAgeGroup(template, ag)).toBe(true);
    });
  });

  it('flag U8 template matches U8 age group', () => {
    const template = getTemplateById('flag-u8-30')!;
    expect(matchesAgeGroup(template, 'U8')).toBe(true);
  });

  it('flag U8 template matches U6 age group', () => {
    const template = getTemplateById('flag-u8-30')!;
    expect(matchesAgeGroup(template, 'U6')).toBe(true);
  });

  it('flag U8 template does not match U10 age group', () => {
    const template = getTemplateById('flag-u8-30')!;
    expect(matchesAgeGroup(template, 'U10')).toBe(false);
  });

  it('flag U12 template matches U10 age group', () => {
    const template = getTemplateById('flag-u12-45')!;
    expect(matchesAgeGroup(template, 'U10')).toBe(true);
  });

  it('flag U12 template does not match U8 age group', () => {
    const template = getTemplateById('flag-u12-45')!;
    expect(matchesAgeGroup(template, 'U8')).toBe(false);
  });
});

// ─── rankTemplates ────────────────────────────────────────────────────────────

describe('rankTemplates', () => {
  it('returns all provided templates', () => {
    const templates = getTemplatesForSport('basketball');
    const ranked = rankTemplates(templates, 'basketball', 'U10');
    expect(ranked.length).toBe(templates.length);
  });

  it('puts age-matching templates before non-matching ones', () => {
    const templates = getTemplatesForSport('basketball');
    const ranked = rankTemplates(templates, 'basketball', 'U10');
    const matchIdx = ranked.findIndex((t) => matchesAgeGroup(t, 'U10'));
    const noMatchIdx = ranked.findIndex((t) => !matchesAgeGroup(t, 'U10') && t.sport !== '');
    if (noMatchIdx !== -1) {
      expect(matchIdx).toBeLessThan(noMatchIdx);
    }
  });

  it('does not drop any templates', () => {
    const templates = PRACTICE_TEMPLATES;
    const ranked = rankTemplates(templates, 'basketball', 'U12');
    expect(ranked.length).toBe(templates.length);
  });
});

// ─── hasSufficientCues ───────────────────────────────────────────────────────

describe('hasSufficientCues', () => {
  it('returns true for templates that have cues on every drill', () => {
    PRACTICE_TEMPLATES.forEach((t) => {
      expect(hasSufficientCues(t)).toBe(true);
    });
  });

  it('returns false if any drill has no cues', () => {
    const template = {
      ...PRACTICE_TEMPLATES[0],
      drills: PRACTICE_TEMPLATES[0].drills.map((d) => ({ ...d, cues: [] })),
    };
    expect(hasSufficientCues(template)).toBe(false);
  });
});

// ─── buildTemplateLabel ───────────────────────────────────────────────────────

describe('buildTemplateLabel', () => {
  it('includes template name', () => {
    const t = PRACTICE_TEMPLATES[0];
    expect(buildTemplateLabel(t)).toContain(t.name);
  });

  it('includes age label', () => {
    const t = PRACTICE_TEMPLATES[0];
    expect(buildTemplateLabel(t)).toContain(t.ageLabel);
  });

  it('separates with ·', () => {
    const t = PRACTICE_TEMPLATES[0];
    expect(buildTemplateLabel(t)).toContain('·');
  });
});

// ─── buildTemplateSummary ────────────────────────────────────────────────────

describe('buildTemplateSummary', () => {
  it('includes drill count', () => {
    const t = PRACTICE_TEMPLATES[0];
    expect(buildTemplateSummary(t)).toContain(String(t.drills.length));
  });

  it('includes total minutes', () => {
    const t = PRACTICE_TEMPLATES[0];
    const mins = getTotalMinutes(t);
    expect(buildTemplateSummary(t)).toContain(String(mins));
  });

  it('includes "drills"', () => {
    const t = PRACTICE_TEMPLATES[0];
    expect(buildTemplateSummary(t)).toContain('drill');
  });

  it('includes "min"', () => {
    const t = PRACTICE_TEMPLATES[0];
    expect(buildTemplateSummary(t)).toContain('min');
  });
});

// ─── filterByTag ─────────────────────────────────────────────────────────────

describe('filterByTag', () => {
  it('returns templates matching the tag', () => {
    const result = filterByTag(PRACTICE_TEMPLATES, 'beginner');
    expect(result.length).toBeGreaterThan(0);
    result.forEach((t) => {
      expect(t.tags).toContain('beginner');
    });
  });

  it('returns empty array for non-existent tag', () => {
    expect(filterByTag(PRACTICE_TEMPLATES, 'nonexistent-tag-xyz')).toHaveLength(0);
  });

  it('is case-insensitive (lowercases the input tag)', () => {
    const lower = filterByTag(PRACTICE_TEMPLATES, 'beginner');
    const upper = filterByTag(PRACTICE_TEMPLATES, 'Beginner');
    expect(lower.length).toBe(upper.length);
  });
});

// ─── getAllTags ───────────────────────────────────────────────────────────────

describe('getAllTags', () => {
  it('returns a sorted array of unique tags', () => {
    const tags = getAllTags(PRACTICE_TEMPLATES);
    expect(tags.length).toBeGreaterThan(0);
    const sorted = [...tags].sort();
    expect(tags).toEqual(sorted);
  });

  it('includes "beginner" and "intermediate"', () => {
    const tags = getAllTags(PRACTICE_TEMPLATES);
    expect(tags).toContain('beginner');
    expect(tags).toContain('intermediate');
  });

  it('has no duplicates', () => {
    const tags = getAllTags(PRACTICE_TEMPLATES);
    const unique = new Set(tags);
    expect(unique.size).toBe(tags.length);
  });
});

// ─── templateFitsSession ─────────────────────────────────────────────────────

describe('templateFitsSession', () => {
  it('returns true when available time equals template duration', () => {
    const t = getTemplateById('bball-u8-30')!;
    expect(templateFitsSession(t, 30)).toBe(true);
  });

  it('returns true when available time exceeds template duration', () => {
    const t = getTemplateById('bball-u8-30')!;
    expect(templateFitsSession(t, 60)).toBe(true);
  });

  it('returns false when available time is less than template duration', () => {
    const t = getTemplateById('bball-u8-30')!;
    expect(templateFitsSession(t, 20)).toBe(false);
  });
});

// ─── scaleTemplateDuration ───────────────────────────────────────────────────

describe('scaleTemplateDuration', () => {
  it('scales total duration to the target', () => {
    const t = getTemplateById('bball-u12-45')!;
    const scaled = scaleTemplateDuration(t, 30);
    const total = scaled.drills.reduce((s, d) => s + d.durationMins, 0);
    // Allow ±1 min rounding error from integer rounding
    expect(Math.abs(total - 30)).toBeLessThanOrEqual(2);
  });

  it('does not mutate the original template', () => {
    const t = getTemplateById('bball-u12-45')!;
    const originalDuration = getTotalMinutes(t);
    scaleTemplateDuration(t, 30);
    expect(getTotalMinutes(t)).toBe(originalDuration);
  });

  it('preserves drill count', () => {
    const t = getTemplateById('bball-u12-45')!;
    const scaled = scaleTemplateDuration(t, 30);
    expect(scaled.drills.length).toBe(t.drills.length);
  });

  it('ensures every drill has at least 1 minute', () => {
    const t = getTemplateById('bball-u12-45')!;
    const scaled = scaleTemplateDuration(t, 5);
    scaled.drills.forEach((d) => {
      expect(d.durationMins).toBeGreaterThanOrEqual(1);
    });
  });

  it('returns the template unchanged when targetMins equals current total', () => {
    const t = getTemplateById('bball-u8-30')!;
    const scaled = scaleTemplateDuration(t, 30);
    expect(getTotalMinutes(scaled)).toBe(30);
  });

  it('handles zero-drill template gracefully', () => {
    const empty = { ...PRACTICE_TEMPLATES[0], drills: [] };
    const scaled = scaleTemplateDuration(empty, 30);
    expect(scaled.drills).toHaveLength(0);
  });
});
