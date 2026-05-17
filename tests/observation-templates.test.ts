import { describe, it, expect } from 'vitest';
import {
  OBSERVATION_TEMPLATES,
  ALL_OBSERVATION_TEMPLATES,
  getTemplatesBySentiment,
  findTemplateById,
  type ObservationTemplate,
} from '@/lib/observation-templates';

// ─── Generic template data integrity ──────────────────────────────────────────

describe('OBSERVATION_TEMPLATES', () => {
  it('has at least 10 positive and 10 needs-work templates', () => {
    const positive = OBSERVATION_TEMPLATES.filter((t) => t.sentiment === 'positive');
    const needsWork = OBSERVATION_TEMPLATES.filter((t) => t.sentiment === 'needs-work');
    expect(positive.length).toBeGreaterThanOrEqual(10);
    expect(needsWork.length).toBeGreaterThanOrEqual(10);
  });

  it('every template has a non-empty id, text, category, and emoji', () => {
    for (const t of OBSERVATION_TEMPLATES) {
      expect(t.id.trim(), `id missing on template ${JSON.stringify(t)}`).not.toBe('');
      expect(t.text.trim(), `text missing on template ${t.id}`).not.toBe('');
      expect(t.category.trim(), `category missing on template ${t.id}`).not.toBe('');
      expect(t.emoji.trim(), `emoji missing on template ${t.id}`).not.toBe('');
    }
  });

  it('all template ids are unique', () => {
    const ids = OBSERVATION_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('sentiment is either "positive" or "needs-work" on every template', () => {
    for (const t of OBSERVATION_TEMPLATES) {
      expect(['positive', 'needs-work']).toContain(t.sentiment);
    }
  });
});

// ─── ALL_OBSERVATION_TEMPLATES ────────────────────────────────────────────────

describe('ALL_OBSERVATION_TEMPLATES', () => {
  it('contains more templates than the generic set', () => {
    expect(ALL_OBSERVATION_TEMPLATES.length).toBeGreaterThan(OBSERVATION_TEMPLATES.length);
  });

  it('contains all generic templates', () => {
    for (const t of OBSERVATION_TEMPLATES) {
      expect(ALL_OBSERVATION_TEMPLATES).toContainEqual(t);
    }
  });

  it('all IDs across all sports are unique', () => {
    const ids = ALL_OBSERVATION_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every template in the full set passes data integrity checks', () => {
    for (const t of ALL_OBSERVATION_TEMPLATES) {
      expect(t.id.trim()).not.toBe('');
      expect(t.text.trim()).not.toBe('');
      expect(t.category.trim()).not.toBe('');
      expect(t.emoji.trim()).not.toBe('');
      expect(['positive', 'needs-work']).toContain(t.sentiment);
    }
  });

  it('all template texts are concise (max 40 chars)', () => {
    for (const t of ALL_OBSERVATION_TEMPLATES) {
      expect(
        t.text.length,
        `Template "${t.id}" text too long: "${t.text}"`,
      ).toBeLessThanOrEqual(40);
    }
  });
});

// ─── getTemplatesBySentiment — generic (no sport) ─────────────────────────────

describe('getTemplatesBySentiment', () => {
  it('returns only positive templates when asked for positive', () => {
    const results = getTemplatesBySentiment('positive');
    expect(results.length).toBeGreaterThan(0);
    for (const t of results) {
      expect(t.sentiment).toBe('positive');
    }
  });

  it('returns only needs-work templates when asked for needs-work', () => {
    const results = getTemplatesBySentiment('needs-work');
    expect(results.length).toBeGreaterThan(0);
    for (const t of results) {
      expect(t.sentiment).toBe('needs-work');
    }
  });

  it('positive + needs-work count equals generic template count when no sport given', () => {
    const total = OBSERVATION_TEMPLATES.length;
    const pos = getTemplatesBySentiment('positive').length;
    const nw = getTemplatesBySentiment('needs-work').length;
    expect(pos + nw).toBe(total);
  });

  it('preserves insertion order (first item matches first template with that sentiment)', () => {
    const firstPositive = OBSERVATION_TEMPLATES.find((t) => t.sentiment === 'positive')!;
    expect(getTemplatesBySentiment('positive')[0]).toEqual(firstPositive);

    const firstNW = OBSERVATION_TEMPLATES.find((t) => t.sentiment === 'needs-work')!;
    expect(getTemplatesBySentiment('needs-work')[0]).toEqual(firstNW);
  });

  it('returns an empty array if no template matches (defensive)', () => {
    const results = getTemplatesBySentiment('neutral' as any);
    expect(results).toEqual([]);
  });

  it('falls back to generic templates for unknown sport slugs', () => {
    const generic = getTemplatesBySentiment('positive');
    const unknown = getTemplatesBySentiment('positive', 'underwater-hockey');
    expect(unknown).toEqual(generic);
  });

  it('falls back to generic templates for basketball slug', () => {
    const generic = getTemplatesBySentiment('positive');
    const bball = getTemplatesBySentiment('positive', 'basketball');
    expect(bball).toEqual(generic);
  });
});

// ─── getTemplatesBySentiment — soccer ─────────────────────────────────────────

describe('getTemplatesBySentiment — soccer', () => {
  it('returns 10 positive soccer templates', () => {
    const results = getTemplatesBySentiment('positive', 'soccer');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('positive');
  });

  it('returns 10 needs-work soccer templates', () => {
    const results = getTemplatesBySentiment('needs-work', 'soccer');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('needs-work');
  });

  it('soccer templates differ from generic templates', () => {
    const soccer = getTemplatesBySentiment('positive', 'soccer');
    const generic = getTemplatesBySentiment('positive');
    expect(soccer).not.toEqual(generic);
  });

  it('soccer templates have IDs starting with "soccer-"', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'soccer'),
      ...getTemplatesBySentiment('needs-work', 'soccer'),
    ];
    for (const t of all) {
      expect(t.id.startsWith('soccer-')).toBe(true);
    }
  });

  it('soccer templates cover at least 5 distinct categories per sentiment', () => {
    const pos = getTemplatesBySentiment('positive', 'soccer');
    const nw = getTemplatesBySentiment('needs-work', 'soccer');
    expect(new Set(pos.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(nw.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });
});

// ─── getTemplatesBySentiment — flag_football ───────────────────────────────────

describe('getTemplatesBySentiment — flag_football', () => {
  it('returns 10 positive flag football templates', () => {
    const results = getTemplatesBySentiment('positive', 'flag_football');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('positive');
  });

  it('returns 10 needs-work flag football templates', () => {
    const results = getTemplatesBySentiment('needs-work', 'flag_football');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('needs-work');
  });

  it('flag football templates differ from generic templates', () => {
    const ff = getTemplatesBySentiment('positive', 'flag_football');
    const generic = getTemplatesBySentiment('positive');
    expect(ff).not.toEqual(generic);
  });

  it('flag football templates have IDs starting with "ff-"', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'flag_football'),
      ...getTemplatesBySentiment('needs-work', 'flag_football'),
    ];
    for (const t of all) {
      expect(t.id.startsWith('ff-')).toBe(true);
    }
  });

  it('flag football templates cover at least 5 distinct categories per sentiment', () => {
    const pos = getTemplatesBySentiment('positive', 'flag_football');
    const nw = getTemplatesBySentiment('needs-work', 'flag_football');
    expect(new Set(pos.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(nw.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });
});

// ─── findTemplateById ──────────────────────────────────────────────────────────

describe('findTemplateById', () => {
  it('finds an existing positive template by id', () => {
    const t = findTemplateById('pos-shooting');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.category).toBe('shooting');
  });

  it('finds an existing needs-work template by id', () => {
    const t = findTemplateById('nw-defense');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('needs-work');
    expect(t!.category).toBe('defense');
  });

  it('finds soccer template by id', () => {
    const t = findTemplateById('soccer-pos-touch');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.id).toBe('soccer-pos-touch');
  });

  it('finds flag football template by id', () => {
    const t = findTemplateById('ff-pos-routes');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.id).toBe('ff-pos-routes');
  });

  it('returns undefined for an unknown id', () => {
    expect(findTemplateById('unknown-id-xyz')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(findTemplateById('')).toBeUndefined();
  });

  it('returns the full template object (all fields intact)', () => {
    const template = findTemplateById('pos-hustle')!;
    expect(template).toMatchObject<Partial<ObservationTemplate>>({
      id: 'pos-hustle',
      sentiment: 'positive',
      category: 'hustle',
    });
    expect(typeof template.text).toBe('string');
    expect(typeof template.emoji).toBe('string');
  });

  it('can find every template across all sports by its own id', () => {
    for (const t of ALL_OBSERVATION_TEMPLATES) {
      expect(findTemplateById(t.id)).toEqual(t);
    }
  });
});

// ─── Key templates spot-check ──────────────────────────────────────────────────

describe('key templates content', () => {
  const positive = getTemplatesBySentiment('positive');
  const needsWork = getTemplatesBySentiment('needs-work');

  it('positive templates cover at least 6 distinct categories', () => {
    const cats = new Set(positive.map((t) => t.category));
    expect(cats.size).toBeGreaterThanOrEqual(6);
  });

  it('needs-work templates cover at least 6 distinct categories', () => {
    const cats = new Set(needsWork.map((t) => t.category));
    expect(cats.size).toBeGreaterThanOrEqual(6);
  });

  it('no template text is duplicated within generic set', () => {
    const texts = OBSERVATION_TEMPLATES.map((t) => t.text.toLowerCase().trim());
    const unique = new Set(texts);
    expect(unique.size).toBe(texts.length);
  });

  it('template texts are concise (max 40 chars)', () => {
    for (const t of OBSERVATION_TEMPLATES) {
      expect(t.text.length, `Template "${t.id}" text too long: "${t.text}"`).toBeLessThanOrEqual(40);
    }
  });
});
