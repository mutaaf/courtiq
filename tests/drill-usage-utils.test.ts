import { describe, it, expect } from 'vitest';
import {
  countDistinctSessions,
  getLastUsedAt,
  formatLastUsed,
  countBySentiment,
  getPositiveRatio,
  hasUsageData,
  getRecentObservations,
  buildUsageSummaryLabel,
  getLastUsedColor,
  getSentimentClasses,
  resolvePlayerName,
  buildDrillUsageSummary,
  isDrillEffective,
  isDrillStruggle,
} from '@/lib/drill-usage-utils';
import type { Observation } from '@/types/database';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    player_id: null,
    team_id: 'team-1',
    coach_id: 'coach-1',
    session_id: 'session-1',
    recording_id: null,
    media_id: null,
    category: 'dribbling',
    sentiment: 'positive',
    text: 'Good footwork',
    raw_text: null,
    source: 'voice',
    ai_parsed: true,
    coach_edited: false,
    ai_interaction_id: null,
    skill_id: null,
    drill_id: 'drill-1',
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
    created_at: '2025-04-20T10:00:00Z',
    updated_at: '2025-04-20T10:00:00Z',
    ...overrides,
  };
}

const OBS_SESSION_A = makeObs({ id: 'o1', session_id: 'session-a', sentiment: 'positive', created_at: '2025-04-20T10:00:00Z' });
const OBS_SESSION_B_1 = makeObs({ id: 'o2', session_id: 'session-b', sentiment: 'needs-work', created_at: '2025-04-19T10:00:00Z' });
const OBS_SESSION_B_2 = makeObs({ id: 'o3', session_id: 'session-b', sentiment: 'needs-work', created_at: '2025-04-19T11:00:00Z' });
const OBS_SESSION_C = makeObs({ id: 'o4', session_id: 'session-c', sentiment: 'positive', created_at: '2025-04-21T10:00:00Z' });

// ─── countDistinctSessions ────────────────────────────────────────────────────

describe('countDistinctSessions', () => {
  it('returns 0 for empty array', () => {
    expect(countDistinctSessions([])).toBe(0);
  });

  it('returns 1 for a single observation', () => {
    expect(countDistinctSessions([OBS_SESSION_A])).toBe(1);
  });

  it('counts distinct session IDs', () => {
    expect(countDistinctSessions([OBS_SESSION_A, OBS_SESSION_B_1, OBS_SESSION_B_2])).toBe(2);
  });

  it('handles null session_id', () => {
    const nullSession = makeObs({ session_id: null });
    expect(countDistinctSessions([nullSession, OBS_SESSION_A])).toBe(1);
  });

  it('counts 3 distinct sessions', () => {
    expect(countDistinctSessions([OBS_SESSION_A, OBS_SESSION_B_1, OBS_SESSION_C])).toBe(3);
  });
});

// ─── getLastUsedAt ────────────────────────────────────────────────────────────

describe('getLastUsedAt', () => {
  it('returns null for empty array', () => {
    expect(getLastUsedAt([])).toBeNull();
  });

  it('returns the only timestamp for one obs', () => {
    expect(getLastUsedAt([OBS_SESSION_A])).toBe('2025-04-20T10:00:00Z');
  });

  it('returns the most recent timestamp', () => {
    const result = getLastUsedAt([OBS_SESSION_A, OBS_SESSION_C]);
    expect(result).toBe('2025-04-21T10:00:00Z');
  });

  it('works with unsorted order', () => {
    const result = getLastUsedAt([OBS_SESSION_C, OBS_SESSION_A, OBS_SESSION_B_1]);
    expect(result).toBe('2025-04-21T10:00:00Z');
  });
});

// ─── formatLastUsed ───────────────────────────────────────────────────────────

describe('formatLastUsed', () => {
  const NOW = new Date('2025-04-26T12:00:00Z');

  it('returns "Never used" for null', () => {
    expect(formatLastUsed(null, NOW)).toBe('Never used');
  });

  it('returns "Today" for same-day timestamp', () => {
    expect(formatLastUsed('2025-04-26T08:00:00Z', NOW)).toBe('Today');
  });

  it('returns "Yesterday" for 1-day-old timestamp', () => {
    expect(formatLastUsed('2025-04-25T08:00:00Z', NOW)).toBe('Yesterday');
  });

  it('returns "X days ago" for 2–6 day range', () => {
    expect(formatLastUsed('2025-04-22T12:00:00Z', NOW)).toBe('4 days ago');
  });

  it('returns "1 week ago" for 7–13 day range', () => {
    expect(formatLastUsed('2025-04-19T12:00:00Z', NOW)).toBe('1 week ago');
  });

  it('returns "X weeks ago" for 14–29 day range', () => {
    expect(formatLastUsed('2025-04-12T12:00:00Z', NOW)).toBe('2 weeks ago');
  });

  it('returns "1 month ago" for 30–59 day range', () => {
    expect(formatLastUsed('2025-03-27T12:00:00Z', NOW)).toBe('1 month ago');
  });

  it('returns "X months ago" for 60+ day range', () => {
    expect(formatLastUsed('2025-02-01T12:00:00Z', NOW)).toBe('2 months ago');
  });
});

// ─── countBySentiment ────────────────────────────────────────────────────────

describe('countBySentiment', () => {
  const obs = [OBS_SESSION_A, OBS_SESSION_B_1, OBS_SESSION_B_2, OBS_SESSION_C];

  it('counts positive observations', () => {
    expect(countBySentiment(obs, 'positive')).toBe(2);
  });

  it('counts needs-work observations', () => {
    expect(countBySentiment(obs, 'needs-work')).toBe(2);
  });

  it('returns 0 for missing sentiment', () => {
    expect(countBySentiment(obs, 'neutral')).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(countBySentiment([], 'positive')).toBe(0);
  });
});

// ─── getPositiveRatio ────────────────────────────────────────────────────────

describe('getPositiveRatio', () => {
  it('returns 0 for empty array', () => {
    expect(getPositiveRatio([])).toBe(0);
  });

  it('returns 1 for all-positive', () => {
    expect(getPositiveRatio([OBS_SESSION_A, OBS_SESSION_C])).toBe(1);
  });

  it('returns 0 for all-negative', () => {
    expect(getPositiveRatio([OBS_SESSION_B_1, OBS_SESSION_B_2])).toBe(0);
  });

  it('returns 0.5 for 50/50 split', () => {
    const obs = [OBS_SESSION_A, OBS_SESSION_B_1];
    expect(getPositiveRatio(obs)).toBe(0.5);
  });
});

// ─── hasUsageData ─────────────────────────────────────────────────────────────

describe('hasUsageData', () => {
  it('returns false for empty array', () => {
    expect(hasUsageData([])).toBe(false);
  });

  it('returns true when observations exist', () => {
    expect(hasUsageData([OBS_SESSION_A])).toBe(true);
  });
});

// ─── getRecentObservations ────────────────────────────────────────────────────

describe('getRecentObservations', () => {
  const obs = [OBS_SESSION_A, OBS_SESSION_B_1, OBS_SESSION_B_2, OBS_SESSION_C];

  it('returns first N observations', () => {
    expect(getRecentObservations(obs, 2)).toHaveLength(2);
  });

  it('returns all when N >= length', () => {
    expect(getRecentObservations(obs, 10)).toHaveLength(4);
  });

  it('returns empty array for empty input', () => {
    expect(getRecentObservations([], 5)).toHaveLength(0);
  });

  it('returns IDs of first 2', () => {
    const result = getRecentObservations(obs, 2);
    expect(result[0].id).toBe('o1');
    expect(result[1].id).toBe('o2');
  });
});

// ─── buildUsageSummaryLabel ───────────────────────────────────────────────────

describe('buildUsageSummaryLabel', () => {
  it('returns empty string for 0 sessions', () => {
    expect(buildUsageSummaryLabel(0)).toBe('');
  });

  it('returns singular for 1 session', () => {
    expect(buildUsageSummaryLabel(1)).toBe('Run once this season');
  });

  it('returns plural for 2 sessions', () => {
    expect(buildUsageSummaryLabel(2)).toBe('Run 2 times this season');
  });

  it('returns plural for 10 sessions', () => {
    expect(buildUsageSummaryLabel(10)).toBe('Run 10 times this season');
  });
});

// ─── getLastUsedColor ────────────────────────────────────────────────────────

describe('getLastUsedColor', () => {
  const NOW = new Date('2025-04-26T12:00:00Z');

  it('returns zinc for null', () => {
    expect(getLastUsedColor(null, NOW)).toBe('text-zinc-500');
  });

  it('returns emerald for within 7 days', () => {
    expect(getLastUsedColor('2025-04-22T12:00:00Z', NOW)).toBe('text-emerald-400');
  });

  it('returns amber for 8–21 days', () => {
    expect(getLastUsedColor('2025-04-10T12:00:00Z', NOW)).toBe('text-amber-400');
  });

  it('returns red for 22+ days', () => {
    expect(getLastUsedColor('2025-03-01T12:00:00Z', NOW)).toBe('text-red-400');
  });
});

// ─── getSentimentClasses ──────────────────────────────────────────────────────

describe('getSentimentClasses', () => {
  it('returns emerald classes for positive', () => {
    expect(getSentimentClasses('positive')).toContain('emerald');
  });

  it('returns red classes for needs-work', () => {
    expect(getSentimentClasses('needs-work')).toContain('red');
  });

  it('returns zinc classes for neutral/unknown', () => {
    expect(getSentimentClasses('neutral')).toContain('zinc');
  });
});

// ─── resolvePlayerName ───────────────────────────────────────────────────────

describe('resolvePlayerName', () => {
  const players = [
    { id: 'p1', name: 'Marcus' },
    { id: 'p2', name: 'Sofia' },
  ];

  it('returns null for null playerId', () => {
    expect(resolvePlayerName(null, players)).toBeNull();
  });

  it('resolves a known player', () => {
    expect(resolvePlayerName('p1', players)).toBe('Marcus');
  });

  it('returns null for unknown playerId', () => {
    expect(resolvePlayerName('p99', players)).toBeNull();
  });

  it('returns null when roster is empty', () => {
    expect(resolvePlayerName('p1', [])).toBeNull();
  });
});

// ─── buildDrillUsageSummary ───────────────────────────────────────────────────

describe('buildDrillUsageSummary', () => {
  it('returns zero summary for empty array', () => {
    const s = buildDrillUsageSummary([]);
    expect(s.sessionCount).toBe(0);
    expect(s.totalObservations).toBe(0);
    expect(s.positiveCount).toBe(0);
    expect(s.needsWorkCount).toBe(0);
    expect(s.lastUsedAt).toBeNull();
    expect(s.positiveRatio).toBe(0);
  });

  it('aggregates correctly for mixed observations', () => {
    const obs = [OBS_SESSION_A, OBS_SESSION_B_1, OBS_SESSION_B_2, OBS_SESSION_C];
    const s = buildDrillUsageSummary(obs);
    expect(s.sessionCount).toBe(3);
    expect(s.totalObservations).toBe(4);
    expect(s.positiveCount).toBe(2);
    expect(s.needsWorkCount).toBe(2);
    expect(s.lastUsedAt).toBe('2025-04-21T10:00:00Z');
    expect(s.positiveRatio).toBe(0.5);
  });
});

// ─── isDrillEffective ─────────────────────────────────────────────────────────

describe('isDrillEffective', () => {
  it('returns false when fewer than 3 sessions', () => {
    const s = buildDrillUsageSummary([OBS_SESSION_A, OBS_SESSION_C]);
    expect(isDrillEffective(s)).toBe(false);
  });

  it('returns false when positive ratio < 0.7', () => {
    const obs = Array.from({ length: 3 }, (_, i) =>
      makeObs({ id: `o${i}`, session_id: `s${i}`, sentiment: 'needs-work' }),
    );
    const s = buildDrillUsageSummary(obs);
    expect(isDrillEffective(s)).toBe(false);
  });

  it('returns true when 3+ sessions and ≥70% positive', () => {
    const obs = [
      makeObs({ id: 'a', session_id: 's1', sentiment: 'positive' }),
      makeObs({ id: 'b', session_id: 's2', sentiment: 'positive' }),
      makeObs({ id: 'c', session_id: 's3', sentiment: 'positive' }),
    ];
    const s = buildDrillUsageSummary(obs);
    expect(isDrillEffective(s)).toBe(true);
  });
});

// ─── isDrillStruggle ──────────────────────────────────────────────────────────

describe('isDrillStruggle', () => {
  it('returns false when fewer than 3 sessions', () => {
    const s = buildDrillUsageSummary([OBS_SESSION_B_1]);
    expect(isDrillStruggle(s)).toBe(false);
  });

  it('returns false when positive ratio ≥ 0.4', () => {
    const obs = [
      makeObs({ id: 'a', session_id: 's1', sentiment: 'positive' }),
      makeObs({ id: 'b', session_id: 's2', sentiment: 'positive' }),
      makeObs({ id: 'c', session_id: 's3', sentiment: 'needs-work' }),
    ];
    const s = buildDrillUsageSummary(obs);
    expect(isDrillStruggle(s)).toBe(false);
  });

  it('returns true when 3+ sessions and <40% positive', () => {
    const obs = [
      makeObs({ id: 'a', session_id: 's1', sentiment: 'needs-work' }),
      makeObs({ id: 'b', session_id: 's2', sentiment: 'needs-work' }),
      makeObs({ id: 'c', session_id: 's3', sentiment: 'needs-work' }),
    ];
    const s = buildDrillUsageSummary(obs);
    expect(isDrillStruggle(s)).toBe(true);
  });
});
