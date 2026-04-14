import { describe, it, expect } from 'vitest';
import {
  filterHighlighted,
  filterNonHighlighted,
  countHighlighted,
  hasHighlights,
  sortHighlightedFirst,
  buildHighlightsSummary,
} from '@/lib/observation-highlights';
import type { Observation } from '@/types/database';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeObs(overrides: Partial<Observation>): Observation {
  return {
    id: 'obs-1',
    player_id: 'player-1',
    team_id: 'team-1',
    coach_id: 'coach-1',
    session_id: null,
    recording_id: null,
    media_id: null,
    category: 'dribbling',
    sentiment: 'positive',
    text: 'Great handles',
    raw_text: null,
    source: 'voice',
    ai_parsed: true,
    coach_edited: false,
    ai_interaction_id: null,
    skill_id: null,
    drill_id: null,
    event_type: null,
    result: null,
    cv_metrics: null,
    cv_failure_tags: null,
    cv_identity_confidence: null,
    video_clip_ref: null,
    audio_annotation: null,
    source_modalities: null,
    local_id: null,
    synced_at: null,
    is_synced: true,
    is_highlighted: false,
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-01T10:00:00Z',
    ...overrides,
  };
}

const highlighted1 = makeObs({ id: 'h1', is_highlighted: true, text: 'Excellent dribbling', created_at: '2026-04-03T10:00:00Z' });
const highlighted2 = makeObs({ id: 'h2', is_highlighted: true, text: 'Great teamwork', sentiment: 'positive', created_at: '2026-04-01T10:00:00Z' });
const notHighlighted1 = makeObs({ id: 'n1', is_highlighted: false, text: 'Needs better positioning', sentiment: 'needs-work' });
const notHighlighted2 = makeObs({ id: 'n2', is_highlighted: false, text: 'Keep working on passing', sentiment: 'needs-work' });

const mixed = [notHighlighted1, highlighted1, notHighlighted2, highlighted2];
const allHighlighted = [highlighted1, highlighted2];
const noneHighlighted = [notHighlighted1, notHighlighted2];
const empty: Observation[] = [];

// ─── filterHighlighted ────────────────────────────────────────────────────────

describe('filterHighlighted', () => {
  it('returns only highlighted observations from a mixed list', () => {
    expect(filterHighlighted(mixed)).toEqual([highlighted1, highlighted2]);
  });

  it('returns all items when every observation is highlighted', () => {
    expect(filterHighlighted(allHighlighted)).toHaveLength(2);
  });

  it('returns empty array when no observations are highlighted', () => {
    expect(filterHighlighted(noneHighlighted)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(filterHighlighted(empty)).toEqual([]);
  });
});

// ─── filterNonHighlighted ─────────────────────────────────────────────────────

describe('filterNonHighlighted', () => {
  it('returns only non-highlighted observations from a mixed list', () => {
    expect(filterNonHighlighted(mixed)).toEqual([notHighlighted1, notHighlighted2]);
  });

  it('returns empty array when all observations are highlighted', () => {
    expect(filterNonHighlighted(allHighlighted)).toEqual([]);
  });

  it('returns all items when no observations are highlighted', () => {
    expect(filterNonHighlighted(noneHighlighted)).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(filterNonHighlighted(empty)).toEqual([]);
  });
});

// ─── countHighlighted ─────────────────────────────────────────────────────────

describe('countHighlighted', () => {
  it('counts highlighted observations correctly in a mixed list', () => {
    expect(countHighlighted(mixed)).toBe(2);
  });

  it('returns the total count when all observations are highlighted', () => {
    expect(countHighlighted(allHighlighted)).toBe(2);
  });

  it('returns 0 when no observations are highlighted', () => {
    expect(countHighlighted(noneHighlighted)).toBe(0);
  });

  it('returns 0 for empty input', () => {
    expect(countHighlighted(empty)).toBe(0);
  });
});

// ─── hasHighlights ────────────────────────────────────────────────────────────

describe('hasHighlights', () => {
  it('returns true when at least one observation is highlighted', () => {
    expect(hasHighlights(mixed)).toBe(true);
  });

  it('returns true when all observations are highlighted', () => {
    expect(hasHighlights(allHighlighted)).toBe(true);
  });

  it('returns false when no observations are highlighted', () => {
    expect(hasHighlights(noneHighlighted)).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(hasHighlights(empty)).toBe(false);
  });
});

// ─── sortHighlightedFirst ─────────────────────────────────────────────────────

describe('sortHighlightedFirst', () => {
  it('puts highlighted observations before non-highlighted ones', () => {
    const sorted = sortHighlightedFirst(mixed);
    const firstNonHighlightedIdx = sorted.findIndex((o) => !o.is_highlighted);
    const lastHighlightedIdx = [...sorted].reverse().findIndex((o) => o.is_highlighted);
    // All highlighted items appear before any non-highlighted item
    expect(firstNonHighlightedIdx).toBeGreaterThan(sorted.length - 1 - lastHighlightedIdx);
  });

  it('within highlighted group, sorts newest first', () => {
    const sorted = sortHighlightedFirst([highlighted2, highlighted1]); // h2=Apr1, h1=Apr3
    expect(sorted[0].id).toBe('h1'); // Apr 3 is newer
    expect(sorted[1].id).toBe('h2');
  });

  it('does not mutate the original array', () => {
    const original = [...mixed];
    sortHighlightedFirst(mixed);
    expect(mixed).toEqual(original);
  });

  it('returns empty array for empty input', () => {
    expect(sortHighlightedFirst(empty)).toEqual([]);
  });

  it('leaves single-item list unchanged', () => {
    expect(sortHighlightedFirst([highlighted1])).toEqual([highlighted1]);
  });
});

// ─── buildHighlightsSummary ───────────────────────────────────────────────────

describe('buildHighlightsSummary', () => {
  it('returns null when there are no highlighted observations', () => {
    expect(buildHighlightsSummary('Marcus', noneHighlighted)).toBeNull();
  });

  it('returns null for empty observations list', () => {
    expect(buildHighlightsSummary('Marcus', empty)).toBeNull();
  });

  it('includes player name as the first line', () => {
    const summary = buildHighlightsSummary('Marcus', allHighlighted)!;
    expect(summary.split('\n')[0]).toBe("Marcus's Highlights");
  });

  it('includes a line for each highlighted observation', () => {
    const summary = buildHighlightsSummary('Marcus', allHighlighted)!;
    const lines = summary.split('\n');
    // Header + 2 observations
    expect(lines).toHaveLength(3);
  });

  it('prefixes positive observations with ✓', () => {
    const obs = makeObs({ is_highlighted: true, sentiment: 'positive', text: 'Great catch' });
    const summary = buildHighlightsSummary('Alex', [obs])!;
    expect(summary).toContain('✓ Great catch');
  });

  it('prefixes needs-work observations with →', () => {
    const obs = makeObs({ is_highlighted: true, sentiment: 'needs-work', text: 'Watch footwork' });
    const summary = buildHighlightsSummary('Alex', [obs])!;
    expect(summary).toContain('→ Watch footwork');
  });

  it('prefixes neutral observations with –', () => {
    const obs = makeObs({ is_highlighted: true, sentiment: 'neutral', text: 'Consistent effort' });
    const summary = buildHighlightsSummary('Alex', [obs])!;
    expect(summary).toContain('– Consistent effort');
  });

  it('only includes highlighted observations in the summary', () => {
    const summary = buildHighlightsSummary('Marcus', mixed)!;
    expect(summary).toContain('Excellent dribbling');
    expect(summary).toContain('Great teamwork');
    expect(summary).not.toContain('Needs better positioning');
  });
});
