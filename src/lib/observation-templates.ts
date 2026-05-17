/**
 * Quick observation templates — pre-defined one-tap observations coaches can
 * log during practice or games without speaking or typing. Each template has a
 * fixed sentiment and skill category so no AI segmentation is required.
 *
 * Sport-specific sets are provided for basketball (default), soccer, and
 * flag football. Coaches see templates relevant to their sport, improving
 * category accuracy and making one-tap capture feel tailored.
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

// ── Basketball (generic default) ──────────────────────────────────────────────

export const OBSERVATION_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'pos-shooting',    text: 'Great shooting form',       sentiment: 'positive',    category: 'shooting',    emoji: '🎯' },
  { id: 'pos-defense',     text: 'Excellent defense',         sentiment: 'positive',    category: 'defense',     emoji: '🛡️' },
  { id: 'pos-dribbling',   text: 'Strong ball handling',      sentiment: 'positive',    category: 'dribbling',   emoji: '⚡' },
  { id: 'pos-passing',     text: 'Great passing',             sentiment: 'positive',    category: 'passing',     emoji: '🤝' },
  { id: 'pos-hustle',      text: 'Outstanding hustle',        sentiment: 'positive',    category: 'hustle',      emoji: '🔥' },
  { id: 'pos-awareness',   text: 'Smart court vision',        sentiment: 'positive',    category: 'awareness',   emoji: '👁️' },
  { id: 'pos-teamwork',    text: 'Great communication',       sentiment: 'positive',    category: 'teamwork',    emoji: '📣' },
  { id: 'pos-footwork',    text: 'Excellent footwork',        sentiment: 'positive',    category: 'footwork',    emoji: '👟' },
  { id: 'pos-attitude',    text: 'Coachable attitude',        sentiment: 'positive',    category: 'attitude',    emoji: '⭐' },
  { id: 'pos-leadership',  text: 'Showed leadership',         sentiment: 'positive',    category: 'leadership',  emoji: '🏆' },
  // Needs work
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

// ── Soccer ────────────────────────────────────────────────────────────────────

const SOCCER_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'soccer-pos-touch',    text: 'Strong first touch',        sentiment: 'positive',   category: 'dribbling',   emoji: '⚡' },
  { id: 'soccer-pos-shot',     text: 'Accurate shot on goal',     sentiment: 'positive',   category: 'shooting',    emoji: '🎯' },
  { id: 'soccer-pos-defense',  text: 'Excellent defending',       sentiment: 'positive',   category: 'defense',     emoji: '🛡️' },
  { id: 'soccer-pos-runs',     text: 'Smart off-ball runs',       sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'soccer-pos-passing',  text: 'Great through ball',        sentiment: 'positive',   category: 'passing',     emoji: '🤝' },
  { id: 'soccer-pos-hustle',   text: 'High work rate',            sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'soccer-pos-position', text: 'Excellent positioning',     sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'soccer-pos-teamwork', text: 'Great communication',       sentiment: 'positive',   category: 'teamwork',    emoji: '📣' },
  { id: 'soccer-pos-attitude', text: 'Coachable attitude',        sentiment: 'positive',   category: 'attitude',    emoji: '⭐' },
  { id: 'soccer-pos-leader',   text: 'Showed leadership',         sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  // Needs work
  { id: 'soccer-nw-touch',     text: 'First touch needs work',    sentiment: 'needs-work', category: 'dribbling',   emoji: '⚡' },
  { id: 'soccer-nw-shot',      text: 'Shot accuracy off',         sentiment: 'needs-work', category: 'shooting',    emoji: '🎯' },
  { id: 'soccer-nw-defense',   text: 'Defensive shape off',       sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'soccer-nw-runs',      text: 'Off-ball movement',         sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'soccer-nw-passing',   text: 'Passing accuracy',          sentiment: 'needs-work', category: 'passing',     emoji: '🤝' },
  { id: 'soccer-nw-hustle',    text: 'Needs more effort',         sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'soccer-nw-position',  text: 'Positional sense',          sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'soccer-nw-teamwork',  text: 'Communication breakdown',   sentiment: 'needs-work', category: 'teamwork',    emoji: '📣' },
  { id: 'soccer-nw-attitude',  text: 'Coachability concerns',     sentiment: 'needs-work', category: 'attitude',    emoji: '⭐' },
  { id: 'soccer-nw-condition', text: 'Conditioning concerns',     sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Flag Football ─────────────────────────────────────────────────────────────

const FLAG_FOOTBALL_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'ff-pos-routes',    text: 'Great route running',        sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'ff-pos-flagpull',  text: 'Strong flag pull',           sentiment: 'positive',   category: 'defense',     emoji: '🛡️' },
  { id: 'ff-pos-throw',     text: 'Accurate throw',             sentiment: 'positive',   category: 'shooting',    emoji: '🎯' },
  { id: 'ff-pos-catch',     text: 'Excellent catch',            sentiment: 'positive',   category: 'passing',     emoji: '🤝' },
  { id: 'ff-pos-read',      text: 'Smart play read',            sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'ff-pos-hustle',    text: 'Outstanding hustle',         sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'ff-pos-teamwork',  text: 'Great teamwork',             sentiment: 'positive',   category: 'teamwork',    emoji: '📣' },
  { id: 'ff-pos-footwork',  text: 'Excellent footwork',         sentiment: 'positive',   category: 'footwork',    emoji: '👟' },
  { id: 'ff-pos-attitude',  text: 'Coachable attitude',         sentiment: 'positive',   category: 'attitude',    emoji: '⭐' },
  { id: 'ff-pos-leader',    text: 'Showed leadership',          sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  // Needs work
  { id: 'ff-nw-routes',     text: 'Route running needs work',   sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'ff-nw-flagpull',   text: 'Flag pull technique',        sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'ff-nw-throw',      text: 'Throw accuracy',             sentiment: 'needs-work', category: 'shooting',    emoji: '🎯' },
  { id: 'ff-nw-catch',      text: 'Catching issues',            sentiment: 'needs-work', category: 'passing',     emoji: '🤝' },
  { id: 'ff-nw-read',       text: 'Reading defense',            sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'ff-nw-hustle',     text: 'More effort needed',         sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'ff-nw-teamwork',   text: 'Communication breakdown',    sentiment: 'needs-work', category: 'teamwork',    emoji: '📣' },
  { id: 'ff-nw-footwork',   text: 'Footwork needs work',        sentiment: 'needs-work', category: 'footwork',    emoji: '👟' },
  { id: 'ff-nw-attitude',   text: 'Coachability concerns',      sentiment: 'needs-work', category: 'attitude',    emoji: '⭐' },
  { id: 'ff-nw-condition',  text: 'Conditioning concerns',      sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Sport lookup map ──────────────────────────────────────────────────────────

const SPORT_TEMPLATES: Record<string, ObservationTemplate[]> = {
  soccer: SOCCER_TEMPLATES,
  flag_football: FLAG_FOOTBALL_TEMPLATES,
  // basketball maps to the default OBSERVATION_TEMPLATES (handled in the function)
};

/** All templates across every sport — used for cross-sport lookups by ID. */
export const ALL_OBSERVATION_TEMPLATES: ObservationTemplate[] = [
  ...OBSERVATION_TEMPLATES,
  ...SOCCER_TEMPLATES,
  ...FLAG_FOOTBALL_TEMPLATES,
];

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Return only templates with the given sentiment, filtered for the coach's
 * sport. Falls back to the generic basketball templates when the sport is
 * not recognised or not provided.
 */
export function getTemplatesBySentiment(
  sentiment: TemplateSentiment,
  sportSlug?: string,
): ObservationTemplate[] {
  const pool = (sportSlug ? SPORT_TEMPLATES[sportSlug] : undefined) ?? OBSERVATION_TEMPLATES;
  return pool.filter((t) => t.sentiment === sentiment);
}

/** Look up a single template by its stable id, searching across all sports. */
export function findTemplateById(id: string): ObservationTemplate | undefined {
  return ALL_OBSERVATION_TEMPLATES.find((t) => t.id === id);
}
