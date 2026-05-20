import { describe, it, expect } from 'vitest';
import {
  OBSERVATION_TEMPLATES,
  getTemplatesBySentiment,
  findTemplateById,
  buildQuickObsPayload,
  type ObservationTemplate,
  type QuickObsPayload,
} from '@/lib/observation-templates';

// ─── Template data integrity ───────────────────────────────────────────────────

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

// ─── getTemplatesBySentiment ───────────────────────────────────────────────────

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

  it('positive + needs-work count equals total template count', () => {
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
    // Cast to any to test robustness against unexpected input
    const results = getTemplatesBySentiment('neutral' as any);
    expect(results).toEqual([]);
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

  it('can find every template by its own id (no orphaned ids)', () => {
    for (const t of OBSERVATION_TEMPLATES) {
      expect(findTemplateById(t.id)).toEqual(t);
    }
  });
});

// ─── buildQuickObsPayload ─────────────────────────────────────────────────────

describe('buildQuickObsPayload', () => {
  const template = findTemplateById('pos-hustle')!;
  const player = { id: 'player-1', name: 'Marcus Johnson' };
  const base = {
    template,
    player,
    sentiment: 'positive' as const,
    sessionId: 'session-abc',
    teamId: 'team-xyz',
  };

  it('returns all required DB fields', () => {
    const payload = buildQuickObsPayload(base);
    expect(payload).toMatchObject<QuickObsPayload>({
      team_id: 'team-xyz',
      org_id: null,
      player_name: 'Marcus Johnson',
      player_id: 'player-1',
      session_id: 'session-abc',
      text: template.text,
      sentiment: 'positive',
      category: template.category,
      source: 'template',
    });
  });

  it('sets org_id to null when orgId is undefined', () => {
    const { org_id } = buildQuickObsPayload(base);
    expect(org_id).toBeNull();
  });

  it('sets org_id to null when orgId is explicitly null', () => {
    const { org_id } = buildQuickObsPayload({ ...base, orgId: null });
    expect(org_id).toBeNull();
  });

  it('passes orgId through when provided', () => {
    const { org_id } = buildQuickObsPayload({ ...base, orgId: 'org-999' });
    expect(org_id).toBe('org-999');
  });

  it('picks text and category from the template, not the sentiment param', () => {
    const nwTemplate = findTemplateById('nw-defense')!;
    const payload = buildQuickObsPayload({ ...base, template: nwTemplate, sentiment: 'needs-work' });
    expect(payload.text).toBe(nwTemplate.text);
    expect(payload.category).toBe(nwTemplate.category);
    expect(payload.sentiment).toBe('needs-work');
  });

  it('always sets source to "template"', () => {
    expect(buildQuickObsPayload(base).source).toBe('template');
  });

  it('works for every OBSERVATION_TEMPLATE without throwing', () => {
    for (const t of OBSERVATION_TEMPLATES) {
      expect(() =>
        buildQuickObsPayload({ ...base, template: t, sentiment: t.sentiment })
      ).not.toThrow();
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

  it('no template text is duplicated', () => {
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
