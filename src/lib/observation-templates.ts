/**
 * Quick observation templates — pre-defined one-tap observations coaches can
 * log during practice or games without speaking or typing. Each template has a
 * fixed sentiment and skill category so no AI segmentation is required.
 *
 * Sport-specific template sets are provided for basketball, soccer, and flag
 * football. Generic (sport-agnostic) templates are used as a fallback for
 * unrecognised sport IDs.
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

// ── Basketball / generic (default) ──────────────────────────────────────────

export const OBSERVATION_TEMPLATES: ObservationTemplate[] = [
  // ── Positive ──────────────────────────────────────────────────────────────
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

  // ── Needs work ────────────────────────────────────────────────────────────
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

// ── Soccer ───────────────────────────────────────────────────────────────────

const SOCCER_TEMPLATES: ObservationTemplate[] = [
  // ── Positive ──────────────────────────────────────────────────────────────
  { id: 'soc-pos-touch',       text: 'Great first touch',           sentiment: 'positive',   category: 'dribbling',    emoji: '⚽' },
  { id: 'soc-pos-defense',     text: 'Excellent defensive tracking', sentiment: 'positive',   category: 'defense',      emoji: '🛡️' },
  { id: 'soc-pos-passing',     text: 'Strong through ball',         sentiment: 'positive',   category: 'passing',      emoji: '🎯' },
  { id: 'soc-pos-teamwork',    text: 'Great team communication',    sentiment: 'positive',   category: 'teamwork',     emoji: '📣' },
  { id: 'soc-pos-hustle',      text: 'Outstanding hustle',          sentiment: 'positive',   category: 'hustle',       emoji: '🔥' },
  { id: 'soc-pos-awareness',   text: 'Smart field vision',          sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'soc-pos-leadership',  text: 'Led the team well',           sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  { id: 'soc-pos-positioning', text: 'Excellent positioning',       sentiment: 'positive',   category: 'footwork',    emoji: '👟' },
  { id: 'soc-pos-attitude',    text: 'Coachable attitude',          sentiment: 'positive',   category: 'attitude',    emoji: '⭐' },
  { id: 'soc-pos-finishing',   text: 'Strong finishing',            sentiment: 'positive',   category: 'shooting',    emoji: '✅' },

  // ── Needs work ────────────────────────────────────────────────────────────
  { id: 'soc-nw-touch',        text: 'First touch needs work',      sentiment: 'needs-work', category: 'dribbling',   emoji: '⚽' },
  { id: 'soc-nw-defense',      text: 'Defensive tracking off',      sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'soc-nw-passing',      text: 'Passing accuracy issues',     sentiment: 'needs-work', category: 'passing',     emoji: '🎯' },
  { id: 'soc-nw-teamwork',     text: 'Communication breakdown',     sentiment: 'needs-work', category: 'teamwork',    emoji: '📣' },
  { id: 'soc-nw-hustle',       text: 'Needs to track back harder',  sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'soc-nw-awareness',    text: 'Field awareness lacking',     sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'soc-nw-positioning',  text: 'Positioning needs attention', sentiment: 'needs-work', category: 'footwork',    emoji: '👟' },
  { id: 'soc-nw-finishing',    text: 'Shooting accuracy needs work', sentiment: 'needs-work', category: 'shooting',   emoji: '✅' },
  { id: 'soc-nw-attitude',     text: 'Coachability concerns',       sentiment: 'needs-work', category: 'attitude',    emoji: '⭐' },
  { id: 'soc-nw-conditioning', text: 'Conditioning concerns',       sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Volleyball ───────────────────────────────────────────────────────────────

const VOLLEYBALL_TEMPLATES: ObservationTemplate[] = [
  // ── Positive ──────────────────────────────────────────────────────────────
  { id: 'vb-pos-serve',       text: 'Strong, accurate serve',       sentiment: 'positive',   category: 'shooting',    emoji: '🏐' },
  { id: 'vb-pos-setting',     text: 'Great set — high and precise', sentiment: 'positive',   category: 'passing',     emoji: '🎯' },
  { id: 'vb-pos-passing',     text: 'Excellent platform passing',   sentiment: 'positive',   category: 'passing',     emoji: '🤝' },
  { id: 'vb-pos-defense',     text: 'Solid defensive dig',         sentiment: 'positive',   category: 'defense',     emoji: '🛡️' },
  { id: 'vb-pos-blocking',    text: 'Good net block',               sentiment: 'positive',   category: 'defense',     emoji: '✋' },
  { id: 'vb-pos-hustle',      text: 'Outstanding court hustle',     sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'vb-pos-communication', text: 'Called the ball — great communication', sentiment: 'positive', category: 'teamwork', emoji: '📣' },
  { id: 'vb-pos-footwork',    text: 'Quick footwork to the ball',  sentiment: 'positive',   category: 'footwork',    emoji: '👟' },
  { id: 'vb-pos-attitude',    text: 'Coachable attitude',           sentiment: 'positive',   category: 'attitude',    emoji: '⭐' },
  { id: 'vb-pos-leadership',  text: 'Led the team through a tough rally', sentiment: 'positive', category: 'leadership', emoji: '🏆' },

  // ── Needs work ────────────────────────────────────────────────────────────
  { id: 'vb-nw-serve',        text: 'Serve accuracy needs work',   sentiment: 'needs-work', category: 'shooting',    emoji: '🏐' },
  { id: 'vb-nw-setting',      text: 'Setting needs more precision', sentiment: 'needs-work', category: 'passing',     emoji: '🎯' },
  { id: 'vb-nw-passing',      text: 'Platform passing off target', sentiment: 'needs-work', category: 'passing',     emoji: '🤝' },
  { id: 'vb-nw-defense',      text: 'Defensive positioning off',  sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'vb-nw-blocking',     text: 'Blocking technique needs work', sentiment: 'needs-work', category: 'defense',   emoji: '✋' },
  { id: 'vb-nw-hustle',       text: 'Needs to pursue the ball harder', sentiment: 'needs-work', category: 'hustle',  emoji: '🔥' },
  { id: 'vb-nw-communication', text: 'Not calling the ball — communication gap', sentiment: 'needs-work', category: 'teamwork', emoji: '📣' },
  { id: 'vb-nw-footwork',     text: 'Footwork to ball needs work', sentiment: 'needs-work', category: 'footwork',   emoji: '👟' },
  { id: 'vb-nw-attitude',     text: 'Coachability concerns',       sentiment: 'needs-work', category: 'attitude',   emoji: '⭐' },
  { id: 'vb-nw-conditioning', text: 'Conditioning concerns',       sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Flag Football ────────────────────────────────────────────────────────────

const FLAG_FOOTBALL_TEMPLATES: ObservationTemplate[] = [
  // ── Positive ──────────────────────────────────────────────────────────────
  { id: 'ff-pos-routes',      text: 'Great route running',         sentiment: 'positive',   category: 'footwork',    emoji: '🏈' },
  { id: 'ff-pos-defense',     text: 'Excellent flag pulling',      sentiment: 'positive',   category: 'defense',     emoji: '🛡️' },
  { id: 'ff-pos-awareness',   text: 'Smart read of defense',       sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'ff-pos-passing',     text: 'Strong throw / snap',         sentiment: 'positive',   category: 'passing',     emoji: '🎯' },
  { id: 'ff-pos-hustle',      text: 'Outstanding hustle',          sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'ff-pos-catching',    text: 'Great hands — clean catch',   sentiment: 'positive',   category: 'dribbling',   emoji: '🙌' },
  { id: 'ff-pos-leadership',  text: 'Led the offense well',        sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  { id: 'ff-pos-agility',     text: 'Excellent agility',           sentiment: 'positive',   category: 'footwork',    emoji: '👟' },
  { id: 'ff-pos-attitude',    text: 'Coachable attitude',          sentiment: 'positive',   category: 'attitude',    emoji: '⭐' },
  { id: 'ff-pos-teamwork',    text: 'Great team communication',    sentiment: 'positive',   category: 'teamwork',    emoji: '📣' },

  // ── Needs work ────────────────────────────────────────────────────────────
  { id: 'ff-nw-routes',       text: 'Route running needs work',    sentiment: 'needs-work', category: 'footwork',    emoji: '🏈' },
  { id: 'ff-nw-defense',      text: 'Flag pulling struggles',      sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'ff-nw-awareness',    text: 'Reading the defense',         sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'ff-nw-passing',      text: 'Snap / throw accuracy',       sentiment: 'needs-work', category: 'passing',     emoji: '🎯' },
  { id: 'ff-nw-hustle',       text: 'Needs more effort',           sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'ff-nw-catching',     text: 'Catching needs work',         sentiment: 'needs-work', category: 'dribbling',   emoji: '🙌' },
  { id: 'ff-nw-agility',      text: 'Footwork / agility',          sentiment: 'needs-work', category: 'footwork',    emoji: '👟' },
  { id: 'ff-nw-teamwork',     text: 'Communication breakdown',     sentiment: 'needs-work', category: 'teamwork',    emoji: '📣' },
  { id: 'ff-nw-attitude',     text: 'Coachability concerns',       sentiment: 'needs-work', category: 'attitude',    emoji: '⭐' },
  { id: 'ff-nw-conditioning', text: 'Conditioning concerns',       sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Sport → template map ─────────────────────────────────────────────────────

const SPORT_TEMPLATES: Record<string, ObservationTemplate[]> = {
  soccer: SOCCER_TEMPLATES,
  flag_football: FLAG_FOOTBALL_TEMPLATES,
  volleyball: VOLLEYBALL_TEMPLATES,
};

/**
 * Return the full template set for the given sport (falls back to the
 * basketball/generic set for unrecognised sport IDs).
 */
export function getTemplatesForSport(sportId?: string | null): ObservationTemplate[] {
  if (!sportId) return OBSERVATION_TEMPLATES;
  return SPORT_TEMPLATES[sportId.toLowerCase()] ?? OBSERVATION_TEMPLATES;
}

/** Return only templates with the given sentiment for the given sport. */
export function getTemplatesBySentiment(
  sentiment: TemplateSentiment,
  sportId?: string | null
): ObservationTemplate[] {
  return getTemplatesForSport(sportId).filter((t) => t.sentiment === sentiment);
}

/** Look up a single template by its stable id (checks all sport sets). */
export function findTemplateById(id: string): ObservationTemplate | undefined {
  // Check sport-specific sets first, then fall back to default
  for (const templates of [SOCCER_TEMPLATES, FLAG_FOOTBALL_TEMPLATES, VOLLEYBALL_TEMPLATES, OBSERVATION_TEMPLATES]) {
    const found = templates.find((t) => t.id === id);
    if (found) return found;
  }
  return undefined;
}

/** All template IDs across all sports — used for validation in observer-utils. */
export function getAllTemplateIds(): Set<string> {
  const ids = new Set<string>();
  for (const templates of [OBSERVATION_TEMPLATES, SOCCER_TEMPLATES, FLAG_FOOTBALL_TEMPLATES, VOLLEYBALL_TEMPLATES]) {
    for (const t of templates) ids.add(t.id);
  }
  return ids;
}
