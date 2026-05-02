import { describe, it, expect } from 'vitest';
import {
  OBSERVATION_TEMPLATES,
  getTemplatesForSport,
  getTemplatesBySentiment,
  findTemplateById,
  getAllTemplateIds,
} from '@/lib/observation-templates';

// ── OBSERVATION_TEMPLATES (basketball / default) ──────────────────────────────

describe('OBSERVATION_TEMPLATES', () => {
  it('contains 20 templates (10 positive + 10 needs-work)', () => {
    expect(OBSERVATION_TEMPLATES).toHaveLength(20);
  });

  it('has exactly 10 positive templates', () => {
    const pos = OBSERVATION_TEMPLATES.filter((t) => t.sentiment === 'positive');
    expect(pos).toHaveLength(10);
  });

  it('has exactly 10 needs-work templates', () => {
    const nw = OBSERVATION_TEMPLATES.filter((t) => t.sentiment === 'needs-work');
    expect(nw).toHaveLength(10);
  });

  it('every template has a non-empty id, text, emoji, and category', () => {
    for (const t of OBSERVATION_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.text).toBeTruthy();
      expect(t.emoji).toBeTruthy();
      expect(t.category).toBeTruthy();
    }
  });

  it('all ids are unique within the basketball set', () => {
    const ids = OBSERVATION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── getTemplatesForSport ──────────────────────────────────────────────────────

describe('getTemplatesForSport', () => {
  it('returns basketball templates when sportId is null', () => {
    expect(getTemplatesForSport(null)).toStrictEqual(OBSERVATION_TEMPLATES);
  });

  it('returns basketball templates when sportId is undefined', () => {
    expect(getTemplatesForSport(undefined)).toStrictEqual(OBSERVATION_TEMPLATES);
  });

  it('returns basketball templates when sportId is basketball', () => {
    expect(getTemplatesForSport('basketball')).toStrictEqual(OBSERVATION_TEMPLATES);
  });

  it('returns basketball templates for an unrecognised sport', () => {
    expect(getTemplatesForSport('volleyball')).toStrictEqual(OBSERVATION_TEMPLATES);
  });

  it('returns soccer templates when sportId is soccer', () => {
    const templates = getTemplatesForSport('soccer');
    expect(templates.length).toBeGreaterThan(0);
    expect(templates).not.toStrictEqual(OBSERVATION_TEMPLATES);
    expect(templates.some((t) => t.id.startsWith('soc-'))).toBe(true);
  });

  it('returns flag_football templates when sportId is flag_football', () => {
    const templates = getTemplatesForSport('flag_football');
    expect(templates.length).toBeGreaterThan(0);
    expect(templates).not.toStrictEqual(OBSERVATION_TEMPLATES);
    expect(templates.some((t) => t.id.startsWith('ff-'))).toBe(true);
  });

  it('is case-insensitive for sport id', () => {
    const lower = getTemplatesForSport('soccer');
    const upper = getTemplatesForSport('SOCCER');
    expect(lower).toStrictEqual(upper);
  });
});

// ── Soccer templates ──────────────────────────────────────────────────────────

describe('soccer templates', () => {
  const soccerTemplates = getTemplatesForSport('soccer');

  it('has 20 templates (10 positive + 10 needs-work)', () => {
    expect(soccerTemplates).toHaveLength(20);
  });

  it('all ids start with soc-', () => {
    expect(soccerTemplates.every((t) => t.id.startsWith('soc-'))).toBe(true);
  });

  it('includes a first-touch positive template', () => {
    const t = soccerTemplates.find((t) => t.id === 'soc-pos-touch');
    expect(t).toBeDefined();
    expect(t?.sentiment).toBe('positive');
    expect(t?.text.toLowerCase()).toContain('touch');
  });

  it('includes a defensive tracking needs-work template', () => {
    const t = soccerTemplates.find((t) => t.id === 'soc-nw-defense');
    expect(t).toBeDefined();
    expect(t?.sentiment).toBe('needs-work');
  });

  it('all ids are unique within the soccer set', () => {
    const ids = soccerTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template has a non-empty id, text, emoji, and category', () => {
    for (const t of soccerTemplates) {
      expect(t.id).toBeTruthy();
      expect(t.text).toBeTruthy();
      expect(t.emoji).toBeTruthy();
      expect(t.category).toBeTruthy();
    }
  });
});

// ── Flag football templates ───────────────────────────────────────────────────

describe('flag_football templates', () => {
  const ffTemplates = getTemplatesForSport('flag_football');

  it('has 20 templates (10 positive + 10 needs-work)', () => {
    expect(ffTemplates).toHaveLength(20);
  });

  it('all ids start with ff-', () => {
    expect(ffTemplates.every((t) => t.id.startsWith('ff-'))).toBe(true);
  });

  it('includes a route running positive template', () => {
    const t = ffTemplates.find((t) => t.id === 'ff-pos-routes');
    expect(t).toBeDefined();
    expect(t?.sentiment).toBe('positive');
    expect(t?.text.toLowerCase()).toContain('route');
  });

  it('includes a flag pulling needs-work template', () => {
    const t = ffTemplates.find((t) => t.id === 'ff-nw-defense');
    expect(t).toBeDefined();
    expect(t?.sentiment).toBe('needs-work');
  });

  it('all ids are unique within the flag football set', () => {
    const ids = ffTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template has a non-empty id, text, emoji, and category', () => {
    for (const t of ffTemplates) {
      expect(t.id).toBeTruthy();
      expect(t.text).toBeTruthy();
      expect(t.emoji).toBeTruthy();
      expect(t.category).toBeTruthy();
    }
  });
});

// ── getTemplatesBySentiment ───────────────────────────────────────────────────

describe('getTemplatesBySentiment', () => {
  it('returns only positive templates when sentiment is positive (default sport)', () => {
    const result = getTemplatesBySentiment('positive');
    expect(result.every((t) => t.sentiment === 'positive')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns only needs-work templates when sentiment is needs-work (default sport)', () => {
    const result = getTemplatesBySentiment('needs-work');
    expect(result.every((t) => t.sentiment === 'needs-work')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns soccer positive templates when sportId is soccer', () => {
    const result = getTemplatesBySentiment('positive', 'soccer');
    expect(result.every((t) => t.sentiment === 'positive')).toBe(true);
    expect(result.every((t) => t.id.startsWith('soc-'))).toBe(true);
  });

  it('returns soccer needs-work templates when sportId is soccer', () => {
    const result = getTemplatesBySentiment('needs-work', 'soccer');
    expect(result.every((t) => t.sentiment === 'needs-work')).toBe(true);
    expect(result.every((t) => t.id.startsWith('soc-'))).toBe(true);
  });

  it('returns flag_football positive templates when sportId is flag_football', () => {
    const result = getTemplatesBySentiment('positive', 'flag_football');
    expect(result.every((t) => t.sentiment === 'positive')).toBe(true);
    expect(result.every((t) => t.id.startsWith('ff-'))).toBe(true);
  });

  it('returns flag_football needs-work templates when sportId is flag_football', () => {
    const result = getTemplatesBySentiment('needs-work', 'flag_football');
    expect(result.every((t) => t.sentiment === 'needs-work')).toBe(true);
    expect(result.every((t) => t.id.startsWith('ff-'))).toBe(true);
  });

  it('falls back to basketball when given an unknown sport', () => {
    const result = getTemplatesBySentiment('positive', 'volleyball');
    const expected = OBSERVATION_TEMPLATES.filter((t) => t.sentiment === 'positive');
    expect(result).toStrictEqual(expected);
  });

  it('returns 10 templates per sentiment for each sport (balanced sets)', () => {
    for (const sport of ['basketball', 'soccer', 'flag_football']) {
      const pos = getTemplatesBySentiment('positive', sport);
      const nw = getTemplatesBySentiment('needs-work', sport);
      expect(pos).toHaveLength(10);
      expect(nw).toHaveLength(10);
    }
  });
});

// ── findTemplateById ──────────────────────────────────────────────────────────

describe('findTemplateById', () => {
  it('finds a basketball template by id', () => {
    const t = findTemplateById('pos-shooting');
    expect(t).toBeDefined();
    expect(t?.id).toBe('pos-shooting');
  });

  it('finds a soccer template by id', () => {
    const t = findTemplateById('soc-pos-touch');
    expect(t).toBeDefined();
    expect(t?.id).toBe('soc-pos-touch');
  });

  it('finds a flag football template by id', () => {
    const t = findTemplateById('ff-nw-routes');
    expect(t).toBeDefined();
    expect(t?.id).toBe('ff-nw-routes');
  });

  it('returns undefined for an unknown id', () => {
    expect(findTemplateById('not-a-real-id')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(findTemplateById('')).toBeUndefined();
  });
});

// ── getAllTemplateIds ─────────────────────────────────────────────────────────

describe('getAllTemplateIds', () => {
  it('returns a Set containing basketball ids', () => {
    const ids = getAllTemplateIds();
    expect(ids.has('pos-shooting')).toBe(true);
    expect(ids.has('nw-defense')).toBe(true);
  });

  it('returns a Set containing soccer ids', () => {
    const ids = getAllTemplateIds();
    expect(ids.has('soc-pos-touch')).toBe(true);
    expect(ids.has('soc-nw-defense')).toBe(true);
  });

  it('returns a Set containing flag football ids', () => {
    const ids = getAllTemplateIds();
    expect(ids.has('ff-pos-routes')).toBe(true);
    expect(ids.has('ff-nw-defense')).toBe(true);
  });

  it('does not contain unknown ids', () => {
    const ids = getAllTemplateIds();
    expect(ids.has('not-a-template')).toBe(false);
  });

  it('total size is 60 (20 per sport × 3 sports)', () => {
    expect(getAllTemplateIds().size).toBe(60);
  });

  it('all ids across all sports are globally unique', () => {
    const ids = getAllTemplateIds();
    const allTemplates = [
      ...OBSERVATION_TEMPLATES,
      ...getTemplatesForSport('soccer'),
      ...getTemplatesForSport('flag_football'),
    ];
    expect(ids.size).toBe(allTemplates.length);
  });
});
