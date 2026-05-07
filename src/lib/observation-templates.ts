/**
 * Quick observation templates — pre-defined one-tap observations coaches can
 * log during practice or games without speaking or typing. Each template has a
 * fixed sentiment and skill category so no AI segmentation is required.
 */

export type TemplateSentiment = 'positive' | 'needs-work';

export interface ObservationTemplate {
  id: string;
  text: string;
  sentiment: TemplateSentiment;
  /** Matches the category values used by the AI segmentation endpoint */
  category: string;
  emoji: string;
}

export const OBSERVATION_TEMPLATES: ObservationTemplate[] = [
  // ── Positive ────────────────────────────────────────────────────────────────
  { id: 'pos-shooting',    text: 'Great shooting form',       sentiment: 'positive',    category: 'shooting',    emoji: '🎯' },
  { id: 'pos-defense',     text: 'Excellent defense',         sentiment: 'positive',    category: 'defense',     emoji: '🛡️' },
  { id: 'pos-dribbling',   text: 'Strong ball handling',      sentiment: 'positive',    category: 'dribbling',   emoji: '⚡' },
  { id: 'pos-passing',     text: 'Great passing',             sentiment: 'positive',    category: 'passing',     emoji: '🤝' },
  { id: 'pos-hustle',      text: 'Outstanding hustle',        sentiment: 'positive',    category: 'hustle',      emoji: '🔥' },
  { id: 'pos-awareness',   text: 'Smart court vision',        sentiment: 'positive',    category: 'awareness',   emoji: '👁️' },
  { id: 'pos-teamwork',    text: 'Great communication',       sentiment: 'positive',    category: 'teamwork',    emoji: '📣' },
  { id: 'pos-footwork',    text: 'Excellent footwork',        sentiment: 'positive',    category: 'footwork',    emoji: '👟' },
  { id: 'pos-attitude',    text: 'Coachable attitude',        sentiment: 'positive',    category: 'attitude',    emoji: '⭐' },
  { id: 'pos-leadership',  text: 'Showed leadership',        sentiment: 'positive',    category: 'leadership',  emoji: '🏆' },

  // ── Needs work ───────────────────────────────────────────────────────────────
  { id: 'nw-shooting',     text: 'Shooting needs work',       sentiment: 'needs-work',  category: 'shooting',    emoji: '🎯' },
  { id: 'nw-defense',      text: 'Defensive positioning off', sentiment: 'needs-work',  category: 'defense',     emoji: '🛡️' },
  { id: 'nw-dribbling',    text: 'Ball handling struggles',   sentiment: 'needs-work',  category: 'dribbling',   emoji: '⚡' },
  { id: 'nw-passing',      text: 'Passing accuracy issues',   sentiment: 'needs-work',  category: 'passing',     emoji: '🤝' },
  { id: 'nw-hustle',       text: 'Needs more effort',         sentiment: 'needs-work',  category: 'hustle',      emoji: '🔥' },
  { id: 'nw-awareness',    text: 'Court awareness lacking',   sentiment: 'needs-work',  category: 'awareness',   emoji: '👁️' },
  { id: 'nw-teamwork',     text: 'Communication breakdown',   sentiment: 'needs-work',  category: 'teamwork',    emoji: '📣' },
  { id: 'nw-footwork',     text: 'Footwork needs attention',  sentiment: 'needs-work',  category: 'footwork',    emoji: '👟' },
  { id: 'nw-attitude',     text: 'Coachability concerns',     sentiment: 'needs-work',  category: 'attitude',    emoji: '⭐' },
  { id: 'nw-conditioning', text: 'Conditioning concerns',     sentiment: 'needs-work',  category: 'conditioning', emoji: '💪' },
];

/**
 * Sport-specific text overrides keyed by sport slug → template id → text.
 * Only the template text changes; id, category, sentiment, and emoji stay stable
 * so observations saved with sport-specific wording are still categorised correctly.
 */
const SPORT_TEXT_OVERRIDES: Record<string, Partial<Record<string, string>>> = {
  soccer: {
    'pos-shooting':  'Great shot on goal',
    'pos-dribbling': 'Strong ball control',
    'pos-awareness': 'Smart field vision',
    'nw-shooting':   'Shot technique needs work',
    'nw-dribbling':  'Ball control struggles',
    'nw-awareness':  'Field awareness lacking',
  },
  flagfootball: {
    'pos-shooting':  'Great throw accuracy',
    'pos-dribbling': 'Good ball-carry technique',
    'pos-awareness': 'Smart route/coverage read',
    'nw-shooting':   'Throwing mechanics off',
    'nw-dribbling':  'Ball security struggles',
    'nw-awareness':  'Coverage reading lacking',
  },
  volleyball: {
    'pos-shooting':  'Great spike/serve technique',
    'pos-dribbling': 'Good ball control',
    'pos-awareness': 'Smart court positioning',
    'nw-shooting':   'Spike/serve needs work',
    'nw-dribbling':  'Ball-control struggles',
    'nw-awareness':  'Positioning/rotation off',
  },
};

/**
 * Return templates with the given sentiment, optionally localised to a sport.
 * Pass `sportId` (e.g. `activeTeam.sport_id`) to get sport-appropriate language.
 */
export function getTemplatesBySentiment(
  sentiment: TemplateSentiment,
  sportId?: string
): ObservationTemplate[] {
  const base = OBSERVATION_TEMPLATES.filter((t) => t.sentiment === sentiment);
  const overrides = sportId ? SPORT_TEXT_OVERRIDES[sportId.toLowerCase()] : undefined;
  if (!overrides) return base;
  return base.map((t) =>
    overrides[t.id] ? { ...t, text: overrides[t.id]! } : t
  );
}

/** Look up a single template by its stable id. Returns undefined if not found. */
export function findTemplateById(id: string): ObservationTemplate | undefined {
  return OBSERVATION_TEMPLATES.find((t) => t.id === id);
}
