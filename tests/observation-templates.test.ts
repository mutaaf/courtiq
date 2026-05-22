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

// ─── getTemplatesBySentiment — volleyball ────────────────────────────────────

describe('getTemplatesBySentiment — volleyball', () => {
  it('returns 10 positive volleyball templates', () => {
    const results = getTemplatesBySentiment('positive', 'volleyball');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('positive');
  });

  it('returns 10 needs-work volleyball templates', () => {
    const results = getTemplatesBySentiment('needs-work', 'volleyball');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('needs-work');
  });

  it('volleyball templates differ from generic templates', () => {
    const vb = getTemplatesBySentiment('positive', 'volleyball');
    const generic = getTemplatesBySentiment('positive');
    expect(vb).not.toEqual(generic);
  });

  it('volleyball templates have IDs starting with "vb-"', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'volleyball'),
      ...getTemplatesBySentiment('needs-work', 'volleyball'),
    ];
    for (const t of all) {
      expect(t.id.startsWith('vb-')).toBe(true);
    }
  });

  it('volleyball templates cover at least 5 distinct categories per sentiment', () => {
    const pos = getTemplatesBySentiment('positive', 'volleyball');
    const nw = getTemplatesBySentiment('needs-work', 'volleyball');
    expect(new Set(pos.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(nw.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });

  it('volleyball templates differ from soccer templates', () => {
    const vb = getTemplatesBySentiment('positive', 'volleyball');
    const soccer = getTemplatesBySentiment('positive', 'soccer');
    expect(vb).not.toEqual(soccer);
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

// ─── getTemplatesBySentiment — baseball ───────────────────────────────────────

describe('getTemplatesBySentiment — baseball', () => {
  it('returns 10 positive baseball templates', () => {
    const results = getTemplatesBySentiment('positive', 'baseball');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('positive');
  });

  it('returns 10 needs-work baseball templates', () => {
    const results = getTemplatesBySentiment('needs-work', 'baseball');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('needs-work');
  });

  it('baseball templates differ from generic templates', () => {
    const bb = getTemplatesBySentiment('positive', 'baseball');
    const generic = getTemplatesBySentiment('positive');
    expect(bb).not.toEqual(generic);
  });

  it('baseball templates have IDs starting with "bb-"', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'baseball'),
      ...getTemplatesBySentiment('needs-work', 'baseball'),
    ];
    for (const t of all) {
      expect(t.id.startsWith('bb-')).toBe(true);
    }
  });

  it('baseball templates cover at least 5 distinct categories per sentiment', () => {
    const pos = getTemplatesBySentiment('positive', 'baseball');
    const nw = getTemplatesBySentiment('needs-work', 'baseball');
    expect(new Set(pos.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(nw.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });
});

// ─── getTemplatesBySentiment — softball ───────────────────────────────────────

describe('getTemplatesBySentiment — softball', () => {
  it('returns 10 positive softball templates', () => {
    const results = getTemplatesBySentiment('positive', 'softball');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('positive');
  });

  it('returns 10 needs-work softball templates', () => {
    const results = getTemplatesBySentiment('needs-work', 'softball');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('needs-work');
  });

  it('softball templates differ from generic templates', () => {
    const sb = getTemplatesBySentiment('positive', 'softball');
    const generic = getTemplatesBySentiment('positive');
    expect(sb).not.toEqual(generic);
  });

  it('softball templates have IDs starting with "bb-"', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'softball'),
      ...getTemplatesBySentiment('needs-work', 'softball'),
    ];
    for (const t of all) {
      expect(t.id.startsWith('bb-')).toBe(true);
    }
  });

  it('softball and baseball templates are identical (shared template set)', () => {
    const sb = getTemplatesBySentiment('positive', 'softball');
    const bb = getTemplatesBySentiment('positive', 'baseball');
    expect(sb).toEqual(bb);
  });

  it('softball templates cover at least 5 distinct categories per sentiment', () => {
    const pos = getTemplatesBySentiment('positive', 'softball');
    const nw = getTemplatesBySentiment('needs-work', 'softball');
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

  it('finds volleyball template by id', () => {
    const t = findTemplateById('vb-pos-serve');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.id).toBe('vb-pos-serve');
  });

  it('finds baseball template by id', () => {
    const t = findTemplateById('bb-pos-hitting');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.id).toBe('bb-pos-hitting');
  });

  it('finds softball template by id (shared set)', () => {
    const t = findTemplateById('bb-pos-fielding');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.category).toBe('defense');
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

// ─── getTemplatesBySentiment — lacrosse ───────────────────────────────────────

describe('getTemplatesBySentiment — lacrosse', () => {
  it('returns 10 positive lacrosse templates', () => {
    const results = getTemplatesBySentiment('positive', 'lacrosse');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('positive');
  });

  it('returns 10 needs-work lacrosse templates', () => {
    const results = getTemplatesBySentiment('needs-work', 'lacrosse');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('needs-work');
  });

  it('lacrosse templates differ from generic templates', () => {
    const lacrosse = getTemplatesBySentiment('positive', 'lacrosse');
    const generic = getTemplatesBySentiment('positive');
    expect(lacrosse).not.toEqual(generic);
  });

  it('lacrosse templates have IDs starting with "la-"', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'lacrosse'),
      ...getTemplatesBySentiment('needs-work', 'lacrosse'),
    ];
    for (const t of all) {
      expect(t.id.startsWith('la-')).toBe(true);
    }
  });

  it('lacrosse templates cover at least 5 distinct categories per sentiment', () => {
    const pos = getTemplatesBySentiment('positive', 'lacrosse');
    const nw = getTemplatesBySentiment('needs-work', 'lacrosse');
    expect(new Set(pos.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(nw.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });

  it('lacrosse templates differ from soccer and volleyball templates', () => {
    const lacrosse = getTemplatesBySentiment('positive', 'lacrosse');
    const soccer = getTemplatesBySentiment('positive', 'soccer');
    const vb = getTemplatesBySentiment('positive', 'volleyball');
    expect(lacrosse).not.toEqual(soccer);
    expect(lacrosse).not.toEqual(vb);
  });

  it('lacrosse templates include a ground ball / hustle template', () => {
    const nw = getTemplatesBySentiment('needs-work', 'lacrosse');
    const groundBall = nw.find((t) => t.category === 'hustle');
    expect(groundBall).toBeDefined();
  });

  it('lacrosse templates include a cradling / dribbling template', () => {
    const pos = getTemplatesBySentiment('positive', 'lacrosse');
    const cradle = pos.find((t) => t.category === 'dribbling');
    expect(cradle).toBeDefined();
  });

  it('findTemplateById can locate lacrosse templates by id', () => {
    const t = findTemplateById('la-pos-cradle');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.category).toBe('dribbling');

    const nwShot = findTemplateById('la-nw-shot');
    expect(nwShot).toBeDefined();
    expect(nwShot!.sentiment).toBe('needs-work');
    expect(nwShot!.category).toBe('shooting');
  });

  it('ALL_OBSERVATION_TEMPLATES includes all lacrosse templates', () => {
    const lacrosse = getTemplatesBySentiment('positive', 'lacrosse');
    for (const t of lacrosse) {
      expect(ALL_OBSERVATION_TEMPLATES).toContainEqual(t);
    }
  });

  it('lacrosse template texts are concise (max 40 chars)', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'lacrosse'),
      ...getTemplatesBySentiment('needs-work', 'lacrosse'),
    ];
    for (const t of all) {
      expect(t.text.length, `Lacrosse template "${t.id}" text too long: "${t.text}"`).toBeLessThanOrEqual(40);
    }
  });
});

// ─── getTemplatesBySentiment — swimming ───────────────────────────────────────

describe('getTemplatesBySentiment — swimming', () => {
  it('returns 10 positive swimming templates', () => {
    const results = getTemplatesBySentiment('positive', 'swimming');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('positive');
  });

  it('returns 10 needs-work swimming templates', () => {
    const results = getTemplatesBySentiment('needs-work', 'swimming');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('needs-work');
  });

  it('swimming templates differ from generic templates', () => {
    const swim = getTemplatesBySentiment('positive', 'swimming');
    const generic = getTemplatesBySentiment('positive');
    expect(swim).not.toEqual(generic);
  });

  it('swimming templates have IDs starting with "sw-"', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'swimming'),
      ...getTemplatesBySentiment('needs-work', 'swimming'),
    ];
    for (const t of all) {
      expect(t.id.startsWith('sw-')).toBe(true);
    }
  });

  it('swimming templates cover at least 5 distinct categories per sentiment', () => {
    const pos = getTemplatesBySentiment('positive', 'swimming');
    const nw = getTemplatesBySentiment('needs-work', 'swimming');
    expect(new Set(pos.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(nw.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });

  it('swimming templates differ from soccer and lacrosse templates', () => {
    const swim = getTemplatesBySentiment('positive', 'swimming');
    const soccer = getTemplatesBySentiment('positive', 'soccer');
    const lacrosse = getTemplatesBySentiment('positive', 'lacrosse');
    expect(swim).not.toEqual(soccer);
    expect(swim).not.toEqual(lacrosse);
  });

  it('swimming templates include a conditioning template', () => {
    const pos = getTemplatesBySentiment('positive', 'swimming');
    const conditioning = pos.find((t) => t.category === 'conditioning');
    expect(conditioning).toBeDefined();
  });

  it('swimming templates include a footwork (kick/turn) template', () => {
    const pos = getTemplatesBySentiment('positive', 'swimming');
    const footwork = pos.find((t) => t.category === 'footwork');
    expect(footwork).toBeDefined();
  });

  it('findTemplateById can locate swimming templates by id', () => {
    const t = findTemplateById('sw-pos-stroke');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.category).toBe('shooting');

    const nwTurn = findTemplateById('sw-nw-turn');
    expect(nwTurn).toBeDefined();
    expect(nwTurn!.sentiment).toBe('needs-work');
    expect(nwTurn!.category).toBe('footwork');
  });

  it('ALL_OBSERVATION_TEMPLATES includes all swimming templates', () => {
    const swim = getTemplatesBySentiment('positive', 'swimming');
    for (const t of swim) {
      expect(ALL_OBSERVATION_TEMPLATES).toContainEqual(t);
    }
  });

  it('swimming template texts are concise (max 40 chars)', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'swimming'),
      ...getTemplatesBySentiment('needs-work', 'swimming'),
    ];
    for (const t of all) {
      expect(t.text.length, `Swimming template "${t.id}" text too long: "${t.text}"`).toBeLessThanOrEqual(40);
    }
  });
});

// ─── getTemplatesBySentiment — gymnastics ─────────────────────────────────────

describe('getTemplatesBySentiment — gymnastics', () => {
  it('returns 10 positive gymnastics templates', () => {
    const results = getTemplatesBySentiment('positive', 'gymnastics');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('positive');
  });

  it('returns 10 needs-work gymnastics templates', () => {
    const results = getTemplatesBySentiment('needs-work', 'gymnastics');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('needs-work');
  });

  it('gymnastics templates differ from generic templates', () => {
    const gym = getTemplatesBySentiment('positive', 'gymnastics');
    const generic = getTemplatesBySentiment('positive');
    expect(gym).not.toEqual(generic);
  });

  it('gymnastics templates have IDs starting with "gym-"', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'gymnastics'),
      ...getTemplatesBySentiment('needs-work', 'gymnastics'),
    ];
    for (const t of all) {
      expect(t.id.startsWith('gym-')).toBe(true);
    }
  });

  it('gymnastics templates cover at least 5 distinct categories per sentiment', () => {
    const pos = getTemplatesBySentiment('positive', 'gymnastics');
    const nw = getTemplatesBySentiment('needs-work', 'gymnastics');
    expect(new Set(pos.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(nw.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });

  it('gymnastics templates differ from soccer, swimming, and tennis templates', () => {
    const gym = getTemplatesBySentiment('positive', 'gymnastics');
    const soccer = getTemplatesBySentiment('positive', 'soccer');
    const swim = getTemplatesBySentiment('positive', 'swimming');
    const tennis = getTemplatesBySentiment('positive', 'tennis');
    expect(gym).not.toEqual(soccer);
    expect(gym).not.toEqual(swim);
    expect(gym).not.toEqual(tennis);
  });

  it('gymnastics templates include a tumbling / shooting template', () => {
    const pos = getTemplatesBySentiment('positive', 'gymnastics');
    const tumbling = pos.find((t) => t.id === 'gym-pos-tumbling');
    expect(tumbling).toBeDefined();
    expect(tumbling!.category).toBe('shooting');
  });

  it('gymnastics templates include a balance / awareness template', () => {
    const pos = getTemplatesBySentiment('positive', 'gymnastics');
    const balance = pos.find((t) => t.category === 'awareness');
    expect(balance).toBeDefined();
  });

  it('gymnastics templates include a conditioning / flexibility template', () => {
    const pos = getTemplatesBySentiment('positive', 'gymnastics');
    const flex = pos.find((t) => t.category === 'conditioning');
    expect(flex).toBeDefined();
  });

  it('gymnastics templates include a footwork / landing template', () => {
    const pos = getTemplatesBySentiment('positive', 'gymnastics');
    const landing = pos.find((t) => t.category === 'footwork');
    expect(landing).toBeDefined();
  });

  it('findTemplateById can locate gymnastics templates by id', () => {
    const t = findTemplateById('gym-pos-tumbling');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.category).toBe('shooting');

    const nwBalance = findTemplateById('gym-nw-balance');
    expect(nwBalance).toBeDefined();
    expect(nwBalance!.sentiment).toBe('needs-work');
    expect(nwBalance!.category).toBe('awareness');
  });

  it('ALL_OBSERVATION_TEMPLATES includes all gymnastics templates', () => {
    const gym = getTemplatesBySentiment('positive', 'gymnastics');
    for (const t of gym) {
      expect(ALL_OBSERVATION_TEMPLATES).toContainEqual(t);
    }
  });

  it('gymnastics template texts are concise (max 40 chars)', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'gymnastics'),
      ...getTemplatesBySentiment('needs-work', 'gymnastics'),
    ];
    for (const t of all) {
      expect(t.text.length, `Gymnastics template "${t.id}" text too long: "${t.text}"`).toBeLessThanOrEqual(40);
    }
  });
});

// ─── getTemplatesBySentiment — tennis ─────────────────────────────────────────

describe('getTemplatesBySentiment — tennis', () => {
  it('returns 10 positive tennis templates', () => {
    const results = getTemplatesBySentiment('positive', 'tennis');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('positive');
  });

  it('returns 10 needs-work tennis templates', () => {
    const results = getTemplatesBySentiment('needs-work', 'tennis');
    expect(results.length).toBe(10);
    for (const t of results) expect(t.sentiment).toBe('needs-work');
  });

  it('tennis templates differ from generic templates', () => {
    const tennis = getTemplatesBySentiment('positive', 'tennis');
    const generic = getTemplatesBySentiment('positive');
    expect(tennis).not.toEqual(generic);
  });

  it('tennis templates have IDs starting with "tn-"', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'tennis'),
      ...getTemplatesBySentiment('needs-work', 'tennis'),
    ];
    for (const t of all) {
      expect(t.id.startsWith('tn-')).toBe(true);
    }
  });

  it('tennis templates cover at least 5 distinct categories per sentiment', () => {
    const pos = getTemplatesBySentiment('positive', 'tennis');
    const nw = getTemplatesBySentiment('needs-work', 'tennis');
    expect(new Set(pos.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(nw.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });

  it('tennis templates differ from soccer and swimming templates', () => {
    const tennis = getTemplatesBySentiment('positive', 'tennis');
    const soccer = getTemplatesBySentiment('positive', 'soccer');
    const swim = getTemplatesBySentiment('positive', 'swimming');
    expect(tennis).not.toEqual(soccer);
    expect(tennis).not.toEqual(swim);
  });

  it('tennis templates include a serve / shooting template', () => {
    const pos = getTemplatesBySentiment('positive', 'tennis');
    const serve = pos.find((t) => t.id === 'tn-pos-serve');
    expect(serve).toBeDefined();
    expect(serve!.category).toBe('shooting');
  });

  it('tennis templates include an attitude / composure template', () => {
    const pos = getTemplatesBySentiment('positive', 'tennis');
    const composure = pos.find((t) => t.category === 'attitude');
    expect(composure).toBeDefined();
  });

  it('findTemplateById can locate tennis templates by id', () => {
    const t = findTemplateById('tn-pos-serve');
    expect(t).toBeDefined();
    expect(t!.sentiment).toBe('positive');
    expect(t!.category).toBe('shooting');

    const nwFoot = findTemplateById('tn-nw-footwork');
    expect(nwFoot).toBeDefined();
    expect(nwFoot!.sentiment).toBe('needs-work');
    expect(nwFoot!.category).toBe('footwork');
  });

  it('ALL_OBSERVATION_TEMPLATES includes all tennis templates', () => {
    const tennis = getTemplatesBySentiment('positive', 'tennis');
    for (const t of tennis) {
      expect(ALL_OBSERVATION_TEMPLATES).toContainEqual(t);
    }
  });

  it('tennis template texts are concise (max 40 chars)', () => {
    const all = [
      ...getTemplatesBySentiment('positive', 'tennis'),
      ...getTemplatesBySentiment('needs-work', 'tennis'),
    ];
    for (const t of all) {
      expect(t.text.length, `Tennis template "${t.id}" text too long: "${t.text}"`).toBeLessThanOrEqual(40);
    }
  });
});
